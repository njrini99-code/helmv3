/**
 * Physical tee-marker colours (DS-HEX).
 *
 * These name the paint on real tee-marker posts. They are real-world DATA, not
 * UI colour, so they intentionally do NOT follow the Fairway theme: they are
 * the same in light and dark mode, and they are not design tokens. Keep every
 * tee-marker hex in this one module; call sites import from here instead of
 * holding their own literals.
 *
 * Applied as inline `background`, which also keeps them clear of the
 * golf-surface ban on raw `red-*`/`amber-*`/`rose-*` Tailwind classes: that
 * rule exists to stop semantic UI colour drifting outside the token system,
 * and a black tee marker is neither semantic nor UI.
 *
 * Values are nudged off pure hues so they sit on a warm cream canvas without
 * shouting: a real marker is painted, not neon.
 *
 * Key ORDER is load-bearing. `resolveTeeSwatch` (FairwayTeeCard) scans these
 * keys in insertion order and returns the first word-boundary match.
 */
export const TEE_SWATCH: Readonly<Record<string, string>> = {
  black: '#26262b',
  blue: '#2f5fa8',
  white: '#f7f5ef',
  gold: '#c8952b',
  yellow: '#dcb43a',
  red: '#b3453f',
  green: '#3f7a4d',
  silver: '#b9bcc0',
  grey: '#8d9096',
  gray: '#8d9096',
  bronze: '#a2703f',
  copper: '#a2703f',
  purple: '#6b4f96',
  orange: '#c9743a',
  pink: '#c980a0',
  championship: '#26262b',
  tips: '#26262b',
};

/** The light swatches that need their own rim to exist on a cream card. */
export const NEEDS_RIM: ReadonlySet<string> = new Set(['white', 'silver', 'yellow', 'gold']);
