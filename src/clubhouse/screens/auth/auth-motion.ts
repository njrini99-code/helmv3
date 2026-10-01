import type { Transition, Variants } from 'framer-motion';
import { CH_DUR } from '../../lib/motion';

/**
 * The welcome's choreography, straight from the owner's design
 * (design/handoff/auth/src/login.css): the one place in Clubhouse with its own
 * easings, durations and delays, because this is a cinematic moment and not UI
 * (a scoped exception to D-64, written up in docs/clubhouse/pages/P015-auth/DESIGN.md).
 * Nothing staggers through the framework (`staggerChildren` is banned); each
 * piece carries its own delay, and the items' delay is their index times a step.
 *
 * Variants live out here so a render never builds them again. All of it animates
 * transform, opacity and the one blur of the greeting's focus-in.
 * Times are seconds from when the welcome mounts.
 */
export interface AuthCustom {
  /** Reduced motion, or Animations off in Settings: everything lands in a millisecond. */
  reduced: boolean;
  /** An item's place in the card's list, for its delay. */
  index?: number;
}

type Bezier = readonly [number, number, number, number];
const OUT: Bezier = [0.2, 0.8, 0.2, 1];
const SMOOTH: Bezier = [0.32, 0.72, 0, 1];

export const WELCOME_AT = { scrim: 0.2, mark: 0.3, date: 0.5, line1: 0.64, name: 1.05, card: 2.25, items: 2.55, itemStep: 0.14, hint: 2.8 } as const;
export const WELCOME_TAKES = { scrim: 1.4, mark: 0.7, date: 0.7, line1: 1.0, name: 1.1, card: 0.9, item: 0.6, hint: 0.7, leave: 0.42 } as const;

/** Reduced motion: a millisecond, which is what the design asks for. */
const ONE_MS = 0.001;

const tx = (takes: number, after: number, ease: Bezier, c: AuthCustom): Transition =>
  c.reduced ? { duration: ONE_MS, delay: 0 } : { duration: takes, delay: after, ease: [...ease] };

/** The welcome leaving: each piece slides 28px left and fades, together. Reduced motion fades only, over the app's quick beat. */
const leave = (c: AuthCustom) =>
  c.reduced ? { opacity: 0, transition: { duration: CH_DUR.quick } } : { opacity: 0, x: -28, transition: tx(WELCOME_TAKES.leave, 0, OUT, c) };

export const welcomeScrim: Variants = {
  hidden: { opacity: 0 },
  show: (c: AuthCustom) => ({ opacity: 1, transition: tx(WELCOME_TAKES.scrim, WELCOME_AT.scrim, OUT, c) }),
  leave,
};
export const welcomeMark: Variants = {
  hidden: { opacity: 0 },
  show: (c: AuthCustom) => ({ opacity: 1, transition: tx(WELCOME_TAKES.mark, WELCOME_AT.mark, OUT, c) }),
};
export const welcomeBody: Variants = { hidden: {}, show: {}, leave };
export const welcomeDate: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: (c: AuthCustom) => ({ opacity: 1, y: 0, transition: tx(WELCOME_TAKES.date, WELCOME_AT.date, OUT, c) }),
};
/** "Good morning," focuses in: it rises 16px out of a blur. */
export const welcomeLine1: Variants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(10px)' },
  show: (c: AuthCustom) => ({ opacity: 1, y: 0, filter: 'blur(0px)', transition: tx(WELCOME_TAKES.line1, WELCOME_AT.line1, OUT, c) }),
};
/** The name rises out of its own clipped line. */
export const welcomeName: Variants = {
  hidden: { y: '108%' },
  show: (c: AuthCustom) => ({ y: '0%', transition: tx(WELCOME_TAKES.name, WELCOME_AT.name, SMOOTH, c) }),
};
export const welcomeCard: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: (c: AuthCustom) => ({ opacity: 1, y: 0, scale: 1, transition: tx(WELCOME_TAKES.card, WELCOME_AT.card, SMOOTH, c) }),
  leave,
};
export const welcomeItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: (c: AuthCustom) => ({ opacity: 1, y: 0, transition: tx(WELCOME_TAKES.item, WELCOME_AT.items + (c.index ?? 0) * WELCOME_AT.itemStep, OUT, c) }),
};
export const welcomeHint: Variants = {
  hidden: { opacity: 0 },
  show: (c: AuthCustom) => ({ opacity: 1, transition: tx(WELCOME_TAKES.hint, WELCOME_AT.hint, OUT, c) }),
  leave,
};

/** The hand-off's timeline, in milliseconds (the lift, then the fold; the destination is asked for as the fold lands). */
export const HANDOFF_MS = { lift: 420, navigate: 1000, plain: 520, reducedNavigate: 240 } as const;
/**
 * Phone: the welcome carries on by itself once the greeting and the card have landed (the hint lands at 2.8s and takes
 * 0.7s), so sign-in flows into the dashboard with the fold and no tap (owner, 2026-10-01, Q-137). Continue still goes sooner.
 */
export const WELCOME_PHONE_AUTO_MS = 3600;
/** The form leaving on the sign-in page, before the welcome route takes over. */
export const OPENING_MS = 720;
