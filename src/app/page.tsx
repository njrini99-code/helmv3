import type { Metadata } from 'next'
import { LandingView } from '@/components/landing/LandingView'
import { NativeRedirect } from '@/components/NativeRedirect'

export const metadata: Metadata = {
  title: 'GolfHelm — College Golf Operating System',
  description:
    'GolfHelm turns every round, shot, and stat into the next coaching decision. Fewer spreadsheets. Clearer decisions. Faster recruiting.',
  openGraph: {
    title: 'GolfHelm — College Golf Operating System',
    description:
      'GolfHelm turns every round, shot, and stat into the next coaching decision. Fewer spreadsheets. Clearer decisions. Faster recruiting.',
    type: 'website',
    url: '/',
    images: [
      {
        url: '/og/home.png',
        width: 1200,
        height: 630,
        alt: 'GolfHelm — the operating system for college golf coaches',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GolfHelm — College Golf Operating System',
    description:
      'GolfHelm turns every round, shot, and stat into the next coaching decision. Fewer spreadsheets. Clearer decisions. Faster recruiting.',
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
