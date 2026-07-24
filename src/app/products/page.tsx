import type { Metadata } from 'next';
import { Navigation } from '@/components/landing/Navigation';
import { Footer } from '@/components/landing/Footer';
import { SmoothScroll } from '@/components/landing/SmoothScroll';
import { ProductsLanding } from '@/components/products/landing/ProductsLanding';

export const metadata: Metadata = {
  title: 'Helm Sports Labs — Products',
  description:
    'The Helm platform for college programs: GolfHelm and BaseballHelm — track every shot, calculate 87 stats a round, and let CoachHelm find the root.',
};

export default function ProductsPage() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[oklch(0.953_0.022_83)]">
      <a
        href="#products"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
      >
        Skip to products
      </a>
      <SmoothScroll anchors />
      <div className="relative z-modal">
        <Navigation />
      </div>
      <ProductsLanding />
      <Footer />
    </main>
  );
}
