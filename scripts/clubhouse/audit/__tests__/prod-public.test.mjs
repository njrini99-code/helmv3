// The logged-out production lane may open only production or loopback, lets no write or telemetry out, and fails a page
// on each budget it breaks. These pin the pure parts; the lane's own run is the evidence for the browser part.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUDGETS_PATH, checkBase, classify, judge, visible } from '../prod-public.mjs';

const budgets = JSON.parse(readFileSync(BUDGETS_PATH, 'utf8'));
const ok = (over = {}) => ({
  path: '/golf/login', status: 200, horizontalScroll: false, axe: [], lcpMs: 600, lcpElement: 'img', smallTargets: [...(budgets.knownSmallTargets['/golf/login'] ?? [])],
  clipped: [], consoleErrors: [], origins: ['https://helmsportslabs.com'], writes: [], beacons: 0, ...over,
});

describe('classify: nothing that writes or counts a visit leaves the browser', () => {
  it('aborts every method but GET and HEAD', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(classify(m, 'https://helmsportslabs.com/golf/login')).toEqual({ abort: true, kind: 'write' });
    expect(classify('GET', 'https://helmsportslabs.com/golf/login')).toEqual({ abort: false, kind: 'read' });
    expect(classify('HEAD', 'https://helmsportslabs.com/')).toEqual({ abort: false, kind: 'read' });
  });
  it('aborts telemetry even as a GET: Vercel Analytics, Speed Insights, the Sentry tunnel and vendor hosts', () => {
    for (const url of [
      'https://helmsportslabs.com/92b1c65056033bfa/script.js',
      'https://helmsportslabs.com/b44a737315d6eee1/vitals',
      'https://helmsportslabs.com/_vercel/insights/view',
      'https://helmsportslabs.com/monitoring?o=1',
      'https://o123.ingest.sentry.io/api/1/envelope/',
      'https://browser-intake-us5-datadoghq.com/api/v2/rum',
      'https://us.i.posthog.com/e/',
    ]) expect(classify('GET', url).kind, url).toBe('telemetry');
  });
  it('treats an unparseable URL as something to abort', () => {
    expect(classify('GET', 'not a url').abort).toBe(true);
  });
});

describe('checkBase: production or loopback only', () => {
  it('takes the production origin and loopback', () => {
    expect(checkBase('https://helmsportslabs.com/anything')).toBe('https://helmsportslabs.com');
    expect(checkBase('http://127.0.0.1:3100')).toBe('http://127.0.0.1:3100');
  });
  it('refuses www, previews and anything else', () => {
    for (const b of ['https://www.helmsportslabs.com', 'https://helmv3-x.vercel.app', 'https://example.com']) expect(() => checkBase(b)).toThrow(/loopback/);
  });
});

describe('judge: each broken budget is a failure', () => {
  it('passes a page within every budget', () => {
    expect(judge(ok(), budgets)).toEqual([]);
  });
  it('fails status, sideways scroll, axe, LCP, a new small target, clipping, console errors, origins, writes and beacons', () => {
    const fails = judge(ok({
      status: 500, horizontalScroll: true, axe: [{ id: 'color-contrast', impact: 'serious', nodes: 2 }], lcpMs: budgets.lcpMs + 1,
      smallTargets: ['20x20 button "x"'], clipped: ['p "cut"'], consoleErrors: ['boom'], origins: ['https://evil.test'],
      writes: ['POST helmsportslabs.com/golf/login'], beacons: 1,
    }), budgets);
    for (const re of [/status 500/, /sideways/, /axe color-contrast/, /LCP .* over/, /new tap target/, /clipped/, /console error/, /unlisted origin/, /write attempted/, /sendBeacon/])
      expect(fails.some((f) => re.test(f)), String(re)).toBe(true);
  });
  it('fails a page with no LCP entry rather than passing it', () => {
    expect(judge(ok({ lcpMs: null }), budgets)).toContain('no LCP entry');
  });
});

describe('visible: the sr-only pattern is not a finding', () => {
  it('drops 1x1 targets and sr-only clipping, keeps the rest', () => {
    expect(visible({ smallTargets: ['1x1 a.sr-only "Skip"', '20x20 a "x"'], clipped: ['a.sr-only.focus "Skip"', 'p.ch-x "cut"'] }))
      .toEqual({ smallTargets: ['20x20 a "x"'], clipped: ['p.ch-x "cut"'] });
  });
});

describe('the budgets file', () => {
  it('lists exactly the five public pages and no write is known', () => {
    expect(budgets.pages).toEqual(['/', '/golf/login', '/golf/signup', '/golf/demo', '/golf/forgot-password']);
    expect(budgets.knownWrites).toEqual([]);
    expect(budgets.beaconsExpected).toBe(false);
    expect(resolve(BUDGETS_PATH)).toMatch(/config\/clubhouse\/prod-public-budgets\.json$/);
  });
});
