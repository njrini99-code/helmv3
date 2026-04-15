import type { Metadata } from 'next'
import { Hero } from '@/components/landing/Hero'
import { Footer } from '@/components/landing/Footer'
import { SmoothScroll } from '@/components/landing/SmoothScroll'
import { NativeRedirect } from '@/components/NativeRedirect'

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

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-stone-950">
      <NativeRedirect to="/golf/login" />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg focus:shadow-lg">
        Skip to main content
      </a>
      <SmoothScroll />
      <div id="main-content">
        <Hero />
      </div>
      <Footer />
    </main>
  )
}
