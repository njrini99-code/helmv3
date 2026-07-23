// @vitest-environment jsdom
//
// GOLF IA REORG — FOUNDATION (docs/golf-ia-plan.json final_migrations #1-#3).
// Locks in the registry's own invariants, then proves the three real
// consumers (rail, CoachHelmSubNav, CommandPalette) resolve the SAME
// canonical name per surface id — the "structurally impossible to disagree"
// contract surface-registry.ts exists to enforce.

import { createElement } from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  GOLF_SURFACES,
  getSurface,
  surfaceName,
  surfaceHref,
  type GolfSurfaceEntry,
} from './surface-registry';
import {
  buildCoachRailSections,
  buildPlayerRailSections,
  GOLF_COACH_HUBS,
  type GolfNavBadgeCounts,
} from './nav-registry';
import { CoachHelmSubNav } from '@/components/fairway/pages/coachhelm/CoachHelmSubNav';

const ZERO_BADGES: GolfNavBadgeCounts = {
  messages: 0,
  coachhelm: 0,
  calendarNotifications: 0,
  announcements: 0,
  travel: 0,
  tasks: 0,
};

describe('surface-registry — data invariants', () => {
  it('has no duplicate ids', () => {
    const ids = GOLF_SURFACES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every href is an absolute /golf/dashboard route', () => {
    for (const s of GOLF_SURFACES) {
      expect(s.href.startsWith('/golf/dashboard')).toBe(true);
    }
  });

  it('every canonicalName is non-empty', () => {
    for (const s of GOLF_SURFACES) {
      expect(s.canonicalName.trim().length).toBeGreaterThan(0);
    }
  });

  it('my-insights + the retired player/coach coachhelm-tab entries are the legacy+hidden surfaces', () => {
    // Spine & Stage (2026-07-19, plan Task 8): Development / Game Profile /
    // Standing folded into `?view=` drills of the player Overview home, joining
    // my-insights as permanent-redirect-shim (legacy+hidden) entries. Plan
    // Task 9 mirrors this on the coach side: Signals (+ its Alerts/Insights/
    // Patterns segments), Players, and Effectiveness fold into `?view=` drills
    // of the coach Brief home.
    const legacyHidden = GOLF_SURFACES.filter((s) => s.legacy && s.hidden);
    expect(legacyHidden.map((s) => s.id).sort()).toEqual(
      [
        'my-development-tab',
        'my-game-profile-tab',
        'my-insights',
        'my-standing-tab',
        'signals',
        'players-tab',
        'effectiveness',
        'alerts',
        'insights',
        'patterns',
        'development',
      ].sort(),
    );
  });

  it('surfaceName/surfaceHref throw on an unknown id (fail fast, never silently blank)', () => {
    expect(() => surfaceName('does-not-exist')).toThrow(/unknown surface id/);
    expect(() => surfaceHref('does-not-exist')).toThrow(/unknown surface id/);
    expect(getSurface('does-not-exist')).toBeUndefined();
  });

  it('surfaceName/surfaceHref agree with the raw entry for every id', () => {
    for (const s of GOLF_SURFACES) {
      expect(surfaceName(s.id)).toBe(s.canonicalName);
      expect(surfaceHref(s.id)).toBe(s.href);
    }
  });
});

describe('surface-registry — rail resolves the registry canonical name', () => {
  const byId = (id: string): GolfSurfaceEntry => {
    const s = getSurface(id);
    if (!s) throw new Error(`missing fixture surface ${id}`);
    return s;
  };

  it('coach rail "CoachHelm AI" matches the registry', () => {
    const items = buildCoachRailSections(ZERO_BADGES).flatMap((s) => s.items);
    const coachHelm = items.find((i) => i.href === byId('rail-coachhelm-ai-coach').href)!;
    expect(coachHelm.label).toBe(surfaceName('rail-coachhelm-ai-coach'));
  });

  it('player rail "CoachHelm AI" and "My Stats" match the registry', () => {
    const items = buildPlayerRailSections(ZERO_BADGES).flatMap((s) => s.items);
    const coachHelm = items.find((i) => i.href === byId('rail-coachhelm-ai-player').href)!;
    const stats = items.find((i) => i.href === byId('rail-my-stats-player').href)!;
    expect(coachHelm.label).toBe(surfaceName('rail-coachhelm-ai-player'));
    expect(stats.label).toBe(surfaceName('rail-my-stats-player'));
  });

  it('the Rounds & Stats hub\'s Team Stats tab matches the registry', () => {
    // The redundant "Stats" hub tab was pruned (golf-ia-plan.json step 9) — it
    // always dead-ended into Team Stats for single-role coaches. /stats itself
    // stays live (registry id 'stats' still resolves — used by the rail's "My
    // Stats" entry and the breadcrumb map) but is no longer its own hub tab.
    const hub = GOLF_COACH_HUBS.find((h) => h.id === 'rounds-stats')!;
    expect(hub.tabs.find((t) => t.id === 'stats')).toBeUndefined();
    const teamStats = hub.tabs.find((t) => t.id === 'team-stats')!;
    expect(teamStats.label).toBe(surfaceName('stats-team'));
  });
});

describe('surface-registry — CoachHelmSubNav resolves the registry canonical name', () => {
  it('coach strip renders the single consolidated Brief tab exactly as the registry names it', () => {
    // Spine & Stage (2026-07-19, plan Task 9): Signals / Players / Effectiveness
    // are legacy+hidden `?view=` drills of the Brief home now — the strip no
    // longer carries their tabs (mirroring the player strip's consolidation).
    render(createElement(CoachHelmSubNav, { active: 'brief', role: 'coach' }));
    const nav = screen.getByRole('navigation', { name: 'CoachHelm sections' });
    const labels = within(nav).getAllByRole('link').map((a) => a.textContent);

    expect(labels).toEqual([surfaceName('brief')]);
  });

  it('player strip renders the single consolidated Overview tab exactly as the registry names it', () => {
    // Development / Game Profile / Standing are legacy+hidden (?view= drills
    // of the Overview home now) — the strip no longer carries their tabs.
    render(createElement(CoachHelmSubNav, { active: 'brief', role: 'player' }));
    const nav = screen.getByRole('navigation', { name: 'CoachHelm sections' });
    const labels = within(nav).getAllByRole('link').map((a) => a.textContent);

    expect(labels).toEqual([surfaceName('overview')]);
  });
});

// CommandPalette fetches dynamic (players/rounds/insights) data via a server
// action on first open — stub it so this test exercises only the STATIC
// quick-action rows the registry feeds, with no Supabase dependency.
vi.mock('@/app/golf/actions/command-palette', () => ({
  getCommandPaletteData: vi.fn().mockResolvedValue({
    players: [],
    recentRounds: [],
    recentInsights: [],
  }),
}));

// jsdom has no layout engine, so it doesn't implement scrollIntoView — cmdk
// calls it when the highlighted item changes. Stub it (same as cmdk's own
// test suite does) so mounting <CommandPalette> under jsdom doesn't throw.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

describe('surface-registry — CommandPalette resolves the registry canonical name', () => {
  it('coach palette entries for the CoachHelm cluster match the registry', async () => {
    const { CommandPalette } = await import('@/components/golf/CommandPalette');
    render(createElement(CommandPalette, { isCoach: true }));

    // The palette only mounts its content while open — it listens for its own
    // Cmd/Ctrl+K shortcut, the same one a real user would press.
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    expect(screen.getByText(surfaceName('rail-coachhelm-ai-coach'))).toBeInTheDocument();
    expect(screen.getByText(surfaceName('signals'))).toBeInTheDocument();
    expect(screen.getByText(surfaceName('insights'))).toBeInTheDocument();
    expect(screen.getByText(surfaceName('patterns'))).toBeInTheDocument();
    expect(screen.getByText(surfaceName('effectiveness'))).toBeInTheDocument();
    expect(screen.getByText(surfaceName('development'))).toBeInTheDocument();
  });

  it('player palette entries for the CoachHelm cluster match the registry', async () => {
    const { CommandPalette } = await import('@/components/golf/CommandPalette');
    render(createElement(CommandPalette, { isCoach: false }));

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    expect(screen.getByText(surfaceName('rail-coachhelm-ai-player'))).toBeInTheDocument();
    expect(screen.getByText(surfaceName('rail-my-stats-player'))).toBeInTheDocument();
    expect(screen.getByText(surfaceName('my-development-tab'))).toBeInTheDocument();
  });
});

// Replaces scripts/__tests__/coachhelm-hub.test.mjs (deleted with the
// SurfaceHubGrid it guarded — the grid was one of three disagreeing nav
// systems the surface registry retired). The contract it protected survives
// in registry terms: every live (non-hidden) surface must be reachable from
// at least one real nav consumer, so retiring the grid can never silently
// re-orphan a CoachHelm route (2026-05-28 ultra-audit discoverability gap).
describe('surface discoverability — no live surface is nav-orphaned', () => {
  it('every non-hidden surface href appears in at least one nav consumer source', async () => {
    const { readFile } = await import('node:fs/promises');
    const consumers = await Promise.all(
      [
        'src/lib/golf/nav-registry.ts',
        'src/components/fairway/pages/coachhelm/CoachHelmSubNav.tsx',
        'src/components/golf/CommandPalette.tsx',
        // FairwayCoachHelmSignals.tsx (the legacy monolith this list used to
        // read) was deleted 2026-07-22 (dead code purge — zero live-route
        // imports); TriageDesk.tsx is its live replacement for the Signals
        // surface's discoverability text.
        'src/components/golf/coachhelm/triage/TriageDesk.tsx',
      ].map((p) => readFile(p, 'utf8')),
    );
    const combined = consumers.join('\n');
    const orphans = GOLF_SURFACES.filter(
      (s) => !s.hidden && !s.legacy && !combined.includes(`'${s.id}'`) && !combined.includes(s.href),
    ).map((s) => s.id);
    expect(orphans).toEqual([]);
  });
});
