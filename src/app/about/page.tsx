import type { Metadata } from 'next'
import { AboutView } from '@/components/landing/AboutView'

export const metadata: Metadata = {
  title: 'About GolfHelm',
  description:
    'GolfHelm was built by coaches tired of spreadsheets. Now we help college golf programs see every round, flag every leak, and develop every player clearly.',
  openGraph: {
    title: 'About — GolfHelm',
    description:
      'GolfHelm was built by coaches tired of spreadsheets. Now we help college golf programs see every round, flag every leak, and develop every player clearly.',
    type: 'website',
    url: '/about',
  },
}

export default function AboutPage() {
  return <AboutView />
}
