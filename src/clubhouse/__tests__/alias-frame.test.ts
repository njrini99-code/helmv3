import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAliased, isRebuilt } from '../shell/nav';

/** Every layout or page under src/app that calls redirectToClubhouse, as the address it serves (a [param] as `x`). */
function aliasedAddresses(): string[] {
  const root = join(process.cwd(), 'src/app');
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/^(layout|page)\.tsx$/.test(name) && readFileSync(p, 'utf8').includes('redirectToClubhouse(')) {
        const segs = relative(root, p).split(sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s));
        out.push('/' + segs.map((s) => (/^\[.*\]$/.test(s) ? 'x' : s)).join('/'));
      }
    }
  };
  walk(root);
  return out;
}

describe('old addresses Clubhouse moved (Simulator, 2026-10-14)', () => {
  it('every route that redirects into Clubhouse is on the frame’s aliased list', () => {
    const addresses = aliasedAddresses();
    expect(addresses.length).toBeGreaterThan(10);
    expect(addresses.filter((a) => !isAliased(a))).toEqual([]);
  });

  it('the aliased list names only old addresses, never a rebuilt screen', () => {
    for (const a of aliasedAddresses()) expect(isRebuilt(a, 'coach') && isRebuilt(a, 'player'), a).toBe(false);
    expect(isAliased('/golf/dashboard/team-hub')).toBe(false);
    expect(isAliased('/golf/dashboard')).toBe(false);
  });

  it('a coach on the player-only My qualifiers address moves on rather than standing on "not rebuilt"; Rounds is theirs now (Team rounds)', () => {
    const a = '/golf/dashboard/my-qualifiers';
    expect(isRebuilt(a, 'player'), a).toBe(true);
    expect(isRebuilt(a, 'coach'), a).toBe(false);
    expect(isAliased(a), a).toBe(true);
    expect(isRebuilt('/golf/dashboard/rounds', 'coach')).toBe(true);
    expect(isAliased('/golf/dashboard/rounds')).toBe(false);
    // Not their children: a coach's /rounds/new and a round's page are their own screens.
    expect(isAliased('/golf/dashboard/rounds/new')).toBe(false);
  });

  it('a player on the coach-only Team stats address moves on to their own Stats', () => {
    expect(isRebuilt('/golf/dashboard/stats/team', 'coach')).toBe(true);
    expect(isRebuilt('/golf/dashboard/stats/team', 'player')).toBe(false);
    expect(isAliased('/golf/dashboard/stats/team')).toBe(true);
    expect(isAliased('/golf/dashboard/stats')).toBe(false);
  });

  it('the frame renders an aliased segment (hidden) behind the not-rebuilt page, so its streamed redirect fires', () => {
    const frame = readFileSync(join(process.cwd(), 'src/clubhouse/shell/ClubhouseFrame.tsx'), 'utf8');
    expect(frame).toMatch(/isAliased\(pathname\) && <div hidden>\{children\}<\/div>/);
  });
});
