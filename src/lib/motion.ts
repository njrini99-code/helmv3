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

// Framer Motion variants
export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: motion.ease.smooth }
  },
};

export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: motion.ease.out }
  },
};
