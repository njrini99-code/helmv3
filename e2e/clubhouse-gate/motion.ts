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

/** The six durations of the motion vocabulary (MOTION-AND-VISUAL 3.2): press, quick, base, release, marks, reveal. */
export const VOCABULARY = ['press', 'quick', 'base', 'release', 'marks', 'reveal'] as const;

/**
 * The durations a finite animation may run for, in ms, read from tokens.css: the six vocabulary durations (`--ch-dur-press`
 * and so on, every declaration including the reduced-motion and Animations-off overrides), and 0. A retiring token's
 * duration (`--ch-dur-word`, `--ch-dur-msg-*`, ...) is not on the scale (3.2: "Delete every other duration").
 */
export function motionTokens(css: string): Set<number> {
  const values = new Set<number>([0]);
  const names = VOCABULARY.join('|');
  for (const m of css.matchAll(new RegExp(`--ch-dur-(?:${names})\\s*:\\s*([\\d.]+)(ms|s)\\s*;`, 'g'))) {
    values.add(Math.round(Number(m[1]) * (m[2] === 's' ? 1000 : 1)));
  }
  return values;
}

/** Reduce Motion is a quick fade (3.11, `CH_FADE_MS`): the one animation it allows, opacity only, on an interaction. */
export const REDUCED_FADE_MS = 180;

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
    // Under Reduce Motion every travel becomes a 180 ms opacity fade (3.11): a fade on an interaction, or the whole-page
    // crossfade, is the change still reading; anything else that moves is a break.
    const fade = finite && r.props.length > 0 && r.props.every((p) => p === 'opacity') && r.duration === REDUCED_FADE_MS;
    const fadeAllowed = fade && (phase === 'interaction' || ROUTE_FRAME.test(where));
    // These two name the element only: whether the browser runs a fade as a CSS transition or a Web Animation, and for
    // how long, varies run to run (seen on 15 Nov), while the element that moves does not.
    const who = `${target}${r.pseudo ?? ''}`;
    if (reduced) {
      if (moves && !fadeAllowed) out.add(`reduced: ${who} moves under Reduce Motion${finite ? '' : ' (a loop)'}`);
    } else if (phase === 'open' && finite && moves && !ROUTE_FRAME.test(where)) {
      out.add(`first-paint: ${who} animates as the screen opens${r.delay > 0 ? ' (delayed: a stagger)' : ''}`);
    }
  }
  return [...out].sort();
}

/** A running animation, read once after a screen has loaded and sat idle. */
export type IdleRow = { kind: string; name: string; target: string; pseudo: string | null; iterations: number | 'infinite' };

/**
 * After load and a second of idle, nothing runs (3.1: content never moves on its own; the working dots are the one loop,
 * and only while work runs). One sentence per element still animating.
 */
export function judgeIdle(rows: IdleRow[]): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (DEV_CHROME.test(r.target)) continue;
    const target = r.target.replace(/#(?:_R_[\w]+_|:r[\w]+:)/g, '');
    out.add(`idle: ${target}${r.pseudo ?? ''} ${r.name || r.kind} still runs after load${r.iterations === 'infinite' ? ' (a loop)' : ''}`.replace(/\s+/g, ' '));
  }
  return [...out].sort();
}
