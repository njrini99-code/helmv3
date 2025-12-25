"use client";

import { HeroBackground } from "./HeroBackground";
import { HeroContent } from "./HeroContent";
import { ProductPreview } from "./ProductPreview";
import { TrustBadges } from "./TrustBadges";

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Background */}
      <HeroBackground />

      {/* Content Container - Mobile-first responsive padding */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 py-24 sm:py-32 lg:py-40">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-8 items-center">
          {/* Left: Content */}
          <div>
            <HeroContent />
            <TrustBadges />
          </div>

          {/* Right: Product Preview - Hidden on mobile, shown on tablet+ */}
          <div className="relative lg:pl-8 hidden sm:block">
            <ProductPreview />
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
    </section>
  );
}
