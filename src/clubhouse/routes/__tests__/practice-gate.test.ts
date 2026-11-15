import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Practice is a Clubhouse page and Fairway has no screen for it. When the practice flags were retired the pages lost their
 * "flag off: Calendar" redirect; a user for whom Clubhouse is not on (a Fairway user) must still land on the Calendar.
 */
const state = vi.hoisted(() => ({ role: 'coach' as 'coach' | 'player' | null, on: false, redirected: [] as string[] }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    state.redirected.push(to);
    throw new Error('NEXT_REDIRECT');
  },
}));
vi.mock('@/lib/auth/get-golf-dashboard-role', () => ({ getGolfDashboardRole: async () => state.role }));
vi.mock('../../gate', () => ({ isClubhouseFor: async (role: string | null) => state.on && (role === 'coach' || role === 'player') }));

import { PRACTICE_FAIRWAY_FALLBACK, redirectUnlessClubhousePractice } from '../practice-gate';

beforeEach(() => {
  state.role = 'coach';
  state.on = false;
  state.redirected = [];
});

describe('Practice for a user who is not on Clubhouse', () => {
  it('a Fairway coach goes to the Calendar', async () => {
    await expect(redirectUnlessClubhousePractice()).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirected).toEqual(['/golf/dashboard/calendar']);
    expect(PRACTICE_FAIRWAY_FALLBACK).toBe('/golf/dashboard/calendar');
  });
  it('a Fairway player goes to the Calendar', async () => {
    state.role = 'player';
    await expect(redirectUnlessClubhousePractice()).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirected).toEqual(['/golf/dashboard/calendar']);
  });
  it('a signed-out visitor (no role) goes to the Calendar too, which sends them to sign in', async () => {
    state.role = null;
    state.on = true;
    await expect(redirectUnlessClubhousePractice()).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirected).toEqual(['/golf/dashboard/calendar']);
  });
  it('a Clubhouse coach or player stays on the Practice page', async () => {
    state.on = true;
    await expect(redirectUnlessClubhousePractice()).resolves.toBeUndefined();
    state.role = 'player';
    await expect(redirectUnlessClubhousePractice()).resolves.toBeUndefined();
    expect(state.redirected).toEqual([]);
  });
});

describe('every Practice page asks first', () => {
  const root = join(process.cwd(), 'src/app/golf/(dashboard)/dashboard/practice');
  const pages = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return pages(p);
      return name === 'page.tsx' ? [p] : [];
    });

  it('finds the nine Practice pages', () => {
    expect(pages(root)).toHaveLength(9);
  });
  it('each one awaits the gate before it reads or draws anything', () => {
    for (const file of pages(root)) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).toContain("import { redirectUnlessClubhousePractice } from '@/clubhouse/routes/practice-gate';");
      const body = src.slice(src.indexOf('export default async function Page'));
      expect(body.indexOf('await redirectUnlessClubhousePractice();'), file).toBeGreaterThan(-1);
      // Before any other await in the function (params, searchParams) and before the route is returned.
      const first = body.indexOf('await ');
      expect(first, file).toBe(body.indexOf('await redirectUnlessClubhousePractice();'));
    }
  });
});
