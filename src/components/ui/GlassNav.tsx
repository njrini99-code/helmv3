"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

export function GlassNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  // Prevent body scroll when mobile menu open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <motion.header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 overflow-visible ${
          scrolled
            ? "bg-black/95 backdrop-blur-sm h-16 md:h-20"
            : "bg-black h-20 md:h-24"
        }`}
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <nav className="max-w-7xl mx-auto px-4 md:px-6 h-full flex items-center justify-between">

          {/* LOGO - Responsive sizing */}
          <Link href="/" className="group relative" onClick={() => setMobileMenuOpen(false)}>
            <motion.div
              whileHover={{ scale: 1.03 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              <Image
                src="/helm-main-logo-transparent-white-trim.png"
                alt="Helm Sports Labs"
                width={200}
                height={80}
                className="h-14 sm:h-20 md:h-32 lg:h-52 w-auto object-contain"
                priority
              />
            </motion.div>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-10">
            <div className="flex items-center gap-8">
              {[
                { href: "/baseball/login", label: "BaseballHelm" },
                { href: "/golf/login", label: "GolfHelm" },
                { href: "/about", label: "About" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="relative text-sm font-medium text-gray-400 hover:text-white
                             transition-colors duration-200"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Desktop CTA Button */}
            <motion.button
              className="relative px-5 py-2.5 text-sm font-semibold text-white rounded-lg
                         overflow-hidden group"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="absolute inset-0 bg-emerald-600 group-hover:bg-emerald-500
                              transition-colors duration-200" />
              <div className="absolute -inset-1 bg-emerald-500/30 rounded-lg blur-lg
                              opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative flex items-center gap-2">
                Book a demo
                <svg
                  className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </span>
            </motion.button>
          </div>

          {/* Mobile Menu Button - WCAG 44px minimum touch target */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-3 text-white rounded-lg hover:bg-white/10
                       transition-colors active:scale-95 min-w-[44px] min-h-[44px]
                       flex items-center justify-center"
            aria-label="Toggle mobile menu"
            aria-expanded={mobileMenuOpen}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </nav>
      </motion.header>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden"
            />

            {/* Menu Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 w-[280px] bg-black border-l border-white/10
                         z-50 md:hidden overflow-y-auto"
            >
              <div className="p-6 space-y-6">
                {/* Close Button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-3 text-white rounded-lg hover:bg-white/10
                               transition-colors min-w-[44px] min-h-[44px]"
                    aria-label="Close menu"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Mobile Nav Links - WCAG 44px minimum */}
                <nav className="space-y-2">
                  {[
                    { href: "/baseball/login", label: "BaseballHelm" },
                    { href: "/golf/login", label: "GolfHelm" },
                    { href: "/about", label: "About" },
                  ].map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block py-3 px-4 text-base font-medium text-gray-400
                                 hover:text-white hover:bg-white/5 rounded-lg
                                 transition-colors min-h-[44px] flex items-center"
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>

                {/* Mobile CTA Button */}
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-3 px-4 text-base font-semibold text-white rounded-lg
                             bg-emerald-600 hover:bg-emerald-500 transition-colors
                             min-h-[44px] flex items-center justify-center gap-2"
                >
                  Book a demo
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
