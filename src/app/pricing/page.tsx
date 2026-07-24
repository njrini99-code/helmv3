import type { Metadata } from 'next'
import { PricingView } from '@/components/landing/PricingView'

export const metadata: Metadata = {
  title: 'Pricing — Helm Sports Labs',
  description:
    'Helm Sports Labs is built for all levels and all budgets. Set up a quick call to see how Helm fits your program.',
  openGraph: {
    title: 'Pricing — Helm Sports Labs',
    description:
      'Helm Sports Labs is built for all levels and all budgets. Set up a quick call to see how Helm fits your program.',
    type: 'website',
    url: '/pricing',
  },
}

export default function PricingPage() {
  return <PricingView />
}
