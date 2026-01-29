'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import UnifiedCapture from '@/components/UnifiedCapture'
import PromptOutput from '@/components/PromptOutput'
import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8003'

type CaptureMode = 'screen_voice' | 'upload' | 'text_only'

type StructuredIntent = {
  goal: string
  current_state: string
  constraints: string[]
  tools: string[]
  skill_level: string
  desired_output: string
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

/** Keys for consultant/blocker-first format (### headers from vision service). */
type StructuredSectionKey =
  | 'feasibilityVerdict'
  | 'runnableBlocker'
  | 'whatThisIs'
  | 'whoShouldCare'
  | 'coreValueProp'
  | 'differentiation'
  | 'constraints'
  | 'risksFriction'
  | 'blockerVerdict'
  | 'whatToAskNext'
  | 'detailedObservations'

function headerToKey(header: string): StructuredSectionKey | null {
  const h = header.toLowerCase()
  if (h.includes('feasibility verdict')) return 'feasibilityVerdict'
  if (h.includes('is this runnable') || h.includes('what blocks you')) return 'runnableBlocker'
  if (h.includes('what this is')) return 'whatThisIs'
  if (h.includes('who should care') || h.includes('who shouldn\'t')) return 'whoShouldCare'
  if (h.includes('core value proposition')) return 'coreValueProp'
  if (h.includes('constraints') && !h.includes('differentiation')) return 'constraints'
  if (h.includes('differentiation that matters')) return 'differentiation'
  if (h.includes('blocker') && h.includes('verdict')) return 'blockerVerdict'
  if (h.includes('hidden costs') || (h.includes('risks') && !h.includes('blocker')) || h.includes('friction')) return 'risksFriction'
  if (h.includes('what to ask next')) return 'whatToAskNext'
  if (h.includes('detailed observations')) return 'detailedObservations'
  return null
}

/** Parse consultant/investor screen analysis (### Header format from vision service). */
function parseStructuredAnalysis(text: string): Record<StructuredSectionKey, string> {
  const sections: Partial<Record<StructuredSectionKey, string>> = {}
  const sectionRegex = /###\s*(.+?)\n([\s\S]*?)(?=###|$)/g
  let m: RegExpExecArray | null
  while ((m = sectionRegex.exec(text)) !== null) {
    const key = headerToKey(m[1].trim())
    if (key) {
      const body = m[2].trim().replace(/\n+/g, ' ').slice(0, 280)
      if (body) sections[key] = body
    }
  }
  return sections as Record<StructuredSectionKey, string>
}

/** Legacy numeric **1. ** format (backward compatibility). */
function parseLegacyStructuredAnalysis(text: string): {
  problem?: string
  targetUser?: string
  decision?: string
  questionsNext?: string
  errors?: string
} {
  const sections: Record<string, string> = {}
  const sectionRegex = /\*\*(\d+)\.\s*([^*]+)\*\*\s*([\s\S]*?)(?=\*\*\d+\.|$)/g
  let m: RegExpExecArray | null
  const titles: Record<string, string> = {
    '1': 'problem',
    '2': 'targetUser',
    '3': 'decision',
    '4': 'questionsNext',
    '5': 'errors',
  }
  while ((m = sectionRegex.exec(text)) !== null) {
    const key = titles[m[1]]
    if (key) sections[key] = m[3].trim().replace(/\n+/g, ' ').slice(0, 200)
  }
  return sections as { problem?: string; targetUser?: string; decision?: string; questionsNext?: string; errors?: string }
}

function deriveScreenUnderstanding(screenSummary: string) {
  const text = (screenSummary || '').trim()
  if (!text) {
    return {
      app: '—',
      repo: '—',
      context: '—',
      domain: '—',
      errors: '—',
      problem: '—',
      decision: '—',
      questionsNext: '—',
      whatThisIs: '—',
      whoShouldCare: '—',
      coreValueProp: '—',
      differentiation: '—',
      constraints: '—',
      risksFriction: '—',
      blockerVerdict: '—',
      feasibilityVerdict: '—',
      runnableBlocker: '—',
      whatToAskNext: '—',
      isStructured: false,
      format: 'legacy' as 'consultant' | 'legacy',
    }
  }

  const lower = text.toLowerCase()
  const consultant = parseStructuredAnalysis(text)
  const hasConsultantFormat =
    consultant.feasibilityVerdict ||
    consultant.runnableBlocker ||
    consultant.whatThisIs ||
    consultant.whoShouldCare ||
    consultant.coreValueProp ||
    consultant.constraints ||
    consultant.blockerVerdict ||
    consultant.whatToAskNext
  const legacy = parseLegacyStructuredAnalysis(text)
  const hasLegacyFormat = legacy.problem || legacy.decision || legacy.errors
  const isStructured = hasConsultantFormat || hasLegacyFormat
  const format: 'consultant' | 'legacy' = hasConsultantFormat ? 'consultant' : 'legacy'

  const leadEnd = text.indexOf('**2.') >= 0 ? text.indexOf('**2.') : text.indexOf('### Who') >= 0 ? text.indexOf('### Who') : Math.min(500, text.length)
  const lead = text.slice(0, leadEnd)
  const leadLower = lead.toLowerCase()
  // Opening: first ~240 chars. Use this to decide PRIMARY app so we don't label as "GitHub"
  // when GitHub is only mentioned later (e.g. in "Works With... Gmail, GitHub").
  const opening = text.slice(0, 240).toLowerCase()

  let app = '—'
  // 1) If the opening clearly describes a non-GitHub product, use that and never set GitHub from later text.
  if (
    opening.includes('website promoting') ||
    opening.includes('ai assistant') ||
    opening.includes('ai platform') ||
    opening.includes('promoting an ai') ||
    opening.includes('screenshot appears to be from a website') ||
    opening.includes('application or website') && (opening.includes('website') || opening.includes('platform') || opening.includes('assistant'))
  ) {
    app = 'Web app / AI platform'
  } else if (opening.includes('vscode') || opening.includes('visual studio code')) {
    app = 'VS Code'
  } else if (opening.includes('chrome') && !opening.includes('works with')) {
    app = 'Chrome'
  } else if (
    // 2) Only set GitHub when the opening itself indicates a GitHub page (not when "GitHub" appears in a list later).
    /github\.com\/[^\s]+/i.test(opening) ||
    /\b(?:repository|repo)\s+(?:on\s+)?github\b/i.test(opening) ||
    /\bon\s+github\b/i.test(opening) ||
    (/\bgithub\b/i.test(opening) && (opening.includes('repository') || opening.includes('repo')) && opening.indexOf('github') < 120)
  ) {
    app = 'GitHub'
  } else if (
    leadLower.includes('ai assistant') ||
    leadLower.includes('ai platform') ||
    leadLower.includes('promoting an ai') ||
    leadLower.includes('website promoting') ||
    leadLower.includes('what this is') ||
    leadLower.includes('what problem')
  ) {
    app = 'Web app / AI platform'
  }

  const repoFromUrlMatch = text.match(/github\.com\/[A-Za-z0-9_.-]+\/([A-Za-z0-9_.-]+)/i)
  const repoFromLabelMatch = text.match(/\b(?:repo|repository)\b[^A-Za-z0-9_.-]*([A-Za-z0-9_.-]+)/i)
  const repo = repoFromUrlMatch?.[1] || repoFromLabelMatch?.[1] || '—'

  const context =
    format === 'consultant' && consultant.whatThisIs
      ? consultant.whatThisIs.slice(0, 100) + (consultant.whatThisIs.length > 100 ? '…' : '')
      : hasLegacyFormat && legacy.problem
        ? legacy.problem.slice(0, 100) + (legacy.problem.length > 100 ? '…' : '')
        : lead.split('\n').map((l) => l.trim()).find((l) => l.length > 15)?.slice(0, 80) || '—'

  const domain =
    (lower.includes('oauth') && 'Auth / OAuth') ||
    (lower.includes('backend') && 'Backend') ||
    (lower.includes('frontend') && 'Frontend') ||
    (lower.includes('database') && 'Database') ||
    (lower.includes('docker') && 'DevOps / Docker') ||
    '—'

  const errors =
    format === 'consultant' && consultant.risksFriction
      ? consultant.risksFriction.toLowerCase().startsWith('none') ? 'None' : consultant.risksFriction.slice(0, 80)
      : hasLegacyFormat && legacy.errors
        ? legacy.errors.toLowerCase().startsWith('none') ? 'None' : legacy.errors.slice(0, 80)
        : /\b(error|failed|exception|traceback|warning)\b/i.test(text)
          ? 'Possible issues detected'
          : 'None'

  return {
    app,
    repo,
    context,
    domain,
    errors,
    problem: hasLegacyFormat && legacy.problem ? legacy.problem.slice(0, 120) : '—',
    decision: hasLegacyFormat && legacy.decision ? legacy.decision.slice(0, 120) : '—',
    questionsNext: hasLegacyFormat && legacy.questionsNext ? legacy.questionsNext.slice(0, 150) : '—',
    whatThisIs: consultant.whatThisIs ? consultant.whatThisIs.slice(0, 140) : '—',
    whoShouldCare: consultant.whoShouldCare ? consultant.whoShouldCare.slice(0, 140) : '—',
    coreValueProp: consultant.coreValueProp ? consultant.coreValueProp.slice(0, 140) : '—',
    differentiation: consultant.differentiation ? consultant.differentiation.slice(0, 140) : '—',
    constraints: consultant.constraints ? consultant.constraints.slice(0, 140) : '—',
    risksFriction: consultant.risksFriction ? consultant.risksFriction.slice(0, 140) : '—',
    blockerVerdict: consultant.blockerVerdict ? consultant.blockerVerdict.slice(0, 160) : '—',
    feasibilityVerdict: consultant.feasibilityVerdict ? consultant.feasibilityVerdict.trim().slice(0, 80) : '—',
    runnableBlocker: consultant.runnableBlocker ? consultant.runnableBlocker.slice(0, 200) : '—',
    whatToAskNext: consultant.whatToAskNext ? consultant.whatToAskNext.slice(0, 200) : '—',
    isStructured,
    format,
  }
}

function Stepper({
  activeIndex,
  completed,
}: {
  activeIndex: number
  completed: boolean[]
}) {
  const steps = ['Describe', 'Capture context', 'Understand intent', 'Generate prompts']
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {steps.map((label, idx) => {
        const isCompleted = completed[idx]
        const isActive = idx === activeIndex
        return (
          <li key={label} className="flex items-center gap-3">
            <div
              className={cx(
                'h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold border',
                isCompleted && 'bg-emerald-500 border-emerald-500 text-white',
                !isCompleted && isActive && 'bg-indigo-600 border-indigo-600 text-white',
                !isCompleted && !isActive && 'bg-white border-gray-300 text-gray-500'
              )}
            >
              {idx + 1}
            </div>
            <span
              className={cx(
                'text-sm font-medium',
                isCompleted && 'text-emerald-700',
                !isCompleted && isActive && 'text-gray-900',
                !isCompleted && !isActive && 'text-gray-500'
              )}
            >
              {label}
            </span>
            {idx < steps.length - 1 && (
              <span className="hidden sm:inline-block w-8 h-px bg-gray-200" />
            )}
          </li>
        )
      })}
    </ol>
  )
}

export default function SessionPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.id as string
  const [transcript, setTranscript] = useState<string>('')
  const [screenSummary, setScreenSummary] = useState<string>('')
  const [structuredIntent, setStructuredIntent] = useState<StructuredIntent | null>(null)
  const [prompts, setPrompts] = useState<{
    short_prompt?: string
    detailed_prompt?: string
    expert_prompt?: string
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [intentLoading, setIntentLoading] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [captureMode, setCaptureMode] = useState<CaptureMode>('screen_voice')
  const [includeScreenContext, setIncludeScreenContext] = useState(true)
  const [showFullScreenAnalysis, setShowFullScreenAnalysis] = useState(false)
  const [showRisksBlockers, setShowRisksBlockers] = useState(false)
  const [showWhatToAskNext, setShowWhatToAskNext] = useState(false)
  const [intentConfirmed, setIntentConfirmed] = useState(false)
  const [newSessionLoading, setNewSessionLoading] = useState(false)
  const requestTextareaRef = useRef<HTMLTextAreaElement>(null)

  const loadSessionData = useCallback(async () => {
    if (!sessionId) return
    setSessionLoading(true)
    setSessionError(null)
    try {
      const response = await axios.get(`${API_BASE_URL}/session/${sessionId}`)
      const session = response.data
      setTranscript(session.transcript || '')
      setScreenSummary(session.screen_summary || '')
      setStructuredIntent(session.structured_intent || null)
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.detail
          ? String(err.response.data.detail)
          : 'Failed to load session. Please refresh.'
      setSessionError(msg)
      console.error('Failed to load session:', err)
    } finally {
      setSessionLoading(false)
    }
  }, [sessionId])

  // When session ID changes (e.g. New session), clear all display state first so the UI shows a clean slate.
  useEffect(() => {
    setTranscript('')
    setScreenSummary('')
    setStructuredIntent(null)
    setPrompts(null)
    setShowFullScreenAnalysis(false)
    setShowRisksBlockers(false)
    setShowWhatToAskNext(false)
    setIntentConfirmed(false)
  }, [sessionId])

  useEffect(() => {
    loadSessionData()
  }, [loadSessionData])

  useEffect(() => {
    // Default to including screen context if we have any.
    setIncludeScreenContext(Boolean(screenSummary.trim()))
  }, [screenSummary])

  const handleExtractIntent = async () => {
    try {
      setIntentLoading(true)
      const response = await axios.post(`${API_BASE_URL}/prompts/${sessionId}/intent`, {
        transcript: transcript.trim() || undefined,
        screen_summary: includeScreenContext ? screenSummary.trim() || undefined : undefined,
      })
      setStructuredIntent(response.data.structured_intent || null)
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.detail
          ? String(err.response.data.detail)
          : 'Failed to understand intent. Please try again.'
      console.error('Failed to extract intent:', err)
      alert(msg)
    } finally {
      setIntentLoading(false)
    }
  }

  const handleGeneratePrompts = async () => {
    try {
      setLoading(true)
      const response = await axios.post(
        `${API_BASE_URL}/prompts/${sessionId}/generate`,
        {
          transcript: transcript.trim() || undefined,
          screen_summary: includeScreenContext ? screenSummary.trim() || undefined : undefined,
        }
      )
      setPrompts({
        short_prompt: response.data.short_prompt,
        detailed_prompt: response.data.detailed_prompt,
        expert_prompt: response.data.expert_prompt,
      })
      if (response.data.structured_intent) {
        setStructuredIntent(response.data.structured_intent)
      }
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) && err.response?.data?.detail
        ? String(err.response.data.detail)
        : 'Failed to generate prompts. Please try again.'
      console.error('Failed to generate prompts:', err)
      alert(msg)
    } finally {
      setLoading(false)
    }
  }

  const hasRequest = Boolean(transcript.trim())
  const hasScreen = Boolean(screenSummary.trim())
  const hasAnyInput = hasRequest || hasScreen
  const contextSatisfied = captureMode === 'text_only' || hasScreen

  const stepCompleted = [
    hasRequest,
    contextSatisfied,
    Boolean(structuredIntent),
    Boolean(prompts),
  ]

  const activeStepIndex = !hasRequest
    ? 0
    : !contextSatisfied
      ? 1
      : !structuredIntent
        ? 2
        : 3

  const understanding = deriveScreenUnderstanding(screenSummary)

  const screenTldr =
    hasScreen && understanding.format === 'consultant'
      ? [understanding.feasibilityVerdict, understanding.runnableBlocker, understanding.whatThisIs]
          .filter((s) => s && s !== '—')
          .slice(0, 2)
          .join(' ')
      : hasScreen && understanding.context !== '—'
        ? understanding.context
        : hasScreen
          ? screenSummary.slice(0, 200).replace(/\n+/g, ' ').trim() + (screenSummary.length > 200 ? '…' : '')
          : ''

  const chips: Array<{ label: string; text: string }> = [
    { label: 'I’m stuck / confused', text: "I'm stuck and confused. Here's what I tried:\n\nWhat I expected:\nWhat happened instead:\n\nPlease help me get unstuck." },
    { label: 'Explain this code', text: 'Please explain what this code does and why it is written this way.\n\nKey parts I don’t understand:' },
    { label: 'Why is this failing?', text: 'This is failing and I’m not sure why.\n\nError / symptom:\nSteps to reproduce:\nWhat I already checked:' },
    { label: 'How do I set this up?', text: 'Help me set this up end-to-end.\n\nMy environment:\nWhat I want working:\nWhat I tried:' },
  ]

  const insertChip = (text: string) => {
    setTranscript((prev) => {
      const p = prev.trim()
      return p ? `${prev}\n\n${text}` : text
    })
  }

  const handleNewSession = async () => {
    try {
      setNewSessionLoading(true)
      const response = await axios.post(`${API_BASE_URL}/session/start`, {})
      const newId = response.data?.id
      if (newId) {
        router.push(`/session/${newId}`)
      } else {
        throw new Error('No session ID returned')
      }
    } catch (err) {
      console.error('Failed to start new session:', err)
      alert('Failed to start new session. Please try again.')
    } finally {
      setNewSessionLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Intentify session</h1>
              <p className="text-sm text-gray-600 mt-1">
                Intentify doesn’t answer questions. It helps you ask the right ones.
              </p>
            </div>
            <button
              type="button"
              onClick={handleNewSession}
              disabled={newSessionLoading}
              className="shrink-0 rounded-lg border-2 border-indigo-600 bg-white px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {newSessionLoading ? 'Starting…' : 'New session'}
            </button>
          </div>
          <div className="mt-4 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
            <Stepper activeIndex={activeStepIndex} completed={stepCompleted} />
          </div>
        </div>

        {sessionLoading && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
            Loading session…
          </div>
        )}
        {sessionError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm flex justify-between items-center gap-4">
            <span>{sessionError}</span>
            <button
              type="button"
              onClick={() => loadSessionData()}
              className="shrink-0 px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">Capture context</h2>
              <p className="text-sm text-gray-600">
                Choose one mode. Context helps Intentify understand what you mean, not just what you typed.
              </p>
            </div>
            <div className="hidden md:block text-right">
              <p className="text-xs text-gray-500">Step 2 of 4</p>
              <p className="text-sm font-medium text-gray-900">Capture context</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              type="button"
              disabled={sessionLoading}
              onClick={() => setCaptureMode('screen_voice')}
              className={cx(
                'text-left rounded-xl border p-4 transition-colors',
                captureMode === 'screen_voice'
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Screen + voice</p>
                  <p className="text-xs text-gray-600 mt-1">Record audio + capture your screen (recommended).</p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">
                  Recommended
                </span>
              </div>
            </button>

            <button
              type="button"
              disabled={sessionLoading}
              onClick={() => setCaptureMode('upload')}
              className={cx(
                'text-left rounded-xl border p-4 transition-colors',
                captureMode === 'upload'
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              )}
            >
              <p className="text-sm font-semibold text-gray-900">Upload screenshot</p>
              <p className="text-xs text-gray-600 mt-1">Share a single image when recording isn’t needed.</p>
            </button>

            <button
              type="button"
              disabled={sessionLoading}
              onClick={() => setCaptureMode('text_only')}
              className={cx(
                'text-left rounded-xl border p-4 transition-colors',
                captureMode === 'text_only'
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              )}
            >
              <p className="text-sm font-semibold text-gray-900">Text only</p>
              <p className="text-xs text-gray-600 mt-1">Skip context. We’ll rely on your description.</p>
            </button>
          </div>

          <div className="mt-4">
            {captureMode === 'text_only' ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                You chose <span className="font-semibold">Text only</span>. Add more details above if the intent feels ambiguous.
              </div>
            ) : (
              <UnifiedCapture
                mode={captureMode}
                sessionId={sessionId}
                onTranscriptUpdate={(newTranscript) => setTranscript(newTranscript)}
                onScreenSummaryUpdate={(summary) => setScreenSummary(summary)}
                onCaptureSuccess={loadSessionData}
                disabled={sessionLoading}
              />
            )}
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-semibold text-gray-900">Screen Understanding (TL;DR)</p>
            {hasScreen ? (
              <>
                <blockquote className="mt-2 pl-3 border-l-2 border-indigo-200 text-sm text-gray-800 italic">
                  {screenTldr || 'Analysis in progress.'}
                </blockquote>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFullScreenAnalysis((v) => !v)}
                    className="text-sm font-medium text-indigo-700 hover:text-indigo-800"
                  >
                    {showFullScreenAnalysis ? '▼ Hide full analysis' : '▶ View full analysis'}
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setShowRisksBlockers((v) => !v)}
                    className="text-sm font-medium text-indigo-700 hover:text-indigo-800"
                  >
                    {showRisksBlockers ? '▼ Hide risks & blockers' : '▶ Show risks & blockers'}
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setShowWhatToAskNext((v) => !v)}
                    className="text-sm font-medium text-indigo-700 hover:text-indigo-800"
                  >
                    {showWhatToAskNext ? '▼ Hide what to ask next' : '▶ Show what to ask next'}
                  </button>
                </div>
                {showFullScreenAnalysis && (
                  <div className="mt-3 space-y-3 text-sm">
                    {understanding.format === 'consultant' ? (
                      <>
                        {understanding.feasibilityVerdict && understanding.feasibilityVerdict !== '—' && (
                          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                            <span className="text-xs font-semibold text-gray-500">Feasibility Verdict</span>
                            <p className={cx(
                              'mt-1 font-semibold',
                              /not currently feasible|not feasible/i.test(String(understanding.feasibilityVerdict)) && 'text-amber-700',
                              /possible with conditions/i.test(String(understanding.feasibilityVerdict)) && 'text-amber-600',
                              /^possible$/i.test(String(understanding.feasibilityVerdict).trim()) && 'text-emerald-700'
                            )}>
                              {understanding.feasibilityVerdict}
                            </p>
                          </div>
                        )}
                        {understanding.runnableBlocker !== '—' && <p className="text-gray-800">{understanding.runnableBlocker}</p>}
                        {understanding.whatThisIs !== '—' && <p className="text-gray-800">{understanding.whatThisIs}</p>}
                        {understanding.whoShouldCare !== '—' && <p className="text-gray-800">{understanding.whoShouldCare}</p>}
                        {understanding.coreValueProp !== '—' && <p className="text-gray-800">{understanding.coreValueProp}</p>}
                        {(understanding.constraints !== '—' || understanding.differentiation !== '—') && (
                          <p className="text-gray-800">{understanding.constraints !== '—' ? understanding.constraints : understanding.differentiation}</p>
                        )}
                      </>
                    ) : understanding.isStructured ? (
                      <>
                        <p className="text-gray-800">{understanding.problem}</p>
                        <p className="text-gray-800">{understanding.decision}</p>
                        <p className="text-gray-800">{understanding.questionsNext}</p>
                      </>
                    ) : (
                      <pre className="whitespace-pre-wrap text-xs text-gray-800">{screenSummary}</pre>
                    )}
                  </div>
                )}
                {showRisksBlockers && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                    {(understanding.blockerVerdict !== '—' || understanding.risksFriction !== '—') ? (
                      <p className="font-medium text-amber-900">
                        {understanding.blockerVerdict !== '—' ? understanding.blockerVerdict : understanding.risksFriction}
                      </p>
                    ) : understanding.errors !== '—' && understanding.errors !== 'None' ? (
                      <p className="text-amber-900">{understanding.errors}</p>
                    ) : (
                      <p className="text-amber-800">No blockers identified.</p>
                    )}
                  </div>
                )}
                {showWhatToAskNext && understanding.whatToAskNext !== '—' && (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm whitespace-pre-wrap text-gray-800">
                    {understanding.whatToAskNext}
                  </div>
                )}
                {showFullScreenAnalysis && understanding.format !== 'consultant' && !understanding.isStructured && (
                  <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
                    <pre className="whitespace-pre-wrap text-xs text-gray-800">{screenSummary}</pre>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Capture context above to see a TL;DR.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">Your request</h2>
              <p className="text-sm text-gray-600">
                Explain what you’re trying to do (even if it’s unclear). We’ll turn messy thoughts into a usable prompt.
              </p>
            </div>
            <div className="hidden md:block text-right">
              <p className="text-xs text-gray-500">Step 1 of 4</p>
              <p className="text-sm font-medium text-gray-900">Describe</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Transcript comes from recording; you can also type or edit anytime.
          </p>
          <textarea
            ref={requestTextareaRef}
            id="request-textarea"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={`Explain what you're trying to do, even if it's unclear.\nExample: "This repo has OAuth stuff and I'm confused how to set it up."`}
            rows={4}
            disabled={sessionLoading}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y min-h-[100px] disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                disabled={sessionLoading}
                onClick={() => insertChip(c.text)}
                className="px-3 py-1.5 rounded-full border border-gray-200 bg-white text-sm text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">Detected intent</h2>
              <p className="text-sm text-gray-600">
                Step 3 of 4 — Confirm or adjust before generating prompts.
              </p>
            </div>
            <div className="hidden md:block text-right">
              <p className="text-xs text-gray-500">Understand intent</p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={includeScreenContext}
                  onChange={(e) => setIncludeScreenContext(e.target.checked)}
                  disabled={sessionLoading || !hasScreen}
                />
                Include screen context
              </label>
              {!hasScreen && (
                <span className="text-xs text-gray-500">No screen context captured yet</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExtractIntent}
                disabled={intentLoading || sessionLoading || !hasAnyInput}
                className="bg-gray-900 text-white px-5 py-2 rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {intentLoading ? 'Understanding…' : 'Understand intent'}
              </button>
              <p className="text-sm text-gray-600">
                {!hasAnyInput ? 'Add a request or capture context first.' : 'We’ll extract a structured intent card from your inputs.'}
              </p>
            </div>

            {structuredIntent ? (
              <div className="rounded-xl border-2 border-indigo-100 bg-indigo-50/50 p-4">
                <p className="text-sm font-semibold text-gray-700">We think you&apos;re trying to:</p>
                <p className="mt-2 text-base font-medium text-gray-900">{structuredIntent.goal}</p>
                {(structuredIntent.constraints || []).length > 0 && (
                  <>
                    <p className="mt-4 text-sm font-semibold text-gray-700">Main blockers detected:</p>
                    <ul className="mt-1 text-sm text-gray-800 list-disc list-inside space-y-0.5">
                      {(structuredIntent.constraints || []).slice(0, 5).map((c, i) => (
                        <li key={`${c}-${i}`}>{c}</li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="mt-3 text-xs text-gray-600">
                  Confidence: <span className="font-medium text-indigo-700">★★★★☆ High</span>
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setIntentConfirmed(true)}
                    className="inline-flex items-center gap-2 rounded-lg border-2 border-emerald-600 bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700 hover:border-emerald-700 transition-colors"
                  >
                    ✔ Yes, that&apos;s right
                  </button>
                  <button
                    type="button"
                    onClick={() => requestTextareaRef.current?.focus({ preventScroll: false })}
                    className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-300 bg-white text-gray-700 px-4 py-2 text-sm font-semibold hover:bg-gray-50 hover:border-gray-400 transition-colors"
                  >
                    ✏️ Adjust intent
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
                No intent yet. Click <span className="font-semibold">Understand intent</span> to generate a structured card.
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Generate Prompts</h2>
            <button
              onClick={handleGeneratePrompts}
              disabled={loading || !hasAnyInput || sessionLoading}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Generating…' : 'Generate prompts'}
            </button>
          </div>
          <p className="text-sm text-gray-600">
            We’ll turn your intent into prompts you can use in any AI.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={includeScreenContext}
                onChange={(e) => setIncludeScreenContext(e.target.checked)}
                disabled={sessionLoading || !hasScreen}
              />
              Include screen context
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input type="checkbox" className="h-4 w-4" disabled checked={false} />
              Ask clarifying questions first (coming soon)
            </label>
          </div>
          {!hasAnyInput && (
            <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Add a request (Step 1) or capture context (Step 2) to continue.
            </p>
          )}
        </div>

        {prompts && (
          <PromptOutput
            shortPrompt={prompts.short_prompt || ''}
            detailedPrompt={prompts.detailed_prompt || ''}
            expertPrompt={prompts.expert_prompt || ''}
          />
        )}
      </div>
    </div>
  )
}
