import type { Metadata } from 'next';
import { MarketingShell } from '@/components/landing/MarketingShell';
import { MarketingScrollProvider } from '@/lib/motion/gsap/MarketingScrollProvider';
import { ProductsLanding } from '@/components/products/landing/ProductsLanding';

export const metadata: Metadata = {
  title: 'GolfHelm — College Golf Platform',
  description:
    'GolfHelm: track every shot live, 85 stats per round, root-cause diagnosis via CoachHelm AI, and development plans your players actually follow.',
};

export default function ProductsPage() {
  return (
    <>
      {/* Replaces the standalone <SmoothScroll>: Lenis now runs on GSAP's
          ticker and feeds ScrollTrigger, so the pinned dock and the scrubbed
          CoachHelm cascade read the same interpolated scroll position the page
          is actually painting. Two independent loops would judder. */}
      <MarketingScrollProvider anchors />
      {/* MarketingShell carries the same header/footer/Request-Demo modal as
          /, /about and /pricing — the products body keeps its own dark
          FinalCta band, so the shell's extra CTA band stays off. */}
      <MarketingShell>
        <ProductsLanding />
      </MarketingShell>
    </>
  );
}
