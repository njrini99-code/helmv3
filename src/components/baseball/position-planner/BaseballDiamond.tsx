'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface BaseballDiamondProps {
  children?: React.ReactNode;
  className?: string;
}

// Position coordinates on the diamond (as percentages)
export const POSITION_COORDS: Record<string, { x: number; y: number; label: string }> = {
  'C': { x: 50, y: 78, label: 'Catcher' },
  'P': { x: 50, y: 58, label: 'Pitcher' },
  'RHP': { x: 50, y: 58, label: 'RH Pitcher' },
  'LHP': { x: 50, y: 58, label: 'LH Pitcher' },
  '1B': { x: 72, y: 52, label: 'First Base' },
  '2B': { x: 62, y: 38, label: 'Second Base' },
  'SS': { x: 38, y: 38, label: 'Shortstop' },
  '3B': { x: 28, y: 52, label: 'Third Base' },
  'LF': { x: 18, y: 22, label: 'Left Field' },
  'CF': { x: 50, y: 12, label: 'Center Field' },
  'RF': { x: 82, y: 22, label: 'Right Field' },
  'OF': { x: 50, y: 22, label: 'Outfield' },
  'UTL': { x: 92, y: 85, label: 'Utility' },
};

export function BaseballDiamond({
  children,
  className,
}: BaseballDiamondProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn('relative w-full aspect-[4/3] max-w-4xl mx-auto', className)}
    >
      {/* Ambient glow behind the field */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-radial from-primary-500/8 via-primary-500/3 to-transparent blur-3xl" />
      </div>

      {/* SVG Baseball Field */}
      <svg
        viewBox="0 0 400 300"
        className="w-full h-full"
        style={{
          filter: 'drop-shadow(0 8px 32px rgba(22, 163, 74, 0.12))',
        }}
      >
        <defs>
          {/* Enhanced outfield grass gradient with richer tones */}
          <radialGradient id="outfieldGrass" cx="50%" cy="100%" r="85%" fx="50%" fy="90%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#22c55e" stopOpacity="0.9" />
            <stop offset="70%" stopColor="#16a34a" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#15803d" stopOpacity="0.8" />
          </radialGradient>

          {/* Infield grass with lighter center */}
          <radialGradient id="infieldGrass" cx="50%" cy="70%" r="45%" fx="50%" fy="65%">
            <stop offset="0%" stopColor="#4ade80" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#22c55e" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.8" />
          </radialGradient>

          {/* Premium dirt gradient with warm earth tones */}
          <radialGradient id="dirtGradient" cx="50%" cy="70%" r="50%" fx="50%" fy="60%">
            <stop offset="0%" stopColor="#d4a574" stopOpacity="0.95" />
            <stop offset="40%" stopColor="#c4956a" stopOpacity="0.9" />
            <stop offset="70%" stopColor="#b8865c" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#a67c52" stopOpacity="0.85" />
          </radialGradient>

          {/* Mound gradient with depth */}
          <radialGradient id="moundGradient" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#d4a574" stopOpacity="1" />
            <stop offset="60%" stopColor="#c4956a" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#b8865c" stopOpacity="0.9" />
          </radialGradient>

          {/* Base gradient for 3D effect */}
          <linearGradient id="baseGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>

          {/* Grass texture pattern */}
          <pattern id="grassTexture" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill="transparent" />
            <circle cx="2" cy="2" r="0.5" fill="rgba(255,255,255,0.08)" />
          </pattern>

          {/* Field lighting overlay */}
          <linearGradient id="fieldLighting" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.05)" />
          </linearGradient>

          {/* Line glow filter */}
          <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="blur" />
            <feFlood floodColor="white" floodOpacity="0.4" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Subtle shadow for depth */}
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.15" />
          </filter>
        </defs>

        {/* Field background with premium glass effect */}
        <rect
          x="5"
          y="5"
          width="390"
          height="290"
          rx="24"
          fill="url(#outfieldGrass)"
          className="transition-all duration-300"
        />

        {/* Grass texture overlay */}
        <rect
          x="5"
          y="5"
          width="390"
          height="290"
          rx="24"
          fill="url(#grassTexture)"
          opacity="0.5"
        />

        {/* Outfield arc with softer edge */}
        <path
          d="M 50,280 Q 50,120 200,80 Q 350,120 350,280"
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="2"
          strokeDasharray="8,6"
          filter="url(#lineGlow)"
        />

        {/* Warning track arc */}
        <path
          d="M 40,285 Q 40,100 200,55 Q 360,100 360,285"
          fill="none"
          stroke="rgba(139,69,19,0.2)"
          strokeWidth="16"
          strokeLinecap="round"
        />

        {/* Infield dirt diamond with premium finish */}
        <polygon
          points="200,100 280,180 200,260 120,180"
          fill="url(#dirtGradient)"
          filter="url(#softShadow)"
        />

        {/* Infield grass cutout */}
        <polygon
          points="200,125 255,180 200,235 145,180"
          fill="url(#infieldGrass)"
        />

        {/* Field lighting overlay */}
        <rect
          x="5"
          y="5"
          width="390"
          height="290"
          rx="24"
          fill="url(#fieldLighting)"
          pointerEvents="none"
        />

        {/* Base paths with glow */}
        <g filter="url(#lineGlow)">
          {/* Home to 1st */}
          <line x1="200" y1="260" x2="280" y2="180" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" />
          {/* 1st to 2nd */}
          <line x1="280" y1="180" x2="200" y2="100" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" />
          {/* 2nd to 3rd */}
          <line x1="200" y1="100" x2="120" y2="180" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" />
          {/* 3rd to Home */}
          <line x1="120" y1="180" x2="200" y2="260" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" />
        </g>

        {/* Pitcher's mound with 3D effect */}
        <ellipse
          cx="200"
          cy="180"
          rx="18"
          ry="12"
          fill="url(#moundGradient)"
          filter="url(#softShadow)"
        />
        <ellipse
          cx="200"
          cy="178"
          rx="14"
          ry="9"
          fill="rgba(255,255,255,0.1)"
        />

        {/* Pitcher's rubber */}
        <rect x="195" y="177" width="10" height="3" rx="1" fill="#f1f5f9" filter="url(#lineGlow)" />

        {/* Bases with 3D effect */}
        {/* Home plate */}
        <polygon
          points="200,264 194,258 194,252 206,252 206,258"
          fill="url(#baseGradient)"
          stroke="#cbd5e1"
          strokeWidth="1"
          filter="url(#softShadow)"
        />

        {/* First base */}
        <rect
          x="276" y="176" width="10" height="10" rx="1"
          fill="url(#baseGradient)"
          stroke="#cbd5e1"
          strokeWidth="1"
          transform="rotate(45 281 181)"
          filter="url(#softShadow)"
        />

        {/* Second base */}
        <rect
          x="195" y="95" width="10" height="10" rx="1"
          fill="url(#baseGradient)"
          stroke="#cbd5e1"
          strokeWidth="1"
          transform="rotate(45 200 100)"
          filter="url(#softShadow)"
        />

        {/* Third base */}
        <rect
          x="115" y="175" width="10" height="10" rx="1"
          fill="url(#baseGradient)"
          stroke="#cbd5e1"
          strokeWidth="1"
          transform="rotate(45 120 180)"
          filter="url(#softShadow)"
        />

        {/* Batter's boxes */}
        <rect x="175" y="248" width="12" height="20" rx="1" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
        <rect x="213" y="248" width="12" height="20" rx="1" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />

        {/* Catcher's box */}
        <rect x="188" y="270" width="24" height="16" rx="1" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />

        {/* On-deck circles */}
        <circle cx="155" y="275" r="8" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        <circle cx="245" y="275" r="8" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />

        {/* Foul lines extending to fence */}
        <line x1="200" y1="260" x2="50" y2="290" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" />
        <line x1="200" y1="260" x2="350" y2="290" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" />

        {/* Foul poles */}
        <circle cx="40" cy="292" r="3" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1" />
        <circle cx="360" cy="292" r="3" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1" />
      </svg>

      {/* Position overlays */}
      <div className="absolute inset-0 pointer-events-none">
        {children}
      </div>

      {/* Subtle corner accents */}
      <div className="absolute top-4 left-4 w-12 h-12 border-l-2 border-t-2 border-primary-400/20 rounded-tl-xl" />
      <div className="absolute top-4 right-4 w-12 h-12 border-r-2 border-t-2 border-primary-400/20 rounded-tr-xl" />
      <div className="absolute bottom-4 left-4 w-12 h-12 border-l-2 border-b-2 border-primary-400/20 rounded-bl-xl" />
      <div className="absolute bottom-4 right-4 w-12 h-12 border-r-2 border-b-2 border-primary-400/20 rounded-br-xl" />
    </motion.div>
  );
}
