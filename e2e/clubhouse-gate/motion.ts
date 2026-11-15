// Pure rules for the motion gate (e2e/clubhouse-motion-gate.spec.ts), kept apart so they are unit tested
// (e2e/clubhouse-gate/__tests__/motion.test.ts) without a browser.

export type MotionRow = {
  at: number;
  kind: string;
  name: string;
  props: string[];
  duration: number | null;
  delay: number;
  iterations: number | 'infinite';
  target: string;
  pseudo: string | null;
};

/** Properties whose animation recalculates layout on every frame (the same set the CSS ratchet and the probe use). */
export const LAYOUT_PROPS = new Set([
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'top', 'left', 'right', 'bottom', 'inset',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'margin-block', 'margin-inline',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'padding-block', 'padding-inline',
  'grid-template-rows', 'grid-template-columns', 'font-size', 'line-height', 'border-width', 'flex-basis', 'gap',
  'row-gap', 'column-gap', 'letter-spacing',
]);

/** Every duration tokens.css defines (`--ch-dur-*`), in ms, following `var()` references; 0 is always allowed. */
export function motionTokens(css: string): Set<number> {
  const values = new Set<number>([0]);
  // Each declaration, including the @media and [data-*] overrides, contributes its literal value.
  for (const m of css.matchAll(/--ch-dur-[\w-]+\s*:\s*([\d.]+)(ms|s)\s*;/g)) values.add(Math.round(Number(m[1]) * (m[2] === 's' ? 1000 : 1)));
  return values;
}

/** Next's development overlay, present only under `next dev`. */
const DEV_CHROME = /^nextjs-portal/;
/** At or under this, a run is an instant swap. */
const INSTANT_MS = 1;

/** The whole-page crossfade (shell/RouteFrame.tsx, styles/shell.css) is the one finite animation a screen may open with. */
const ROUTE_FRAME = /ch-(route|rf|vt|page)|route-?frame|view-transition/i;

/** One sentence per break, sorted and deduplicated so the known list compares exactly. */
export function judgeMotion(
  rows: MotionRow[],
  { reduced, tokens, phase = 'open' }: { reduced: boolean; tokens: Set<number>; phase?: 'open' | 'interaction' },
): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    // Next's development indicator is dev chrome, not the app (the gate hides it the same way).
    if (DEV_CHROME.test(r.target)) continue;
    // React's generated ids (useId: `_R_1ue9b5…_`, `:r3:`) change between builds, so they never name a target.
    const target = r.target.replace(/#(?:_R_[\w]+_|:r[\w]+:)/g, '');
    const where = `${target}${r.pseudo ?? ''} ${r.name || r.kind}`.trim();
    const finite = r.iterations !== 'infinite';
    // A 1 ms run is how reduced motion swaps at once and still fires animationend: it is an instant swap, not motion.
    const moves = r.duration != null && r.duration > INSTANT_MS;
    const layout = r.props.filter((p) => LAYOUT_PROPS.has(p));
    if (layout.length) out.add(`layout: ${where} animates ${layout.join(', ')}`);
    // A CSS keyframe animation runs on the --ch-dur-* scale. Two kinds are not judged here: a JS spring (a Web Animation
    // from lib/motion.ts) runs as long as its physics takes (CH_SPRINGS, pinned by its own tests), and a CSS transition
    // that is interrupted and reversed (a hover, a press) is shortened by the browser to the distance left, so its length
    // depends on timing. Transition durations are held to the tokens statically, by the CSS ratchet and lint.
    if (finite && moves && r.kind === 'CSSAnimation' && !tokens.has(r.duration!)) out.add(`token: ${where} runs ${r.duration} ms, not a --ch-dur-* duration`);
    if (reduced) {
      if (moves) out.add(`reduced: ${where} runs ${r.duration} ms${finite ? '' : ' in a loop'} under Reduce Motion`);
    } else if (phase === 'open' && finite && moves && !ROUTE_FRAME.test(where)) {
      out.add(`first-paint: ${where} animates as the screen opens${r.delay > 0 ? ` (delayed ${r.delay} ms: a stagger)` : ''}`);
    }
  }
  return [...out].sort();
}
