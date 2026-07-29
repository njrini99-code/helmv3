import { describe, it, expect } from 'vitest';
import {
  PRODUCT_MODULES,
  PRODUCT_MODULE_IDS,
  MODULE_HUBS,
  MODULE_ROUTE_PREFIXES,
  isModuleEnabled,
  isRecruitingEnabled,
  isHubDisabled,
  moduleForPathname,
  isPathnameModuleDisabled,
  disabledModuleIds,
} from '@/lib/baseball/product-modules';

describe('product module registry', () => {
  it('is the OUTERMOST gate — recruiting is off for everyone', () => {
    // Not conditional on role, capability, or program type. A primary head
    // coach on a college program must still not see it.
    expect(isRecruitingEnabled()).toBe(false);
    expect(isModuleEnabled('recruiting')).toBe(false);
    expect(disabledModuleIds()).toContain('recruiting');
  });

  it('documents WHY each module is in its current state and HOW to restore it', () => {
    // A future maintainer who finds recruiting missing must be able to learn
    // why and how to bring it back without archaeology.
    for (const id of PRODUCT_MODULE_IDS) {
      const mod = PRODUCT_MODULES[id];
      expect(mod.label.length, `${id} label`).toBeGreaterThan(0);
      expect(mod.reason.length, `${id} reason`).toBeGreaterThan(40);
      expect(mod.restore.length, `${id} restore`).toBeGreaterThan(40);
    }
  });

  it('preserves rather than deletes — the registry is a visibility switch', () => {
    expect(PRODUCT_MODULES.recruiting.reason).toMatch(/PRESERVED|preserved/);
  });
});

describe('hub gating', () => {
  it('disables every recruiting hub name used across the nav layers', () => {
    // These three names are what nav-registry, nav-manifest and route-contract
    // each use for the same concept. All must resolve through one mapping or
    // they drift apart.
    for (const hub of ['recruiting', 'coach-recruiting', 'player-recruiting']) {
      expect(isHubDisabled(hub), hub).toBe(true);
    }
  });

  it('leaves non-recruiting hubs alone', () => {
    for (const hub of [
      'coach-dashboard',
      'coach-team',
      'coach-stats',
      'coach-development',
      'coach-management',
      'coach-academics',
      'player-stats',
      'player-development',
      'player-team',
    ]) {
      expect(isHubDisabled(hub), hub).toBe(false);
    }
  });

  it('tolerates null/undefined/empty hub without throwing', () => {
    expect(isHubDisabled(null)).toBe(false);
    expect(isHubDisabled(undefined)).toBe(false);
    expect(isHubDisabled('')).toBe(false);
  });
});

describe('route gating', () => {
  it('closes the door on every recruiting route, not just the link', () => {
    // Hiding a nav item is not enough: a buyer typing a URL must not land on a
    // half-built screen.
    for (const prefix of MODULE_ROUTE_PREFIXES.recruiting) {
      expect(isPathnameModuleDisabled(prefix), prefix).toBe(true);
      expect(isPathnameModuleDisabled(`${prefix}/123`), `${prefix}/123`).toBe(true);
    }
  });

  it('does NOT over-match routes that survive the sunset', () => {
    // Regression guard for the most likely over-reach. Academics reads as
    // recruiting-adjacent but is a compliance surface a non-recruiting college
    // program still needs; removing it would delete a feature we still sell.
    for (const keep of [
      '/baseball/dashboard',
      '/baseball/dashboard/roster',
      '/baseball/dashboard/practice',
      '/baseball/dashboard/academics',
      '/baseball/dashboard/dev-plans',
      '/baseball/dashboard/performance',
      '/baseball/dashboard/settings',
    ]) {
      expect(isPathnameModuleDisabled(keep), keep).toBe(false);
      expect(moduleForPathname(keep), keep).toBeNull();
    }
  });

  it('does not match a route that merely shares a prefix substring', () => {
    // '/baseball/dashboard/campaigns' must not be caught by '/camps'.
    expect(isPathnameModuleDisabled('/baseball/dashboard/campaigns')).toBe(false);
    expect(isPathnameModuleDisabled('/baseball/dashboard/comparisons-archive')).toBe(false);
  });

  it('attributes each recruiting route to the recruiting module', () => {
    expect(moduleForPathname('/baseball/dashboard/pipeline')).toBe('recruiting');
    expect(moduleForPathname('/baseball/dashboard/scout-packets/abc')).toBe('recruiting');
  });
});

describe('registry integrity', () => {
  it('every module declares hubs and route prefixes', () => {
    for (const id of PRODUCT_MODULE_IDS) {
      expect(MODULE_HUBS[id]?.length, `${id} hubs`).toBeGreaterThan(0);
      expect(MODULE_ROUTE_PREFIXES[id]?.length, `${id} routes`).toBeGreaterThan(0);
    }
  });

  it('route prefixes are absolute and unambiguous', () => {
    for (const id of PRODUCT_MODULE_IDS) {
      for (const prefix of MODULE_ROUTE_PREFIXES[id]) {
        expect(prefix.startsWith('/'), prefix).toBe(true);
        expect(prefix.endsWith('/'), prefix).toBe(false);
      }
    }
  });

  it('is pure — importing it twice yields identical answers (no env/clock reads)', () => {
    expect(isRecruitingEnabled()).toBe(isRecruitingEnabled());
    expect(moduleForPathname('/baseball/dashboard/pipeline')).toBe(
      moduleForPathname('/baseball/dashboard/pipeline'),
    );
  });
});
