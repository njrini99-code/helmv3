import type { Metadata } from 'next'
import { PricingView } from '@/components/landing/PricingView'

export const metadata: Metadata = {
  title: 'Pricing — GolfHelm',
  description:
    'GolfHelm pricing is a conversation. Tell us about your program, and we\'ll show you how GolfHelm fits.',
  openGraph: {
    title: 'Pricing — GolfHelm',
    description:
      'GolfHelm pricing is a conversation. Tell us about your program, and we\'ll show you how GolfHelm fits.',
    type: 'website',
    url: '/pricing',
  },
}

export default function PricingPage() {
  return <PricingView />
}
