/**
 * ============================================================================
 * Messaging motion + geometry vocabulary
 * ----------------------------------------------------------------------------
 * Chat physics are NOT the Fairway control physics. The shared control
 * transition is a deliberately slow, cinematic ~180ms — correct for a segmented
 * control or a card, wrong for a bubble that has to feel like it was spoken.
 * A message arriving on that curve reads as the list re-laying out.
 *
 * These live in one module because the alternative — the numbers scattered
 * across four components — is how the same gesture ends up at 140ms in one
 * place and 220ms in another, which the eye reads as inconsistency long before
 * anyone can name it.
 *
 * TUNED IN A HARNESS, NOT ON A DEVICE. Every value below is a starting point
 * from the spec, verified only in a headless render. They want a 120fps capture
 * on a physical iPhone before anyone calls them final.
 * ========================================================================== */

/** Durations in milliseconds. Framer wants seconds — use `secs()`. */
export const CHAT_MOTION = {
  /** Touch acknowledgement. Must beat the eye, not the network. */
  press: 80,
  /** Smallest state change: a chip, a count, an icon swap. */
  micro: 120,
  /** A message entering the conversation. */
  bubbleIn: 165,
  /** Sent -> Read and other metadata crossfades. */
  metadata: 140,
  /** A conversation row changing place in the inbox. */
  reorder: 210,
  /** Master-detail push/pop. */
  push: 245,
  /** Sheet present/dismiss. */
  sheet: 280,
} as const;

/** Framer takes seconds; every call site would otherwise divide by 1000. */
export const secs = (ms: number): number => ms / 1000;

/**
 * The arrival spring. No bounce — `damping` is high relative to `stiffness`
 * on purpose. A bubble that overshoots reads as playful, and a team's 6am
 * travel thread is not playful.
 */
export const bubbleSpring = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.75,
} as const;

/** Row reorder — slightly stiffer and heavier so a list settles as one object. */
export const reorderSpring = {
  type: 'spring',
  stiffness: 460,
  damping: 42,
  mass: 0.8,
} as const;

/**
 * A message rises INTO the conversation. It does not fly from the send button —
 * that reads as a gimmick the second time you see it, and it draws the eye to
 * the control rather than to what was said.
 */
export const bubbleEnter = {
  initial: { opacity: 0, y: 8, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
} as const;

/** A new sender's avatar. Scale only — a sliding avatar looks like a bug. */
export const avatarEnter = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
} as const;

/** A reaction chip appearing under a bubble. Small, quick, no spring drama. */
export const reactionEnter = {
  initial: { opacity: 0, scale: 0.92, y: -2 },
  animate: { opacity: 1, scale: 1, y: 0 },
} as const;

/**
 * Long-press acknowledgement. 1.5% and one pixel — enough that the thumb is
 * answered, small enough that it never reads as the bubble growing.
 */
export const bubbleLift = { scale: 1.015, y: -1 } as const;

/**
 * Geometry. Here for the same reason as the timings: a bubble radius chosen
 * per component is how a thread ends up with three different corner families.
 */
export const CHAT = {
  gutter: 12,
  bubbleRadius: 20,
  bubbleConnectedRadius: 6,
  bubbleMaxWidth: '78%',
  groupGap: 12,
  bubbleGap: 2,
  avatarSize: 30,
  composerFieldHeight: 44,
} as const;
