// =============================================================================
// src/lib/baseball/__tests__/nav-player-rail.test.ts
//
// Owner directive, wave W3 (docs/audits/PRODUCTION_READINESS_MISSION_2026-07-09.md):
// the baseball PLAYER rail caps at ~8 destinations. It previously rendered 9
// (7 primary "My Baseball" + exposureNoun + Settings, both in the secondary
// "More" section). The fix moved Settings OUT of the rail sections and INTO
// the shell's pinned rail FOOTER (ShellFooter in BaseballFairwayShell.tsx),
// matching the coach shell — the Settings ROUTE and behavior are unchanged,
// only where the link lives changed.
//
// This test pins the SHAPE (hub-definitions.ts's PLAYER_RAIL_PRIMARY_IDS /
// PLAYER_RAIL_SECONDARY_IDS — the single source of truth
// BaseballFairwayShell.tsx's buildPlayerNavSections consumes) without
// importing that 'use client' module. A colocated render test
// (BaseballFairwayShell.test.tsx) covers ShellFooter actually rendering
// Settings + Sign out.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  PLAYER_HUB_ROW_IDS,
  PLAYER_RAIL_PRIMARY_IDS,
  PLAYER_RAIL_SECONDARY_IDS,
} from '@/app/baseball/(dashboard)/_components/hub-definitions';
import { BASEBALL_MESSAGES_NAV } from '../nav-registry';

describe('player rail shape (owner directive: ~8 destinations)', () => {
  it('renders exactly 8 total destinations across the primary + secondary sections', () => {
    expect(PLAYER_RAIL_PRIMARY_IDS.length + PLAYER_RAIL_SECONDARY_IDS.length).toBe(8);
  });

  it('primary "My Baseball" section is the 7 daily-loop destinations, in order', () => {
    expect(PLAYER_RAIL_PRIMARY_IDS).toEqual([
      'player-today',
      'calendar',
      'player-profile',
      PLAYER_HUB_ROW_IDS.stats,
      PLAYER_HUB_ROW_IDS.development,
      PLAYER_HUB_ROW_IDS.team,
      BASEBALL_MESSAGES_NAV.id,
    ]);
  });

  it('secondary "More" section is just the recruiting/exposure hub now', () => {
    expect(PLAYER_RAIL_SECONDARY_IDS).toEqual([PLAYER_HUB_ROW_IDS.recruiting]);
  });

  it('Settings is absent from both rail sections — it lives in the pinned rail footer now', () => {
    const allIds = [...PLAYER_RAIL_PRIMARY_IDS, ...PLAYER_RAIL_SECONDARY_IDS];
    expect(allIds).not.toContain('settings');
    expect(allIds).not.toContain('staff-settings');
    expect(allIds.some((id) => id.toLowerCase().includes('settings'))).toBe(false);
  });

  it('no id appears in both sections', () => {
    const primarySet = new Set(PLAYER_RAIL_PRIMARY_IDS);
    const overlap = PLAYER_RAIL_SECONDARY_IDS.filter((id) => primarySet.has(id));
    expect(overlap).toEqual([]);
  });
});
