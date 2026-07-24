import type { Metadata } from 'next'
import { AboutView } from '@/components/landing/AboutView'

export const metadata: Metadata = {
  title: 'About — Helm Sports Labs',
  description:
    'Helm Sports Labs was created by two former collegiate athletes who were tired of spreadsheets and group chats — and built one premium platform for running a college program.',
  openGraph: {
    title: 'About — Helm Sports Labs',
    description:
      'Helm Sports Labs was created by two former collegiate athletes who were tired of spreadsheets and group chats — and built one premium platform for running a college program.',
    type: 'website',
    url: '/about',
  },
}

export default function AboutPage() {
  return <AboutView />
}
