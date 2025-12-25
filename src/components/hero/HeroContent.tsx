"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function HeroContent() {
  return (
    <div className="relative z-10 max-w-2xl">
      {/* Eyebrow / Tag */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                   bg-emerald-500/10 border border-emerald-500/20 mb-6"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-sm text-emerald-400 font-medium">
          Built for recruiting weeks and real staff workflows
        </span>
      </motion.div>

      {/* Main Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.1] mb-6"
      >
        Run recruiting and
        <br />
        team management like
        <br />
        <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-400 bg-clip-text text-transparent">
          a modern program.
        </span>
      </motion.h1>

      {/* Subhead */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="text-lg md:text-xl text-gray-400 leading-relaxed mb-8 max-w-xl"
      >
        A clean command center for college staffs: recruiting pipelines,
        roster planning, and athlete development.
      </motion.p>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="flex flex-wrap items-center gap-4"
      >
        {/* Primary CTA */}
        <motion.button
          className="group relative px-6 py-3 text-base font-semibold text-white rounded-xl overflow-hidden"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-emerald-500" />

          {/* Shine effect */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
              transform: "translateX(-100%)",
              animation: "shine 1.5s ease-in-out infinite",
            }}
          />

          {/* Glow */}
          <div className="absolute -inset-1 bg-emerald-500/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <span className="relative flex items-center gap-2">
            Book a demo
            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
          </span>
        </motion.button>

        {/* Secondary CTA */}
        <motion.button
          className="group px-6 py-3 text-base font-medium text-white rounded-xl
                     border border-white/10 hover:border-white/20 hover:bg-white/5
                     transition-all duration-200"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <span className="flex items-center gap-2">
            Explore products
            <svg
              className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </motion.button>
      </motion.div>
    </div>
  );
}
