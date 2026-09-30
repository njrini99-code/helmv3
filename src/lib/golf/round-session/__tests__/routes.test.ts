/**
 * The engines' routes and log tags default to the Fairway screens' own values (so a screen that passes nothing behaves
 * as it always has), a renderer can replace any of them, and no engine hard-codes one (ROUNDS_PLAN step 5a).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LEGACY_NEW_ROUND_LOG_SOURCE,
  LEGACY_ROUND_ROUTES,
  resolveRoundRoutes,
} from '@/lib/golf/round-session/routes';

describe('round session routes', () => {
  it('default to the Fairway routes the engines used to hard-code', () => {
    expect(LEGACY_ROUND_ROUTES.library).toBe('/golf/dashboard/rounds');
    expect(LEGACY_ROUND_ROUTES.round('r1')).toBe('/golf/dashboard/rounds/r1');
    expect(LEGACY_ROUND_ROUTES.continueRound('r1')).toBe('/golf/dashboard/rounds/continue/r1');
    expect(LEGACY_ROUND_ROUTES.recover).toBe('/golf/dashboard/rounds/recover?from=submit');
    expect(LEGACY_NEW_ROUND_LOG_SOURCE).toEqual({ component: 'NewRoundClient', route: '/golf/dashboard/rounds/new' });
  });

  it('resolve to the same object when a screen names none, and replace only what it names', () => {
    expect(resolveRoundRoutes()).toBe(LEGACY_ROUND_ROUTES);
    const routes = resolveRoundRoutes({ library: '/clubhouse/rounds', continueRound: (id) => `/clubhouse/rounds/${id}/continue` });
    expect(routes.library).toBe('/clubhouse/rounds');
    expect(routes.continueRound('r1')).toBe('/clubhouse/rounds/r1/continue');
    expect(routes.round('r1')).toBe(LEGACY_ROUND_ROUTES.round('r1'));
    expect(routes.recover).toBe(LEGACY_ROUND_ROUTES.recover);
  });

  it('are not hard-coded in the new-round engine', () => {
    const engine = readFileSync(new URL('../use-new-round-session.ts', import.meta.url), 'utf8');
    expect(engine).not.toMatch(/['"`]\/golf\/dashboard/);
    expect(engine).not.toContain("component: 'NewRoundClient'");
  });

  it('are not hard-coded in the continue engine', () => {
    const engine = readFileSync(new URL('../use-continue-round-session.ts', import.meta.url), 'utf8');
    expect(engine).not.toMatch(/['"`]\/golf\/dashboard/);
  });
});
