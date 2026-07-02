import type { Metadata } from 'next'
import { NativeRedirect } from '@/components/NativeRedirect'
import { LenisRoot } from '@/components/marketing/first-light/scroll/LenisRoot'
import { M1Hero } from '@/components/marketing/first-light/moments/M1Hero'
import { M2Clarity } from '@/components/marketing/first-light/moments/M2Clarity'
import { M3ProductCinema } from '@/components/marketing/first-light/moments/M3ProductCinema'
import { M4TwoFields } from '@/components/marketing/first-light/moments/M4TwoFields'
import { M5Intelligence } from '@/components/marketing/first-light/moments/M5Intelligence'
import { M6ForThePlayer } from '@/components/marketing/first-light/moments/M6ForThePlayer'
import { M7Honesty } from '@/components/marketing/first-light/moments/M7Honesty'
import { M8FinalCTA } from '@/components/marketing/first-light/moments/M8FinalCTA'
import { M9Footer } from '@/components/marketing/first-light/moments/M9Footer'
import '@/components/marketing/first-light/first-light.css'

export const metadata: Metadata = {
  title: 'Helm Sports Labs',
  description: 'The modern platform for athletic development and college recruiting.',
  openGraph: {
    title: 'Helm Sports Labs',
    description: 'The modern platform for athletic development and college recruiting.',
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
    title: 'Helm Sports Labs',
    description: 'The modern platform for athletic development and college recruiting.',
    images: ['/og/home.png'],
  },
}

// `overflow-x-clip`, NOT `overflow-x-hidden`, below is load-bearing (see
// the same documented gotcha in src/app/globals.css ~L144): the CSS
// Overflow spec promotes overflow-y to `auto` whenever overflow-x is a
// {hidden,scroll,auto} value and overflow-y is a {visible,clip} value —
// turning <main> into its own scroll container. That breaks every
// `position: sticky` descendant (PinnedScrub/M3) — sticky then pins
// relative to <main>'s own (never-scrolling) frame instead of the real
// window scroll. `clip` pairs with `visible` (both in the exempt group),
// so no promotion happens and sticky works, while still clipping the
// horizontal overflow the M1/M4/M8 full-bleed sections can produce.
export default function LandingPage() {
  return (
    <main className="min-h-dvh overflow-x-clip" style={{ backgroundColor: 'var(--fl-pine)' }}>
      <NativeRedirect to="/golf/login" />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg focus:shadow-lg">
        Skip to main content
      </a>
      <LenisRoot>
        <div id="main-content">
          <M1Hero />
          <M2Clarity />
          <M4TwoFields />
          <M3ProductCinema />
          <M5Intelligence />
          <M6ForThePlayer />
          <M7Honesty />
          <M8FinalCTA />
        </div>
        <M9Footer />
      </LenisRoot>
    </main>
  )
}
