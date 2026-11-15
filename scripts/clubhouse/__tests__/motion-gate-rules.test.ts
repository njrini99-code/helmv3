// The motion gate's rules (e2e/clubhouse-gate/motion.ts), without a browser: each doctrine break is caught, the allowed
// motion passes, and the duration set comes from the real tokens.css.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { judgeMotion, motionTokens, type MotionRow } from '../../../e2e/clubhouse-gate/motion';

const tokens = motionTokens(readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8'));
const row = (over: Partial<MotionRow> = {}): MotionRow => ({
  at: 1200, kind: 'CSSTransition', name: 'opacity', props: ['opacity'], duration: 180, delay: 0, iterations: 1, target: 'div.ch-x', pseudo: null, ...over,
});

describe('motionTokens', () => {
  it('reads the D-64 durations and the loops from tokens.css', () => {
    for (const ms of [0, 110, 120, 180, 220, 260, 280, 300, 520, 462, 900, 1900, 2800]) expect(tokens.has(ms), `${ms} ms`).toBe(true);
    expect(tokens.has(137)).toBe(false);
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
      row({ at: 0, name: 'ch-route-in', target: 'div.ch-route-frame', duration: 220, kind: 'CSSAnimation' }),
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
    const sheet = row({ at: 10, kind: 'CSSAnimation', name: 'ch-sheet-in', props: ['transform'], duration: 462, target: 'dialog.ch-fsheet' });
    expect(judgeMotion([sheet], { reduced: false, tokens, phase: 'interaction' })).toEqual([]);
    expect(judgeMotion([sheet], { reduced: false, tokens, phase: 'open' })).toHaveLength(1);
    expect(judgeMotion([{ ...sheet, props: ['height'] }], { reduced: false, tokens, phase: 'interaction' })[0]).toMatch(/^layout: /);
  });

  it('lets a zero-length swap through under Reduce Motion', () => {
    expect(judgeMotion([row({ duration: 0 })], { reduced: true, tokens })).toEqual([]);
  });
});
