'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ShowcaseGlassCardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  glow?: 'none' | 'green' | 'amber' | 'subtle'
  delay?: number
}

export function ShowcaseGlassCard({ 
  children, 
  className, 
  hover = true,
  glow = 'none',
  delay = 0
}: ShowcaseGlassCardProps) {
  const glowClasses = {
    none: '',
    green: 'hover:shadow-[0_0_60px_rgba(16,185,129,0.2)]',
    amber: 'hover:shadow-[0_0_60px_rgba(245,158,11,0.2)]',
    subtle: 'hover:shadow-[0_20px_60px_rgba(0,0,0,0.3)]',
  }

  return (
    <motion.div
      className={cn(
        'relative backdrop-blur-xl rounded-2xl border transition-all duration-500',
        'bg-white/[0.08] border-white/[0.12]',
        hover && 'hover:-translate-y-1 hover:bg-white/[0.12] hover:border-white/20',
        glowClasses[glow],
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Top shine effect */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      
      {/* Inner glow gradient */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.08] via-transparent to-transparent pointer-events-none" />
      
      <div className="relative">
        {children}
      </div>
    </motion.div>
  )
}
