/**
 * Fairway token values from before the 2026-09 GolfHelm contrast pass, for
 * BaseballHelm and Lift Lab only.
 *
 * The `--fw-*` tokens live on the global `:root` (src/styles/design-tokens.css),
 * and BaseballHelm renders Fairway primitives (Sheet, Button, Surface…) on them.
 * The owner decided the golf contrast pass must not change how BaseballHelm or
 * Lift Lab look (OD-17). So src/app/baseball/layout.tsx and
 * src/app/lifting/layout.tsx inject this CSS in a <style> tag (the same way
 * they inject their font variables). It comes after the global stylesheet with
 * the same selectors, so it wins while those layouts are mounted and is gone as
 * soon as they unmount.
 *
 * The role tokens the golf pass added (accent-ink, accent-fill, …) map to the
 * values the classes they replaced resolved to before it. When the golf values
 * change again, this file stays as it is: it is a snapshot of the old values,
 * not a mirror of the new ones.
 */

const LIGHT = {
  '--fw-color-canvas': 'oklch(0.953 0.022 83)',
  '--fw-color-surface': 'oklch(0.984 0.016 86)',
  '--fw-color-surface-tint': 'oklch(0.968 0.026 84)',
  '--fw-color-surface-sunken': 'oklch(0.963 0.021 84)',
  '--fw-color-elevated': 'oklch(0.993 0.016 88)',
  '--fw-color-text-secondary': 'var(--fw-color-warm-600)',
  '--fw-color-text-tertiary': 'oklch(0.535 0.015 70)',
  '--fw-color-border-subtle': 'oklch(0.862 0.013 82 / 0.95)',
  '--fw-color-border-strong': 'oklch(0.872 0.009 80)',
  '--fw-color-accent-700': 'oklch(0.488 0.124 150)',
  // Roles added by the golf pass → what the classes they replaced used.
  '--fw-color-accent-ink': 'oklch(0.488 0.124 150)', // accent-700
  '--fw-color-accent-fill': 'oklch(0.540 0.132 149.7)', // accent-650
  '--fw-color-accent-fill-hover': 'oklch(0.488 0.124 150)', // accent-750
  '--fw-color-text-on-accent-fill': 'oklch(0.994 0.006 95)', // text-on-accent
  '--fw-color-accent-wash': 'oklch(0.939 0.045 150)', // accent-100
  '--fw-color-border-control': 'oklch(0.872 0.009 80)', // border-strong
  '--fw-color-warning-text': 'var(--fw-color-warm-800)', // warning-ink
  '--fw-color-nav-icon': 'oklch(0.62 0.007 60)', // nav-text-dim
  '--fw-font-mono': 'var(--font-fairway-mono), ui-monospace, "SF Mono", monospace',
  '--fw-numeric-features': '"tnum" 1, "lnum" 1',
  '--fw-gradient-canvas':
    'radial-gradient(132% 92% at 50% -15%, oklch(0.982 0.014 86) 0%, oklch(0.970 0.020 84) 44%, transparent 78%), linear-gradient(180deg, oklch(0.973 0.018 85) 0%, oklch(0.955 0.026 83) 52%, oklch(0.934 0.034 81) 100%)',
  '--fw-viz-benchmark': 'color-mix(in oklch, var(--fw-color-text-secondary) 40%, transparent)',
  '--fw-viz-div-neg': 'oklch(0.66 0.16 55)',
  '--fw-viz-div-pos': 'oklch(0.648 0.149 149.6)',
  '--fw-viz-seq-4': 'oklch(0.62 0.16 120)',
  '--fw-viz-seq-5': 'oklch(0.70 0.17 70)',
} as const;

const DARK = {
  '--fw-color-canvas': 'oklch(0.175 0.003 150)',
  '--fw-color-surface': 'oklch(0.278 0.004 150)',
  '--fw-color-surface-tint': 'oklch(0.308 0.005 150)',
  '--fw-color-surface-sunken': 'oklch(0.140 0.003 150)',
  '--fw-color-elevated': 'oklch(0.338 0.006 150)',
  '--fw-color-text-secondary': 'oklch(0.800 0.003 150)',
  '--fw-color-text-tertiary': 'oklch(0.672 0.004 150)',
  '--fw-color-accent-700': 'oklch(0.800 0.115 150)',
  '--fw-color-accent-ink': 'oklch(0.800 0.115 150)',
  '--fw-color-accent-fill': 'oklch(0.540 0.132 149.7)',
  '--fw-color-accent-fill-hover': 'oklch(0.488 0.124 150)',
  '--fw-color-text-on-accent-fill': 'oklch(0.994 0.006 95)',
  '--fw-color-accent-wash': 'oklch(0.352 0.070 150)',
  '--fw-color-border-control': 'rgb(255 255 255 / 0.14)',
  '--fw-color-warning-text': 'oklch(0.885 0.085 82)',
  '--fw-color-nav-icon': 'oklch(0.70 0.004 150)',
  '--fw-gradient-canvas':
    'radial-gradient(120% 66% at 50% -14%, oklch(0.225 0.028 152) 0%, oklch(0.186 0.010 165) 40%, transparent 74%), linear-gradient(180deg, oklch(0.198 0.004 150) 0%, oklch(0.175 0.003 150) 55%, oklch(0.158 0.003 150) 100%)',
  // Before the pass these three had no dark value and inherited light.
  '--fw-viz-div-neg': 'oklch(0.66 0.16 55)',
  '--fw-viz-div-pos': 'oklch(0.648 0.149 149.6)',
  '--fw-viz-seq-5': 'oklch(0.70 0.17 70)',
} as const;

const block = (selector: string, vars: Record<string, string>) =>
  `${selector}{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join('')}}`;

/**
 * The active Fairway nav pill used green INK (accent-700) with the cream label
 * before the golf pass moved it to accent-fill.
 */
const NAV_PILL =
  ".fw-nav-selection,.fw-message-filters [data-slot='fw-segment-pill']{background-color:var(--fw-color-accent-700);border-color:var(--fw-color-accent-600)}" +
  ".fw-message-filters [data-slot='fw-segment'][data-state='on']{color:var(--fw-color-text-on-accent)}";

export const LEGACY_SPORT_TOKENS_CSS =
  block(':root', LIGHT) + block(".dark,[data-theme='dark']", DARK) + NAV_PILL;
