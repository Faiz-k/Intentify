import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Intentify - AI Prompt Generator',
  description: 'Convert your screen and voice into high-quality AI prompts',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
