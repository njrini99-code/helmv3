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

      {/* Content Container */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* Left: Content */}
          <div>
            <HeroContent />
            <TrustBadges />
          </div>

          {/* Right: Product Preview (THE hero moment) */}
          <div className="relative lg:pl-8">
            <ProductPreview />
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
    </section>
  );
}
