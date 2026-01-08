import type { Metadata } from 'next'
import { VideoIntro } from '@/components/landing/intro'
import { Hero } from '@/components/landing/Hero'
import { Footer } from '@/components/landing/Footer'
import { SmoothScroll } from '@/components/landing/SmoothScroll'

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
    <main className="min-h-screen overflow-x-clip">
      <SmoothScroll />
      <VideoIntro videoSrc="/videos/intro.mp4">
        <Hero useVideoBackground />
      </VideoIntro>
      <Footer />
    </main>
  )
}
