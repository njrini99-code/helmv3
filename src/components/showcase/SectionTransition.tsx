// Static section dividers with no framer-motion to avoid HMR issues
export function SectionTransition({ variant = 'default' }: { variant?: 'default' | 'fog' | 'gradient' }) {
  // Simple gradient divider with no JS animations
  if (variant === 'fog') {
    return (
      <div className="relative h-24 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-stone-800/30 to-transparent" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
    )
  }

  if (variant === 'gradient') {
    return (
      <div className="relative h-24 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-helm-primary-500/5 via-transparent to-helm-amber-500/5" />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
      </div>
    )
  }

  // Default transition
  return (
    <div className="relative h-16 overflow-hidden pointer-events-none">
      <div className="absolute top-1/2 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-helm-primary-500/50" />
    </div>
  )
}

// Reduced Motion Provider wrapper
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <div className="motion-safe:animate-in motion-reduce:animate-none">
      {children}
    </div>
  )
}
