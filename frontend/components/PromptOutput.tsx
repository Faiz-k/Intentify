'use client'

import { useState } from 'react'

interface PromptOutputProps {
  shortPrompt: string
  detailedPrompt: string
  expertPrompt: string
}

export default function PromptOutput({
  shortPrompt,
  detailedPrompt,
  expertPrompt,
}: PromptOutputProps) {
  const [activeTab, setActiveTab] = useState<'short' | 'detailed' | 'expert'>(
    'short'
  )

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  const getActivePrompt = () => {
    switch (activeTab) {
      case 'short':
        return shortPrompt
      case 'detailed':
        return detailedPrompt
      case 'expert':
        return expertPrompt
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Generated Prompts</h2>

      <div className="flex gap-2 mb-4 border-b">
        <button
          onClick={() => setActiveTab('short')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'short'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Short
        </button>
        <button
          onClick={() => setActiveTab('detailed')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'detailed'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Detailed
        </button>
        <button
          onClick={() => setActiveTab('expert')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'expert'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Expert
        </button>
      </div>

      <div className="relative">
        <div className="bg-gray-50 rounded-lg p-4 min-h-[200px] mb-4">
          <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
            {getActivePrompt()}
          </pre>
        </div>
        <button
          onClick={() => copyToClipboard(getActivePrompt())}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
        >
          Copy to Clipboard
        </button>
      </div>
    </div>
  )
}
