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
    expect(primary?.label).toBe('GolfHelm');
    expect(primary?.href).toBe('/golf/dashboard');
  });

  it('promotes Baseball for a baseball route', () => {
    const d = destinationsFor('/baseball/dashboard/roster/nope');
    const primary = d.find((x) => x.primary);
    expect(primary?.label).toBe('BaseballHelm');
    expect(primary?.href).toBe('/baseball/dashboard');
  });

  it('promotes Lift Lab for a Lift Lab route (GAP-R-07)', () => {
    const primary = destinationsFor('/lifting/dashboard/programs/nope').find((x) => x.primary);
    expect(primary?.label).toBe('Lift Lab');
    expect(primary?.href).toBe('/lifting/dashboard');
  });

  it('still offers the other products, just not promoted', () => {
    const d = destinationsFor('/golf/dashboard/nope');
    expect(d.map((x) => x.label)).toEqual(['GolfHelm', 'Home', 'BaseballHelm', 'Lift Lab']);
    expect(d.filter((x) => !x.primary).map((x) => x.label)).toEqual(['Home', 'BaseballHelm', 'Lift Lab']);
  });

  it('promotes exactly one destination, and lists it first', () => {
    for (const p of ['/golf/x', '/baseball/x', '/lifting/x', '/anything', null]) {
      const d = destinationsFor(p);
      expect(d.filter((x) => x.primary).length, String(p)).toBe(1);
      expect(d[0]?.primary, String(p)).toBe(true);
    }
  });

  it('promotes Home, never a sport, when the path gives no signal', () => {
    // Guessing a sport is what shipped the bug. One calm primary action
    // (GAP-M-02, 15 Nov 2026) is the site's home, and every product stays on
    // offer as a quiet link.
    for (const p of ['/', '/pricing', null, undefined]) {
      const d = destinationsFor(p);
      expect(d.find((x) => x.primary)?.href, String(p)).toBe('/');
      expect(d.filter((x) => !x.primary).map((x) => x.label), String(p)).toEqual(['GolfHelm', 'BaseballHelm', 'Lift Lab']);
    }
  });

  it('is not fooled by a sport name appearing later in the path', () => {
    // A marketing page about baseball is not a baseball app route.
    const d = destinationsFor('/blog/why-we-built-baseball');
    expect(d.find((x) => x.primary)?.href).toBe('/');
    expect(destinationsFor('/golfing-tips').find((x) => x.primary)?.href).toBe('/');
  });

  it('always offers a way home', () => {
    for (const p of ['/golf/x', '/baseball/x', '/lifting/x', '/anything', null]) {
      expect(destinationsFor(p).map((x) => x.href), String(p)).toContain('/');
    }
  });
});
