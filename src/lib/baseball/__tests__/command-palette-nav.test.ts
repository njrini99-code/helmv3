// =============================================================================
// Baseball command palette — registry-driven route coverage (#409)
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  BASEBALL_NAV_REGISTRY,
  getVisibleBaseballNav,
  type BaseballNavContext,
} from '../nav-registry';
import { buildBaseballCommandPaletteItems } from '../command-palette-nav';
import {
  BASEBALL_CAPABILITY_KEYS,
  type BaseballCapabilityMap,
} from '../capabilities';

function allCaps(value: boolean): BaseballCapabilityMap {
  return BASEBALL_CAPABILITY_KEYS.reduce((acc, key) => {
    acc[key] = value;
    return acc;
  }, {} as BaseballCapabilityMap);
}

describe('buildBaseballCommandPaletteItems', () => {
  it('includes only visible registry routes for a head coach', () => {
    const ctx: BaseballNavContext = {
      role: 'coach',
      capabilities: allCaps(true),
      programType: 'college',
    };

    const items = buildBaseballCommandPaletteItems(ctx);
    const visibleHrefs = new Set(getVisibleBaseballNav(ctx).map((e) => e.href));

    for (const item of items) {
      if (item.id === 'messages' || item.id === 'account-settings') continue;
      expect(visibleHrefs.has(item.href)).toBe(true);
    }

    expect(items.some((i) => i.id === 'import-center')).toBe(true);
    expect(items.some((i) => i.href === '/baseball/dashboard/messages')).toBe(true);
    expect(items.some((i) => i.href === '/baseball/dashboard/settings')).toBe(true);
  });

  it('hides capability-gated coach routes when capabilities are empty', () => {
    const ctx: BaseballNavContext = { role: 'coach', capabilities: {} };
    const items = buildBaseballCommandPaletteItems(ctx);
    const ids = new Set(items.map((i) => i.id));

    expect(ids.has('import-center')).toBe(false);
    expect(ids.has('program-settings')).toBe(false);
    expect(ids.has('command-center')).toBe(true);
  });

  it('uses player href overrides (stats-center → my-stats)', () => {
    const ctx: BaseballNavContext = { role: 'player', capabilities: {} };
    const items = buildBaseballCommandPaletteItems(ctx);
    const stats = items.find((i) => i.id === 'stats-center');

    expect(stats?.href).toBe('/baseball/dashboard/my-stats');
    expect(items.some((i) => i.id === 'pipeline')).toBe(false);
  });

  it('never surfaces coach-only routes to players', () => {
    const ctx: BaseballNavContext = { role: 'player', capabilities: allCaps(true) };
    const coachOnlyIds = BASEBALL_NAV_REGISTRY.filter((e) => e.role === 'coach').map((e) => e.id);
    const paletteIds = new Set(buildBaseballCommandPaletteItems(ctx).map((i) => i.id));

    for (const id of coachOnlyIds) {
      expect(paletteIds.has(id)).toBe(false);
    }
  });

  it('includes player-today for players without program type', () => {
    const ctx: BaseballNavContext = { role: 'player', capabilities: {} };
    const items = buildBaseballCommandPaletteItems(ctx);

    expect(items.some((i) => i.href === '/baseball/player/today')).toBe(true);
  });
});
