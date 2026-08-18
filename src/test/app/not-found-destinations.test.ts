/**
 * Every 404 in the product offers BASEBALL as its primary action.
 *
 * Observed in production 2026-08-17 as coach Ben Potter (Guilford College
 * Men's Golf Team), on `/golf/dashboard/players/<id>/insight`: the page
 * renders "Baseball Dashboard" as the filled primary button, with "Golf
 * Dashboard" demoted to a secondary outline beside it.
 *
 * `src/app/not-found.tsx` hardcodes that order:
 *
 *     <Button asChild variant="secondary"><Link href="/">Go to Home</Link></Button>
 *     <Button asChild><Link href="/baseball/dashboard">Baseball Dashboard</Link></Button>
 *     <Button asChild variant="secondary"><Link href="/golf/dashboard">Golf Dashboard</Link></Button>
 *
 * `<Button asChild>` with no variant is the PRIMARY style, so the one filled
 * button on the page sends a golf coach into a product they do not use. It is
 * a server component with no access to the request URL, so it cannot know
 * which sport the visitor came from — the same wrong button is served to
 * baseball users hitting a `/golf/` 404 and vice versa.
 *
 * This is the whole platform's dead-end page: `/golf/**`, `/baseball/**` and
 * every marketing route funnel here. Getting the recovery action wrong is the
 * one thing a 404 must not do.
 *
 * The fix routes off the pathname the visitor already came from. `null` (the
 * global/unknown case) keeps both sports offered and neither promoted, because
 * guessing is what produced this bug.
 */
import { describe, it, expect } from 'vitest';
import { destinationsFor } from '@/app/not-found-destinations';

describe('404 destinations — the primary action matches where the visitor was', () => {
  it('promotes Golf for a golf route', () => {
    // The exact production URL that surfaced this.
    const d = destinationsFor('/golf/dashboard/players/0c82eefb/insight');
    const primary = d.find((x) => x.primary);
    expect(primary?.label).toBe('Golf Dashboard');
    expect(primary?.href).toBe('/golf/dashboard');
  });

  it('promotes Baseball for a baseball route', () => {
    const d = destinationsFor('/baseball/dashboard/roster/nope');
    const primary = d.find((x) => x.primary);
    expect(primary?.label).toBe('Baseball Dashboard');
    expect(primary?.href).toBe('/baseball/dashboard');
  });

  it('still offers the other sport, just not promoted', () => {
    const labels = destinationsFor('/golf/dashboard/nope').map((x) => x.label);
    expect(labels).toContain('Baseball Dashboard');
    expect(labels).toContain('Golf Dashboard');
    expect(labels).toContain('Go to Home');
  });

  it('promotes exactly one destination', () => {
    for (const p of ['/golf/x', '/baseball/x', '/anything']) {
      expect(destinationsFor(p).filter((x) => x.primary).length, p).toBeLessThanOrEqual(1);
    }
  });

  it('promotes NOTHING when the path gives no signal', () => {
    // Guessing a sport is what shipped the bug. An unknown route offers both
    // and lets the visitor choose.
    for (const p of ['/', '/pricing', null, undefined]) {
      expect(destinationsFor(p).some((x) => x.primary), String(p)).toBe(false);
    }
  });

  it('is not fooled by a sport name appearing later in the path', () => {
    // A marketing page about baseball is not a baseball app route.
    const d = destinationsFor('/blog/why-we-built-baseball');
    expect(d.some((x) => x.primary)).toBe(false);
  });

  it('always offers a way home', () => {
    for (const p of ['/golf/x', '/baseball/x', '/anything', null]) {
      expect(destinationsFor(p).map((x) => x.href), String(p)).toContain('/');
    }
  });
});
