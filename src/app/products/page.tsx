import type { Metadata } from 'next';
import { MarketingShell } from '@/components/landing/MarketingShell';
import { SmoothScroll } from '@/components/landing/SmoothScroll';
import { ProductsLanding } from '@/components/products/landing/ProductsLanding';

export const metadata: Metadata = {
  title: 'Helm Sports Labs — Products',
  description:
    'The Helm platform for college programs: GolfHelm and BaseballHelm — track every shot, calculate 87 stats a round, and let CoachHelm find the root.',
};

export default function ProductsPage() {
  return (
    <>
      <SmoothScroll anchors />
      {/* MarketingShell carries the same header/footer/Request-Demo modal as
          /, /about and /pricing — the products body keeps its own dark
          FinalCta band, so the shell's extra CTA band stays off. */}
      <MarketingShell>
        <ProductsLanding />
      </MarketingShell>
    </>
  );
}
