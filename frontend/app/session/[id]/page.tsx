'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import UnifiedCapture from '@/components/UnifiedCapture'
import PromptOutput from '@/components/PromptOutput'
import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8003'

export default function SessionPage() {
  const params = useParams()
  const sessionId = params.id as string
  const [transcript, setTranscript] = useState<string>('')
  const [screenSummary, setScreenSummary] = useState<string>('')
  const [prompts, setPrompts] = useState<{
    short_prompt?: string
    detailed_prompt?: string
    expert_prompt?: string
  } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadSessionData()
  }, [sessionId])

  const loadSessionData = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/session/${sessionId}`)
      const session = response.data
      setTranscript(session.transcript || '')
      setScreenSummary(session.screen_summary || '')
    } catch (error) {
      console.error('Failed to load session:', error)
    }
  }

  const handleGeneratePrompts = async () => {
    try {
      setLoading(true)
      const response = await axios.post(
        `${API_BASE_URL}/prompts/${sessionId}/generate`,
        {
          transcript: transcript.trim() || undefined,
          screen_summary: screenSummary.trim() || undefined,
        }
      )
      setPrompts({
        short_prompt: response.data.short_prompt,
        detailed_prompt: response.data.detailed_prompt,
        expert_prompt: response.data.expert_prompt,
      })
    } catch (error: any) {
      console.error('Failed to generate prompts:', error)
      alert(error.response?.data?.detail || 'Failed to generate prompts')
    } finally {
      setLoading(false)
    }
  }

  const hasInput = transcript.trim() || screenSummary.trim()

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Session</h1>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-2">Your request</h2>
          <p className="text-sm text-gray-600 mb-3">
            Type your request below, or use capture to record audio + screen. Transcript comes from
            recording; you can also type or edit anytime.
          </p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="e.g. Help me debug this error… / Improve my GitHub profile…"
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y min-h-[100px]"
          />
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Capture Audio & Screen</h2>
          <UnifiedCapture
            sessionId={sessionId}
            onTranscriptUpdate={(newTranscript) => setTranscript(newTranscript)}
            onScreenSummaryUpdate={(summary) => setScreenSummary(summary)}
          />
          {screenSummary && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 font-semibold mb-2">Screen summary</p>
              <p className="text-gray-800 text-sm">{screenSummary}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Generate Prompts</h2>
            <button
              onClick={handleGeneratePrompts}
              disabled={loading || !hasInput}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Generating...' : 'Generate'}
            </button>
          </div>
          <p className="text-sm text-gray-600">
            {!hasInput
              ? 'Type your request above or capture audio + screen'
              : 'Generate AI prompts from your request (and screen summary if captured)'}
          </p>
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
