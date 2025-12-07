import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '3D Terrain Map Generator',
  description: 'Generate photorealistic 3D terrain maps from GPS coordinates',
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

