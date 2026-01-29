'use client'

import { useEffect, useState } from 'react'

interface PromptOutputProps {
  shortPrompt: string
  detailedPrompt: string
  expertPrompt: string
}

type JobTab = 'debug' | 'explain' | 'step' | 'validate' | 'production'

const JOB_TABS: { id: JobTab; label: string; promptKey: 'short' | 'detailed' | 'expert'; recommended?: boolean }[] = [
  { id: 'debug', label: 'Debug this', promptKey: 'expert' },
  { id: 'explain', label: "Explain what's failing", promptKey: 'short' },
  { id: 'step', label: 'Step-by-step fix', promptKey: 'detailed', recommended: true },
  { id: 'validate', label: 'Validate my config', promptKey: 'detailed' },
  { id: 'production', label: 'Production-ready setup', promptKey: 'expert' },
]

const BADGES = [
  { label: 'Clear Goal', emoji: '🎯' },
  { label: 'Constraints Included', emoji: '🧩' },
  { label: 'Skill Level Matched', emoji: '🧠' },
  { label: 'Screen Context Used', emoji: '🖥' },
]

export default function PromptOutput({
  shortPrompt,
  detailedPrompt,
  expertPrompt,
}: PromptOutputProps) {
  const [activeTab, setActiveTab] = useState<JobTab>('step')
  const [copiedFor, setCopiedFor] = useState<'cursor' | 'clipboard' | null>(null)

  const prompts = { short: shortPrompt, detailed: detailedPrompt, expert: expertPrompt }
  const getActivePrompt = () => prompts[JOB_TABS.find((t) => t.id === activeTab)!.promptKey]

  useEffect(() => {
    setCopiedFor(null)
  }, [activeTab])

  const copyAndNotify = async (text: string, kind: 'cursor' | 'clipboard') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedFor(kind)
      window.setTimeout(() => setCopiedFor(null), 2500)
    } catch {
      setCopiedFor(null)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Generated Prompts</h2>

      <div className="mb-4 border-b border-gray-200">
        <div className="flex flex-wrap gap-2">
          {JOB_TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 rounded-t-lg transition-colors border-b-2 text-left ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                    : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <span className="font-semibold text-sm">{tab.label}</span>
                {tab.recommended && (
                  <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Recommended
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 min-h-[200px] mb-4">
        <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
          {getActivePrompt()}
        </pre>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {BADGES.map((b) => (
          <span
            key={b.label}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700"
          >
            <span>{b.emoji}</span>
            <span>{b.label}</span>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => copyAndNotify(getActivePrompt(), 'cursor')}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white px-4 py-2.5 font-semibold hover:bg-indigo-700 transition-colors"
        >
          {copiedFor === 'cursor' ? 'Copied — paste in Cursor ✓' : 'Send to Cursor (Recommended)'}
        </button>
        <button
          type="button"
          onClick={() => copyAndNotify(getActivePrompt(), 'clipboard')}
          className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-300 bg-white text-gray-700 px-4 py-2 font-semibold hover:bg-gray-50 transition-colors"
        >
          {copiedFor === 'clipboard' ? 'Copied ✓' : 'Copy to clipboard'}
        </button>
        <a
          href="https://chat.openai.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-200 bg-white text-gray-600 px-4 py-2 font-semibold hover:bg-gray-50 transition-colors text-sm"
        >
          Open in ChatGPT
        </a>
        <a
          href="https://claude.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border-2 border-gray-200 bg-white text-gray-600 px-4 py-2 font-semibold hover:bg-gray-50 transition-colors text-sm"
        >
          Open in Claude
        </a>
      </div>
    </div>
  )
}
