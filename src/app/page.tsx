import type { Metadata } from 'next'
import { HelmLanding } from '@/components/landing/helm/HelmLanding'
import { SmoothScroll } from '@/components/landing/SmoothScroll'
import { NativeRedirect } from '@/components/NativeRedirect'

export const metadata: Metadata = {
  title: 'Helm Sports Labs — College Golf Intelligence',
  description:
    'GolfHelm is the operating system for college golf coaches — rounds, players, shots, and coaching intelligence in one coherent view.',
  openGraph: {
    title: 'Helm Sports Labs — College Golf Intelligence',
    description:
      'GolfHelm is the operating system for college golf coaches — rounds, players, shots, and coaching intelligence in one coherent view.',
    type: 'website',
    url: '/',
    images: [{ url: '/og/home.png', width: 1200, height: 630, alt: 'Helm Sports Labs' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Helm Sports Labs — College Golf Intelligence',
    description: 'The operating system for college golf coaches.',
    images: ['/og/home.png'],
  },
}

export default function LandingPage() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[oklch(0.953_0.022_83)]">
      <NativeRedirect to="/golf/login" />
      <SmoothScroll anchors />
      <HelmLanding />
    </main>
  )
}
