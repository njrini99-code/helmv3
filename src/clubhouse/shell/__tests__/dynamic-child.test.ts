import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPlayerRoundFlow, isRebuilt, isRebuiltDynamicChild } from '../nav';

/**
 * GAP-R-03: an address under a rebuilt screen with a malformed id (a typo, a truncated link) is still that screen's. The frame
 * renders its segment, which draws its own not-found, instead of "not rebuilt" (CH-1301). Link targets keep the uuid-only
 * `isRebuilt`, so no control ever points at a malformed id.
 */
describe('a rebuilt screen’s child with a malformed id', () => {
  it('renders its segment for qualifiers, rounds and a player’s round in progress', () => {
    for (const role of ['coach', 'player'] as const) {
      expect(isRebuiltDynamicChild('/golf/dashboard/qualifiers/abc', role)).toBe(true);
      expect(isRebuiltDynamicChild('/golf/dashboard/qualifiers/abc/edit', role)).toBe(true);
      expect(isRebuiltDynamicChild('/golf/dashboard/qualifiers/abc/selection', role)).toBe(true);
      expect(isRebuiltDynamicChild('/golf/dashboard/rounds/abc', role)).toBe(true);
      // isRebuilt stays uuid-only: the existing guards on malformed ids keep holding for link targets.
      expect(isRebuilt('/golf/dashboard/qualifiers/abc', role)).toBe(false);
    }
    expect(isRebuiltDynamicChild('/golf/dashboard/rounds/continue/abc', 'player')).toBe(true);
    expect(isRebuiltDynamicChild('/golf/dashboard/rounds/continue/abc', 'coach')).toBe(false);
  });

  it('renders Tournaments’ children only where Tournaments is on', () => {
    expect(isRebuiltDynamicChild('/golf/dashboard/tournaments/abc', 'coach', { tournaments: true })).toBe(true);
    expect(isRebuiltDynamicChild('/golf/dashboard/tournaments/abc/lineup', 'coach', { tournaments: true })).toBe(true);
    expect(isRebuiltDynamicChild('/golf/dashboard/tournaments/abc', 'coach', { tournaments: false })).toBe(false);
    expect(isRebuiltDynamicChild('/golf/dashboard/tournaments/abc', 'coach')).toBe(false);
  });

  it('never claims a fixed address that is not an id', () => {
    for (const role of ['coach', 'player'] as const) {
      for (const p of ['/golf/dashboard/rounds/new', '/golf/dashboard/rounds/recover', '/golf/dashboard/rounds/continue', '/golf/dashboard/rounds/course', '/golf/dashboard/qualifiers/abc/other', '/golf/dashboard/roster/abc']) {
        expect(isRebuiltDynamicChild(p, role), `${role} ${p}`).toBe(false);
      }
    }
  });

  it('a player’s own round flow is told apart from other addresses (CH-11390, GAP-R-12)', () => {
    for (const p of ['/golf/dashboard/rounds/new', '/golf/dashboard/rounds/recover', '/golf/dashboard/rounds/continue/abc', '/golf/dashboard/rounds/new/']) {
      expect(isPlayerRoundFlow(p), p).toBe(true);
    }
    for (const p of ['/golf/dashboard/rounds', '/golf/dashboard/rounds/abc', '/golf/dashboard/rounds/course/x', '/golf/dashboard/rounds/continue']) {
      expect(isPlayerRoundFlow(p), p).toBe(false);
    }
    // A coach is never sent there by a link: the flow stays rebuilt for players only.
    expect(isRebuilt('/golf/dashboard/rounds/new', 'coach')).toBe(false);
    const frame = readFileSync(join(process.cwd(), 'src/clubhouse/shell/ClubhouseFrame.tsx'), 'utf8');
    expect(frame).toMatch(/const playersOnly = !rebuilt && role === 'coach' && isPlayerRoundFlow\(pathname\);/);
    expect(frame).toMatch(/playersOnly \? \(\s*<PlayersOnlyRounds \/>/);
  });

  it('the frame renders the segment for such an address instead of the not-rebuilt page', () => {
    const frame = readFileSync(join(process.cwd(), 'src/clubhouse/shell/ClubhouseFrame.tsx'), 'utf8');
    expect(frame).toMatch(/const dynamicChild = isRebuiltDynamicChild\(pathname, role, shell\);/);
    expect(frame).toMatch(/\{rebuilt \|\| !known \|\| dynamicChild \? children : \(/);
  });
});
