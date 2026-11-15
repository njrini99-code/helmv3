import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
  it('Practice links from a plan card reach their page for both roles, so its own flag and access check run', () => {
    for (const role of ['coach', 'player'] as const) {
      expect(isRebuilt('/golf/dashboard/practice/format', role)).toBe(true);
      expect(isRebuilt('/golf/dashboard/practice/plan/00000000-0000-0000-0000-000000000001', role)).toBe(true);
    }
  });

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

  it('My qualifiers is retired: next.config sends the address on to Qualifiers before any route runs; Rounds is a coach’s now (Team rounds)', () => {
    const a = '/golf/dashboard/my-qualifiers';
    for (const role of ['coach', 'player'] as const) {
      expect(isRebuilt(a, role), a).toBe(false);
      expect(isAliased(a, role), a).toBe(false);
    }
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
    expect(frame).toMatch(/const aliased = isAliased\(pathname, role\);/);
    expect(frame).toMatch(/aliased && <div hidden>\{children\}<\/div>/);
  });
});

describe('old addresses one place for both roles are config redirects (Fairway retirement, 2026-11-14)', () => {
  // Their route folders only redirected (redirectToClubhouse); next.config.mjs sends them on before any route runs, so a
  // bookmark, a notification or an email keeps working. Its query passes through (?task= reaches Team Hub's Tasks tab).
  const MOVED: Array<[source: string, destination: string, folder: string]> = [
    ['/golf/dashboard/tasks', '/golf/dashboard/team-hub?tab=tasks', 'tasks'],
    ['/golf/dashboard/announcements', '/golf/dashboard/team-hub?tab=ann', 'announcements'],
    ['/golf/dashboard/documents', '/golf/dashboard/team-hub?tab=docs', 'documents'],
    ['/golf/dashboard/travel', '/golf/dashboard/team-hub?tab=travel', 'travel'],
    ['/golf/dashboard/my-qualifiers', '/golf/dashboard/qualifiers', 'my-qualifiers'],
    ['/golf/dashboard/rounds/:id/review', '/golf/dashboard/rounds/:id', 'rounds/[id]/review'],
  ];

  it.each(MOVED)('%s goes to %s, and its route folder is gone', async (source, destination, folder) => {
    const { default: config } = (await import('../../../next.config.mjs')) as { default: { redirects: () => Promise<Array<{ source: string; destination: string; permanent: boolean }>> } };
    const rule = (await config.redirects()).find((r) => r.source === source);
    expect(rule, source).toMatchObject({ destination, permanent: false });
    expect(existsSync(join(process.cwd(), 'src/app/golf/(dashboard)/dashboard', folder)), folder).toBe(false);
    // The frame does not wait on a layout redirect that no longer exists.
    expect(isAliased(source.replace(':id', '00000000-0000-0000-0000-000000000001'))).toBe(false);
  });

  it('100103 a task notification’s ?task= rides the /tasks redirect to the Tasks tab, and Team Hub hands it to its route, which drops a value that is not an id', async () => {
    const { default: config } = (await import('../../../next.config.mjs')) as { default: { redirects: () => Promise<Array<{ source: string; destination: string }>> } };
    // A config redirect passes the request's query through, so /tasks?task=<id> lands on team-hub?tab=tasks&task=<id>.
    expect((await config.redirects()).find((r) => r.source === '/golf/dashboard/tasks')?.destination).toBe('/golf/dashboard/team-hub?tab=tasks');
    const page = readFileSync(join(process.cwd(), 'src/app/golf/(dashboard)/dashboard/team-hub/page.tsx'), 'utf8');
    expect(page).toContain("task={typeof task === 'string' ? task : undefined}");
    const route = readFileSync(join(process.cwd(), 'src/clubhouse/routes/hub.tsx'), 'utf8');
    expect(route).toContain('const focusTask = task && /^[\\w-]{1,64}$/.test(task) ? task : null;');
  });

  it('every destination is a rebuilt screen for both roles', () => {
    for (const [, destination] of MOVED) {
      const path = destination.replace(':id', '00000000-0000-0000-0000-000000000001').split('?')[0]!;
      for (const role of ['coach', 'player'] as const) expect(isRebuilt(path, role), `${path} (${role})`).toBe(true);
    }
  });
});
