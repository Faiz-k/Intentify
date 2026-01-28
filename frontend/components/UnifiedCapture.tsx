'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8003'

const CAPTURE_STOP_MESSAGE = 'intentify-stop-capture'

const STOP_POPUP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Intentify – Recording</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, sans-serif;
      background: #1f2937;
      color: #f3f4f6;
      padding: 12px 16px;
      min-width: 200px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      font-size: 13px;
      font-weight: 600;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    button {
      width: 100%;
      padding: 10px 16px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #dc2626; }
  </style>
</head>
<body>
  <div class="header">
    <span class="dot"></span>
    <span>Recording</span>
  </div>
  <button type="button" id="stop-btn">Stop capture</button>
  <script>
    document.getElementById('stop-btn').onclick = function() {
      if (window.opener && !window.opener.closed) {
        try { window.opener.postMessage({ type: '${CAPTURE_STOP_MESSAGE}' }, '*'); } catch (e) {}
      }
      window.close();
    };
  </script>
</body>
</html>
`

interface UnifiedCaptureProps {
  sessionId: string
  onTranscriptUpdate: (transcript: string) => void
  onScreenSummaryUpdate: (summary: string) => void
}

export default function UnifiedCapture({
  sessionId,
  onTranscriptUpdate,
  onScreenSummaryUpdate,
}: UnifiedCaptureProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const previewVideoRef = useRef<HTMLVideoElement | null>(null)
  const captureVideoRef = useRef<HTMLVideoElement | null>(null) // hidden, used for frame grab
  const stopPopupRef = useRef<Window | null>(null)
  const stopCaptureRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback(() => {
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop())
      audioStreamRef.current = null
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null
    }
    captureVideoRef.current = null
    try {
      if (stopPopupRef.current && !stopPopupRef.current.closed) {
        stopPopupRef.current.close()
      }
    } catch (_) {}
    stopPopupRef.current = null
    setIsCapturing(false)
    setIsRecording(false)
  }, [])

  const stopCapture = useCallback(() => {
    const mr = mediaRecorderRef.current
    if (!mr || mr.state === 'inactive') return
    if (mr.state === 'recording') mr.stop()
    setIsRecording(false)
    try {
      if (stopPopupRef.current && !stopPopupRef.current.closed) {
        stopPopupRef.current.close()
      }
    } catch (_) {}
    stopPopupRef.current = null
  }, [])

  stopCaptureRef.current = stopCapture

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e?.data?.type === CAPTURE_STOP_MESSAGE) {
        stopCaptureRef.current?.()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!isRecording || !screenStreamRef.current || !previewVideoRef.current) return
    const el = previewVideoRef.current
    const stream = screenStreamRef.current
    el.srcObject = stream
    el.muted = true
    el.playsInline = true
    el.play().catch(() => {})
    return () => {
      el.srcObject = null
    }
  }, [isRecording])

  const startCapture = async () => {
    try {
      setIsCapturing(true)
      const [audioStream, screenStream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ audio: true }),
        navigator.mediaDevices.getDisplayMedia({
          video: { mediaSource: 'screen' } as MediaTrackConstraints,
        }),
      ])
      audioStreamRef.current = audioStream
      screenStreamRef.current = screenStream

      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.srcObject = screenStream
      video.play().catch(() => {})
      captureVideoRef.current = video

      const mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: 'audio/webm;codecs=opus',
      })

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        const canvas = canvasRef.current
        const src = captureVideoRef.current ?? previewVideoRef.current
        if (canvas && src && src.videoWidth) {
          canvas.width = src.videoWidth
          canvas.height = src.videoHeight
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(src, 0, 0)
            uploadCapture(canvas)
          } else {
            cleanup()
          }
        } else {
          cleanup()
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)

      const blob = new Blob([STOP_POPUP_HTML], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const popup = window.open(
        url,
        'intentify-capture-control',
        'width=220,height=120,left=200,top=200,scrollbars=no,resizable=no'
      )
      if (popup) {
        stopPopupRef.current = popup
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch (error) {
      console.error('Error starting capture:', error)
      alert('Failed to start capture. Please check permissions.')
      cleanup()
    }
  }

  const uploadCapture = async (canvas: HTMLCanvasElement) => {
    try {
      setIsProcessing(true)
      const audioBlob = new Blob(audioChunksRef.current, {
        type: 'audio/webm;codecs=opus',
      })

      canvas.toBlob(
        async (screenBlob) => {
          if (!screenBlob) {
            setIsProcessing(false)
            cleanup()
            return
          }
          const formData = new FormData()
          if (audioBlob.size > 0) {
            formData.append('audio', audioBlob, 'audio.webm')
          }
          formData.append('screen', screenBlob, 'screenshot.png')
          try {
            const response = await axios.post(
              `${API_BASE_URL}/session/${sessionId}/capture`,
              formData,
              { headers: { 'Content-Type': 'multipart/form-data' } }
            )
            if (response.data.transcript) {
              onTranscriptUpdate(response.data.transcript)
            }
            if (response.data.screen_summary) {
              onScreenSummaryUpdate(response.data.screen_summary)
            }
          } catch (error) {
            console.error('Error uploading capture:', error)
            alert('Failed to process capture. Please try again.')
          } finally {
            setIsProcessing(false)
            audioChunksRef.current = []
            cleanup()
          }
        },
        'image/png'
      )
    } catch (error) {
      console.error('Error processing capture:', error)
      setIsProcessing(false)
      cleanup()
    }
  }

  const captureFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          uploadCapture(canvas)
        }
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        {!isRecording ? (
          <button
            onClick={startCapture}
            disabled={isCapturing || isProcessing}
            className="bg-red-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isCapturing ? 'Starting...' : 'Start Capture'}
          </button>
        ) : (
          <button
            onClick={stopCapture}
            className="bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-gray-700 transition-colors"
          >
            Stop Capture
          </button>
        )}
        <label className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
          Upload Image
          <input
            type="file"
            accept="image/*"
            onChange={captureFile}
            className="hidden"
            disabled={isProcessing || isRecording}
          />
        </label>
      </div>

      {isRecording && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-red-600">
            <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
            <span className="text-sm font-medium">
              Recording audio and screen. Use the floating window to stop from anywhere.
            </span>
          </div>
          <div className="relative inline-block max-w-full rounded-xl overflow-hidden border-[3px] border-amber-500 bg-black shadow-[0_0_0_2px_rgba(245,158,11,0.4)] ring-4 ring-amber-500/30">
            <div className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-gray-900 shadow">
              <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
              Capturing this
            </div>
            <video
              ref={previewVideoRef}
              autoPlay
              playsInline
              muted
              className="block max-h-[280px] w-auto max-w-full object-contain"
            />
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="text-sm text-gray-600">
          Processing audio and screen...
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
