import type { Metadata } from 'next'
import { LandingView } from '@/components/landing/LandingView'
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
    images: [
      {
        url: '/og/home.png',
        width: 1200,
        height: 630,
        alt: 'Helm Sports Labs logo on white background',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Helm Sports Labs — College Golf Intelligence',
    description:
      'GolfHelm is the operating system for college golf coaches — rounds, players, shots, and coaching intelligence in one coherent view.',
    images: ['/og/home.png'],
  },
}

export default function LandingPage() {
  return (
    <>
      <NativeRedirect to="/golf/login" />
      <LandingView />
    </>
  )
}
