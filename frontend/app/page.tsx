'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8003'

export default function Home() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleStartSession = async () => {
    try {
      setLoading(true)
      const response = await axios.post(`${API_BASE_URL}/session/start`, {})
      const sessionId = response.data.id
      router.push(`/session/${sessionId}`)
    } catch (error) {
      console.error('Failed to start session:', error)
      alert('Failed to start session. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Intentify</h1>
        <p className="text-gray-600 mb-6">
          Convert your screen and voice into high-quality AI prompts
        </p>
        <button
          onClick={handleStartSession}
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Starting...' : 'Start New Session'}
        </button>
      </div>
    </div>
  )
}
