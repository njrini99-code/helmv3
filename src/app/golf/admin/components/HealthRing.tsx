'use client';

import { useEffect, useState } from 'react';
import { motion, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthBreakdown {
  label: string;
  value: number;
  max: number;
  color?: string;
}

export interface HealthRingProps {
  score: number; // 0-100
  size?: number;
  strokeWidth?: number;
  breakdown?: HealthBreakdown[];
  onClick?: () => void;
  label?: string;
  sublabel?: string;
}

// ---------------------------------------------------------------------------
// Get color based on score
// ---------------------------------------------------------------------------

function getScoreColor(score: number): { primary: string; secondary: string; text: string } {
  if (score >= 80) {
    return {
      primary: '#10B981', // primary-500
      secondary: '#34D399', // primary-400
      text: 'text-primary-600',
    };
  }
  if (score >= 60) {
    return {
      primary: '#F59E0B', // amber-500
      secondary: '#FBBF24', // amber-400
      text: 'text-amber-600',
    };
  }
  return {
    primary: '#EF4444', // red-500
    secondary: '#F87171', // red-400
    text: 'text-red-600',
  };
}

// ---------------------------------------------------------------------------
// Animated Score Display
// ---------------------------------------------------------------------------

function AnimatedScore({ score }: { score: number }) {
  const spring = useSpring(0, { 
    stiffness: 100, 
    damping: 30,
    restDelta: 0.001 
  });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    spring.set(score);
    return spring.on('change', (latest) => {
      setDisplay(Math.round(latest));
    });
  }, [spring, score]);

  return <>{display}</>;
}

// ---------------------------------------------------------------------------
// HealthRing Component
// ---------------------------------------------------------------------------

export function HealthRing({
  score,
  size = 200,
  strokeWidth = 16,
  breakdown,
  onClick,
  label = 'Health Score',
  sublabel,
}: HealthRingProps) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    const timer = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fillLength = (score / 100) * circumference;
  const { primary, secondary, text } = getScoreColor(score);

  const gradientId = `health-ring-gradient-${score}`;

  return (
    <motion.div
      onClick={onClick}
      whileHover={onClick ? { scale: 1.02 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      className={cn(
        'relative bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6',
        'transition-all duration-300 hover:bg-white/80 hover:shadow-card-hover',
        onClick && 'cursor-pointer'
      )}
    >
      <div className="flex flex-col items-center">
        {/* Ring SVG */}
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={primary} />
                <stop offset="100%" stopColor={secondary} />
              </linearGradient>
            </defs>

            {/* Background ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#F5F5F0"
              strokeWidth={strokeWidth}
            />

            {/* Progress ring with gradient */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={mounted ? circumference - fillLength : circumference}
              className="transition-all duration-1000 ease-out"
              style={{
                filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))',
              }}
            />
          </svg>

          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-5xl font-bold tabular-nums', text)}>
              <AnimatedScore score={score} />
            </span>
            <span className="text-sm text-warm-400 font-medium mt-1">/ 100</span>
          </div>
        </div>

        {/* Label */}
        <div className="mt-4 text-center">
          <p className="text-lg font-semibold text-warm-900">{label}</p>
          {sublabel && (
            <p className="text-sm text-warm-500 mt-0.5">{sublabel}</p>
          )}
        </div>

        {/* Breakdown items */}
        {breakdown && breakdown.length > 0 && (
          <div className="mt-6 w-full space-y-3">
            {breakdown.map((item, i) => {
              const pct = item.max > 0 ? (item.value / item.max) * 100 : 0;
              const itemColor = item.color || getScoreColor(pct).primary;
              
              return (
                <div key={i} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-warm-600">{item.label}</span>
                    <span className="text-sm font-medium text-warm-900 tabular-nums">
                      {item.value}/{item.max}
                    </span>
                  </div>
                  <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: mounted ? `${Math.min(pct, 100)}%` : 0 }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.1, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: itemColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Click hint */}
        {onClick && (
          <p className="mt-4 text-xs text-warm-400 opacity-0 group-hover:opacity-100 transition-opacity">
            Click to view details
          </p>
        )}
      </div>
    </motion.div>
  );
}

export default HealthRing;
