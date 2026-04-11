/**
 * iOS-native animation constants.
 *
 * These values mirror Apple's UIKit animation curves and durations.
 * Use them in framer-motion transitions, CSS transitions, and web animations
 * to make the app feel consistently native on iOS.
 *
 * See: https://developer.apple.com/design/human-interface-guidelines/motion
 */

// ═══════════════════════════════════════════════════════════════════════════
// EASING CURVES
// ═══════════════════════════════════════════════════════════════════════════

/** Standard iOS ease-out — for most UI transitions (nav, reveal, fade) */
export const IOS_EASE = [0.25, 0.1, 0.25, 1] as const;

/** iOS sheet presentation curve — for bottom sheets, modals, drawers */
export const IOS_SPRING = [0.32, 0.72, 0, 1] as const;

/** iOS navigation transition curve — smooth push/pop */
export const IOS_SMOOTH = [0.16, 1, 0.3, 1] as const;

/** iOS alert dismiss curve — sharper, snappier */
export const IOS_SHARP = [0.4, 0, 0.6, 1] as const;

// ═══════════════════════════════════════════════════════════════════════════
// DURATIONS (in seconds for framer-motion, ms variants below)
// ═══════════════════════════════════════════════════════════════════════════

/** 150ms — quick state changes (hover, focus, button press feedback) */
export const IOS_DURATION_FAST = 0.15;

/** 250ms — standard UI transitions (fade, reveal) */
export const IOS_DURATION_NORMAL = 0.25;

/** 350ms — nav transitions, sheet presentation */
export const IOS_DURATION_SLOW = 0.35;

/** 500ms — large state changes (page transition) */
export const IOS_DURATION_XL = 0.5;

// Millisecond variants for CSS transitions
export const IOS_DURATION_FAST_MS = 150;
export const IOS_DURATION_NORMAL_MS = 250;
export const IOS_DURATION_SLOW_MS = 350;
export const IOS_DURATION_XL_MS = 500;

// ═══════════════════════════════════════════════════════════════════════════
// COMMON TRANSITIONS — ready-to-use framer-motion transition objects
// ═══════════════════════════════════════════════════════════════════════════

export const iosTransition = {
  /** Standard fade + slide */
  standard: {
    duration: IOS_DURATION_NORMAL,
    ease: IOS_EASE,
  },

  /** Sheet / bottom sheet / modal presentation */
  sheet: {
    duration: IOS_DURATION_SLOW,
    ease: IOS_SPRING,
  },

  /** Quick button/interactive feedback */
  tap: {
    duration: IOS_DURATION_FAST,
    ease: IOS_EASE,
  },

  /** Page / nav transition */
  page: {
    duration: IOS_DURATION_SLOW,
    ease: IOS_SMOOTH,
  },

  /** Dismiss / close animation */
  dismiss: {
    duration: IOS_DURATION_FAST,
    ease: IOS_SHARP,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SPRING CONFIG — for framer-motion's type: 'spring' transitions
// ═══════════════════════════════════════════════════════════════════════════

/** Default iOS spring — matches UIKit's default animation spring */
export const iosSpring = {
  type: 'spring' as const,
  stiffness: 280,
  damping: 30,
  mass: 1,
};

/** Snappy iOS spring — for quick reveals */
export const iosSpringSnappy = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 35,
  mass: 0.8,
};

/** Soft iOS spring — for gentle overshoots (e.g., notification banners) */
export const iosSpringSoft = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 25,
  mass: 1.2,
};
