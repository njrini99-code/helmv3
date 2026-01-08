'use client'

import Link from 'next/link'
import Image from 'next/image'
import { MobileNav } from './MobileNav'

export function Navigation() {
  return (
    <nav className="relative z-[60] pointer-events-auto pt-3 pb-2 md:pt-4 md:pb-2">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] md:gap-6">
        {/* Logo on left */}
        <div className="flex items-center gap-2 justify-self-start">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/Helm-Logo-New-Main.png"
              alt="Helm"
              width={72}
              height={72}
              className="w-[56px] h-[56px] sm:w-[64px] sm:h-[64px] md:w-[72px] md:h-[72px] object-contain"
            />
            <span className="font-semibold text-white text-base sm:text-lg">Helm Sports Labs</span>
          </Link>
        </div>

        {/* Floating pill navigation - centered */}
        <div className="hidden md:grid grid-cols-3 items-center gap-1 justify-self-center
                        bg-white/[0.05] backdrop-blur-3xl
                        border border-white/[0.08]
                        rounded-full px-1.5 py-1.5
                        shadow-[0_1px_15px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <Link
            href="/"
            className="w-24 py-2 rounded-full text-[13px] font-medium tracking-[-0.01em] text-center
                       text-white/70 hover:text-white/90 hover:bg-white/[0.06]
                       transition-all duration-200 ease-out"
          >
            Home
          </Link>
          <Link
            href="/about"
            className="w-24 py-2 rounded-full text-[13px] font-medium tracking-[-0.01em] text-center
                       text-white/70 hover:text-white/90 hover:bg-white/[0.06]
                       transition-all duration-200 ease-out"
          >
            About
          </Link>
          <Link
            href="/products"
            className="w-24 py-2 rounded-full text-[13px] font-medium tracking-[-0.01em] text-center
                       text-white/70 hover:text-white/90 hover:bg-white/[0.06]
                       transition-all duration-200 ease-out"
          >
            Products
          </Link>
        </div>

        {/* Mobile Nav */}
        <div className="flex items-center justify-self-end">
          <MobileNav />
        </div>
      </div>
    </nav>
  )
}
