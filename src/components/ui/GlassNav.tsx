"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

export function GlassNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 overflow-visible ${
        scrolled
          ? "bg-black/95 backdrop-blur-sm h-20"
          : "bg-black h-24"
      }`}
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Black bar - full width */}
      <nav className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">

        {/* LOGO ONLY - NO TEXT (name is in the logo) */}
        <Link href="/" className="group relative">
          <motion.div
            whileHover={{ scale: 1.03 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <Image
              src="/helm-main-logo-transparent-white-trim.png"
              alt="Helm Sports Labs"
              width={200}
              height={80}
              className="h-52 w-auto object-contain"
              priority
            />
          </motion.div>
        </Link>

        {/* ========== NAV LINKS (RIGHT SIDE) ========== */}
        <div className="hidden md:flex items-center gap-10">

          {/* Navigation */}
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

          {/* CTA Button */}
          <motion.button
            className="relative px-5 py-2.5 text-sm font-semibold text-white rounded-lg
                       overflow-hidden group"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {/* Background */}
            <div className="absolute inset-0 bg-emerald-600 group-hover:bg-emerald-500
                            transition-colors duration-200" />

            {/* Glow on hover */}
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

        {/* Mobile menu button (optional) */}
        <button className="md:hidden p-2 text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </nav>
    </motion.header>
  );
}
