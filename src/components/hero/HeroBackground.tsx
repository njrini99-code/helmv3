"use client";

import { motion } from "framer-motion";

export function HeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base dark gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-[#0a0a0a] to-[#111111]" />

      {/* Primary gradient orb - top left, guides eye toward content */}
      <motion.div
        className="absolute -top-[300px] -left-[200px] w-[800px] h-[800px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{
          scale: [1, 1.05, 1],
          opacity: [0.6, 0.8, 0.6],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Secondary orb - bottom right, creates depth */}
      <motion.div
        className="absolute -bottom-[200px] right-[10%] w-[600px] h-[600px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(5, 150, 105, 0.12) 0%, transparent 70%)",
          filter: "blur(100px)",
        }}
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.5, 0.7, 0.5],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
      />

      {/* Tertiary accent - subtle, near product area */}
      <motion.div
        className="absolute top-[20%] right-[15%] w-[400px] h-[400px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(52, 211, 153, 0.08) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{
          y: [0, -20, 0],
          opacity: [0.4, 0.6, 0.4],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
      />

      {/* Noise texture overlay */}
      <div className="absolute inset-0 bg-noise opacity-[0.03]" />

      {/* Subtle vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 100%)",
        }}
      />
    </div>
  );
}
