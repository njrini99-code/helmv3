import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PP_COACHES, PP_NAMES, PP_PLAN_PART } from '../../../../preview/fixtures-practice-plan';
import { printPlan } from '../PrintPlan';
import { toSheetModel } from '../sheet/plan-sheet-model';

/** The stylesheet loads with the flags off, on every page that imports it: printing anything else must not change. */
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-plan.css'), 'utf8');
const printBlock = css.slice(css.indexOf('@media print'), css.indexOf('}\n', css.indexOf('@media print')) + 2);

describe('the plan’s print rules', () => {
  it('hide the page only while a print root is on it', () => {
    expect(printBlock).toContain('body:has(> .ch-cp-print-root) > *:not(.ch-cp-print-root)');
    expect(printBlock).not.toMatch(/(^|\s)body > \*/);
  });
  it('every print selector needs the print root or the sheet', () => {
    const selectors = [...printBlock.matchAll(/^\s*([^{}@/\n]+)\{/gm)].map((m) => m[1]!.trim());
    expect(selectors.length).toBeGreaterThan(0);
    for (const s of selectors) expect(s).toMatch(/\.ch-cp-(print-root|sheet)/);
  });
  it('set no paper size for the whole app', () => {
    expect(css).not.toMatch(/@page/);
  });
});

describe('printPlan', () => {
  afterEach(() => vi.restoreAllMocks());
  it('sets the paper size for its own print and takes everything away after', async () => {
    const plan = toSheetModel({ body: PP_PLAN_PART.draft.body, title: 'Plan', team: 'Demo', start: new Date('2026-11-05T19:00:00Z'), end: null, zone: 'UTC', coaches: PP_COACHES, names: PP_NAMES, state: 'Published' }, 'coach');
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
    let during = '';
    let rootDuring = false;
    vi.spyOn(window, 'print').mockImplementation(() => {
      during = [...document.head.querySelectorAll('style')].map((s) => s.textContent).join('');
      rootDuring = document.querySelector('.ch-cp-print-root')?.getAttribute('data-ui') === 'clubhouse';
    });
    await printPlan(plan);
    expect(during).toContain('@page');
    expect(rootDuring).toBe(true);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('.ch-cp-print-root')).toBeNull();
    expect([...document.head.querySelectorAll('style')].some((s) => s.textContent?.includes('@page'))).toBe(false);
    vi.unstubAllGlobals();
  });
});
