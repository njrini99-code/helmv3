export const motion = {
  duration: {
    instant: 0,
    fast: 150,
    base: 220,
    slow: 320,
    dramatic: 500,
  },
  ease: {
    out: [0.33, 1, 0.68, 1],
    inOut: [0.65, 0, 0.35, 1],
    spring: [0.34, 1.56, 0.64, 1],
    smooth: [0.16, 1, 0.3, 1],
  },
  distance: {
    micro: 2,
    small: 4,
    medium: 8,
    large: 24,
  },
} as const;

// Framer Motion variants — standardized to iOS-native motion tokens.
// See src/lib/ios-animations.ts for the canonical duration + easing constants.
// (These values are intentionally kept inline to avoid a circular dep with
// components that import `motion` from this file.)
export const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    // 250ms / iOS ease-out — the standard UI reveal
    transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    // Fast 40ms stagger — slow staggers feel sluggish on iOS.
    transition: { staggerChildren: 0.04 },
  },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

// Calendar spring configs for framer-motion
export const calendarSpring = {
  dragLift: { type: 'spring' as const, stiffness: 300, damping: 25, mass: 0.8 },
  snapToGrid: { type: 'spring' as const, stiffness: 400, damping: 30, mass: 0.5 },
  modalEntry: { type: 'spring' as const, stiffness: 260, damping: 20, mass: 0.8 },
  viewTransition: { type: 'spring' as const, stiffness: 200, damping: 26, mass: 1.0 },
} as const;
