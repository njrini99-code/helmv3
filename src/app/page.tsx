import { Navigation } from '@/components/landing/Navigation'
import { Hero } from '@/components/landing/Hero'
import { ProductShowcases } from '@/components/landing/ProductShowcases'
import { Features } from '@/components/landing/Features'
import { SocialProof } from '@/components/landing/SocialProof'
import { FinalCTA } from '@/components/landing/FinalCTA'
import { Footer } from '@/components/landing/Footer'
import { ScrollProgress } from '@/components/landing/ScrollProgress'

export default function LandingPage() {
  return (
    // CRITICAL: Use overflow-x-clip instead of overflow-x-hidden
    // overflow-hidden creates a new scroll context that breaks position: sticky
    // overflow-clip clips content without creating a scroll container
    <main className="min-h-screen bg-warm-cream overflow-x-clip">
      <ScrollProgress />
      <Navigation />

      {/* Hero - Golden hour gradient, emotional headline */}
      <Hero />

      {/* Cinematic Product Showcases - Scroll-driven flyovers (lazy loaded) */}
      <ProductShowcases />

      {/* Features - Scroll-driven particle explosion + carousel (lazy loaded) */}
      <Features />

      {/* Subtle divider */}
      <div className="relative h-px bg-gradient-to-r from-transparent via-stone-200 to-transparent" />

      {/* Social Proof - Stats & testimonial */}
      <SocialProof />

      {/* Subtle divider */}
      <div className="relative h-px bg-gradient-to-r from-transparent via-stone-200 to-transparent" />

      {/* Final CTA - Emotional close with sunset gradient */}
      <FinalCTA />

      {/* Footer - Clean & minimal */}
      <Footer />
    </main>
  )
}
