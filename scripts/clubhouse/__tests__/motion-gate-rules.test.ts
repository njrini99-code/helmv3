// The motion gate's rules (e2e/clubhouse-gate/motion.ts), without a browser: each doctrine break is caught, the allowed
// motion passes, and the duration set comes from the real tokens.css.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { judgeIdle, judgeMotion, motionTokens, type MotionRow } from '../../../e2e/clubhouse-gate/motion';

const tokens = motionTokens(readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8'));
const row = (over: Partial<MotionRow> = {}): MotionRow => ({
  at: 1200, kind: 'CSSTransition', name: 'opacity', props: ['opacity'], duration: 180, delay: 0, iterations: 1, target: 'div.ch-x', pseudo: null, ...over,
});

describe('motionTokens', () => {
  it('reads the six vocabulary durations from tokens.css and nothing else (MOTION-AND-VISUAL 3.2)', () => {
    expect([...tokens].sort((a, b) => a - b)).toEqual([0, 110, 180, 260, 280, 360, 520]);
    // A retiring token's duration is off the scale: the old message beats, a word's rise, the loops.
    for (const ms of [120, 150, 200, 220, 250, 320, 420, 462, 900, 1900, 2800]) expect(tokens.has(ms), `${ms} ms`).toBe(false);
  });
});

describe('judgeMotion', () => {
  it('passes a token-timed opacity or transform change on an interaction', () => {
    expect(judgeMotion([row(), row({ props: ['transform'], duration: 260 })], { reduced: false, tokens, phase: 'interaction' })).toEqual([]);
  });
  it('counts any finite animation while a screen opens on its own as first paint, whenever hydration lands', () => {
    expect(judgeMotion([row({ at: 2400, kind: 'CSSAnimation', name: 'ch-qc-fade', target: 'ul.qc-starts' })], { reduced: false, tokens })[0]).toMatch(/^first-paint: ul\.qc-starts/);
  });
  it('ignores the Next dev overlay, treats 1 ms as an instant swap, and lets a JS spring run its physics length', () => {
    expect(judgeMotion([row({ target: 'nextjs-portal', props: ['letter-spacing'] })], { reduced: true, tokens })).toEqual([]);
    expect(judgeMotion([row({ duration: 1, name: 'ch-fade', kind: 'CSSAnimation' })], { reduced: true, tokens })).toEqual([]);
    expect(judgeMotion([row({ kind: 'Animation', name: '', duration: 350 })], { reduced: false, tokens, phase: 'interaction' })).toEqual([]);
    expect(judgeMotion([row({ kind: 'Animation', name: '', duration: 350 })], { reduced: true, tokens })[0]).toMatch(/^reduced: /);
  });
  it('passes the whole-page crossfade on first paint and a loop on any frame', () => {
    expect(judgeMotion([
      row({ at: 0, name: 'ch-route-in', target: 'div.ch-route-frame', duration: 180, kind: 'CSSAnimation' }),
      row({ at: 0, name: 'ch-shimmer', iterations: 'infinite', duration: 1900, kind: 'CSSAnimation' }),
    ], { reduced: false, tokens })).toEqual([]);
  });
  it('fails a layout property, an off-token duration, a first-paint entrance and a stagger', () => {
    const out = judgeMotion([
      row({ props: ['height'], target: 'div.ch-acc' }),
      row({ duration: 137, target: 'div.ch-odd', kind: 'CSSAnimation', name: 'ch-odd-in' }),
      row({ at: 40, kind: 'CSSAnimation', name: 'ch-rise', props: ['opacity', 'transform'], target: 'li.ch-row', delay: 80 }),
    ], { reduced: false, tokens });
    expect(out.some((b) => /^layout: div\.ch-acc .* height$/.test(b))).toBe(true);
    expect(out.some((b) => /^token: div\.ch-odd .* 137 ms/.test(b))).toBe(true);
    // An interrupted transition is shortened by the browser, so its length is not judged at run time.
    expect(judgeMotion([row({ duration: 155, name: 'background-color', props: ['background-color'] })], { reduced: false, tokens, phase: 'interaction' })).toEqual([]);
    expect(out.some((b) => /^first-paint: li\.ch-row animates .*stagger/.test(b))).toBe(true);
  });
  it('fails anything that runs under Reduce Motion, loops included', () => {
    const out = judgeMotion([row({ at: 2000 }), row({ iterations: 'infinite', duration: 1900, name: 'ch-shimmer' })], { reduced: true, tokens });
    expect(out).toHaveLength(2);
    expect(out.every((b) => b.startsWith('reduced: '))).toBe(true);
  });
  it('judges an interaction without the first-paint rule, but keeps layout and token rules', () => {
    const sheet = row({ at: 10, kind: 'CSSAnimation', name: 'ch-sheet-in', props: ['transform'], duration: 520, target: 'dialog.ch-fsheet' });
    expect(judgeMotion([sheet], { reduced: false, tokens, phase: 'interaction' })).toEqual([]);
    expect(judgeMotion([sheet], { reduced: false, tokens, phase: 'open' })).toHaveLength(1);
    expect(judgeMotion([{ ...sheet, props: ['height'] }], { reduced: false, tokens, phase: 'interaction' })[0]).toMatch(/^layout: /);
  });

  it('lets a zero-length swap through under Reduce Motion', () => {
    expect(judgeMotion([row({ duration: 0 })], { reduced: true, tokens })).toEqual([]);
  });

  it('under Reduce Motion allows only a 180 ms opacity fade, on an interaction or as the page crossfade (3.11)', () => {
    const fade = row({ kind: 'CSSAnimation', name: 'ch-fade', props: ['opacity'], duration: 180, target: 'dialog.ch-fsheet' });
    expect(judgeMotion([fade], { reduced: true, tokens, phase: 'interaction' })).toEqual([]);
    expect(judgeMotion([{ ...fade, target: 'div.ch-route-frame', name: 'ch-route-in' }], { reduced: true, tokens })).toEqual([]);
    // First paint is still, under Reduce Motion too.
    expect(judgeMotion([fade], { reduced: true, tokens })[0]).toMatch(/^reduced: dialog\.ch-fsheet/);
    // A travel, or a fade of any other length, still breaks.
    expect(judgeMotion([{ ...fade, props: ['opacity', 'transform'] }], { reduced: true, tokens, phase: 'interaction' })).toHaveLength(1);
    expect(judgeMotion([{ ...fade, duration: 260 }], { reduced: true, tokens, phase: 'interaction' })).toHaveLength(1);
  });
});

describe('judgeIdle', () => {
  it('names everything still running after load, loops marked, dev chrome ignored (3.1)', () => {
    expect(
      judgeIdle([
        { kind: 'CSSAnimation', name: 'ch-live', target: 'span.ch-cal-now', pseudo: null, iterations: 'infinite' },
        { kind: 'CSSTransition', name: 'opacity', target: 'div.ch-x', pseudo: '::after', iterations: 1 },
        { kind: 'CSSAnimation', name: 'pulse', target: 'nextjs-portal', pseudo: null, iterations: 'infinite' },
      ]),
    ).toEqual(['idle: div.ch-x::after opacity still runs after load', 'idle: span.ch-cal-now ch-live still runs after load (a loop)']);
    expect(judgeIdle([])).toEqual([]);
  });
});
