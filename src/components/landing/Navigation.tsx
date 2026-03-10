'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { MobileNav } from './MobileNav'

export function Navigation() {
  const pathname = usePathname()
  const isProductsPage = pathname === '/products'
  
  return (
    <nav className={`z-[60] pointer-events-auto pt-1.5 pb-1 md:pt-2 md:pb-1 ${
      isProductsPage
        ? 'relative'
        : 'fixed top-0 left-0 right-0 backdrop-blur-xl'
    }`}
      style={!isProductsPage ? { background: 'rgba(0, 0, 0, 0.3)' } : undefined}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] md:gap-6">
        {/* Logo on left */}
        <div className="flex items-center gap-2 justify-self-start">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/Helm-Logo-New-Main.png"
              alt="Helm"
              width={72}
              height={72}
              className="w-[40px] h-[40px] sm:w-[44px] sm:h-[44px] md:w-[48px] md:h-[48px] object-contain"
            />
            <span className={`font-semibold text-base sm:text-lg transition-colors duration-200 ${
              isProductsPage ? 'text-neutral-900' : 'text-white'
            }`}>
              Helm Sports Labs
            </span>
          </Link>
        </div>

        {/* Navigation links */}
        {isProductsPage ? (
          /* Products page: floating sticky pill */
          <div className="hidden md:fixed md:top-4 md:left-1/2 md:-translate-x-1/2 md:z-[70] md:grid grid-cols-3 items-center gap-1
                          backdrop-blur-2xl bg-[rgba(237,232,221,0.55)] border border-white/50 rounded-full px-1.5 py-1.5
                          shadow-[0_4px_20px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.03)]">
            <Link href="/" className="w-24 py-2 rounded-full text-[13px] font-medium tracking-[-0.01em] text-center text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 transition-colors duration-200">Home</Link>
            <Link href="/about" className="w-24 py-2 rounded-full text-[13px] font-medium tracking-[-0.01em] text-center text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 transition-colors duration-200">About</Link>
            <Link href="/products" className="w-24 py-2 rounded-full text-[13px] font-medium tracking-[-0.01em] text-center text-neutral-900 hover:bg-neutral-100 transition-colors duration-200">Products</Link>
          </div>
        ) : (
          /* Landing page: inline links spread in nav */
          <div className="hidden md:flex items-center gap-14 justify-self-center">
            <Link href="/" className="text-[13px] font-medium text-white/90 hover:text-white transition-colors duration-200">Home</Link>
            <Link href="/about" className="text-[13px] font-medium text-white/70 hover:text-white transition-colors duration-200">About</Link>
            <Link href="/products" className="text-[13px] font-medium text-white/70 hover:text-white transition-colors duration-200">Products</Link>
          </div>
        )}

        {/* Login Button + Mobile Nav */}
        <div className={`flex items-center gap-3 ${
          isProductsPage
            ? 'md:fixed md:top-4 md:right-6 md:z-[70] justify-self-end'
            : 'justify-self-end'
        }`}>
          {/* Desktop Login Button */}
          <Link
            href="/golf/login"
            className={`hidden md:block px-4 py-2 rounded-full text-[13px] font-medium tracking-[-0.01em]
                       transition-colors duration-200 ease-out ${
                         isProductsPage
                           ? 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 border border-neutral-200'
                           : 'text-white/80 hover:text-white hover:bg-white/[0.08] border border-white/[0.15]'
                       }`}
          >
            Log in
          </Link>
          <MobileNav isProductsPage={isProductsPage} />
        </div>
      </div>
    </nav>
  )
}
