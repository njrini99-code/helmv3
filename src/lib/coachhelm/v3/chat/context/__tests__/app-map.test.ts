import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => true }));

// The app's own lists, read by the test only (the chat library does not import the Clubhouse tree): what is a rebuilt
// route for a role, which tabs Team Hub has and which sections Settings has.
import { CH_NAV_COACH, CH_NAV_PLAYER, isRebuilt } from '@/clubhouse/shell/nav';
import { HUB_TABS } from '@/clubhouse/lib/hub-tabs';
import { SECTIONS } from '@/clubhouse/screens/settings/model';
import { modelToolFor } from '../../engine/model';
import { APP_PLACES, hrefOf, placesFor, searchPlaces, type AppPlace, type AppRole } from '../app-map';
import { findInApp, findInAppForPlayer } from '../find-in-app';
import { SCREEN_IDS, screenContextFromPath } from '../screen-schema';
import { AVERY, STRANGER, coachWho, playerWho, toolCtx } from './fake-sb';

const DASHBOARD = join(process.cwd(), 'src/app/golf/(dashboard)/dashboard');
const ALL = { tournaments: true };
const rolesOf = (p: AppPlace): AppRole[] => (p.role === 'both' ? ['coach', 'player'] : [p.role]);
const pathOf = (href: string) => href.split('?')[0]!;
const queryOf = (href: string) => new URLSearchParams(href.split('?')[1] ?? '');

/** Is there a page for this address? A segment the address fills in (an id) matches a `[param]` folder. */
function hasPage(path: string): boolean {
  const segs = path.replace(/^\/golf\/dashboard\/?/, '').split('/').filter(Boolean);
  let dir = DASHBOARD;
  for (const seg of segs) {
    if (existsSync(join(dir, seg))) dir = join(dir, seg);
    else {
      const dynamic = readdirSync(dir).find((d) => /^\[[^.\]]+\]$/.test(d));
      if (!dynamic) return false;
      dir = join(dir, dynamic);
    }
  }
  return existsSync(join(dir, 'page.tsx'));
}

describe('the app map', () => {
  it('has unique ids, a name, a purpose and a screen the context schema knows', () => {
    expect(new Set(APP_PLACES.map((p) => p.id)).size).toBe(APP_PLACES.length);
    for (const p of APP_PLACES) {
      expect(p.name.trim().length, p.id).toBeGreaterThan(0);
      expect(p.purpose.trim().length, p.id).toBeGreaterThan(10);
      expect(SCREEN_IDS, p.id).toContain(p.screen);
    }
  });

  it.each(APP_PLACES.map((p) => [p.id, p] as const))('%s: its address is a real page, rebuilt for every role it is offered to', (_id, place) => {
    const href = hrefOf(place, AVERY)!;
    expect(href.startsWith('/golf/dashboard')).toBe(true);
    expect(href).not.toContain('{');
    expect(hasPage(pathOf(href)), `${pathOf(href)} has no page.tsx`).toBe(true);
    for (const role of rolesOf(place)) expect(isRebuilt(pathOf(href), role, ALL), `${pathOf(href)} is not rebuilt for a ${role}`).toBe(true);
  });

  it('every Team Hub tab and Settings section it links is one the screen reads for that role', () => {
    for (const p of APP_PLACES) {
      const q = queryOf(p.href);
      for (const role of rolesOf(p)) {
        if (pathOf(p.href) === '/golf/dashboard/team-hub' && q.get('tab')) expect(HUB_TABS[role].map(([k]) => k), p.id).toContain(q.get('tab'));
        if (pathOf(p.href) === '/golf/dashboard/settings') expect(SECTIONS[role].map((s) => s.id as string), p.id).toContain(q.get('section'));
      }
    }
  });

  it('covers every item of each role’s navigation, under the navigation’s own name', () => {
    for (const [role, nav] of [['coach', CH_NAV_COACH], ['player', CH_NAV_PLAYER]] as const) {
      const places = placesFor(role, ALL);
      for (const item of nav) {
        const place = places.find((p) => pathOf(p.href) === item.href && !p.href.includes('view=') && (!p.tab || p.tab === 'home'));
        expect(place, `${role} nav item ${item.label} (${item.href}) is not in the app map`).toBeTruthy();
        expect(place!.name).toBe(item.label);
      }
    }
  });

  it('a player’s list holds no coach place, and a place behind a flag that is off is not offered', () => {
    const player = placesFor('player', ALL);
    expect(player.every((p) => p.role !== 'coach')).toBe(true);
    for (const coachOnly of ['recruiting', 'team_stats', 'roster', 'live', 'settings_team', 'qualifier_new', 'stats_player']) expect(player.map((p) => p.id)).not.toContain(coachOnly);
    expect(player.some((p) => p.href.includes('{player}'))).toBe(false);
    expect(placesFor('coach').map((p) => p.id)).not.toContain('tournaments');
    expect(placesFor('coach', ALL).map((p) => p.id)).toContain('tournaments');
  });

  it('the address helper and the map agree on the screen of every place', () => {
    for (const p of APP_PLACES) expect(screenContextFromPath(pathOf(hrefOf(p, AVERY)!), `?${queryOf(hrefOf(p, AVERY)!).toString()}`)?.screen, p.id).toBe(p.screen);
  });
});

describe('searching the map', () => {
  it.each([
    ['coach', 'join requests', 'roster'],
    ['coach', 'where are the tasks', 'team_hub_tasks'],
    ['coach', 'drill bank', 'practice_drills'],
    ['coach', 'change the tees', 'settings_team'],
    ['coach', 'who is playing right now', 'live'],
    ['coach', 'recruits', 'recruiting'],
    ['coach', 'team averages', 'team_stats'],
    ['coach', 'hotel for the trip', 'team_hub_travel'],
    ['coach', 'add a practice to the schedule', 'calendar_new_event'],
    ['player', 'post a round', 'round_new'],
    ['player', 'my classes', 'classes'],
    ['player', 'my handicap', 'settings_golf'],
    ['player', 'strokes gained', 'my_stats'],
  ] as const)('a %s asking for "%s" gets %s first', (role, query, want) => {
    expect(searchPlaces(role, query, ALL)[0]?.place.id).toBe(want);
  });

  it('a player never gets a coach surface back, whatever they ask for', () => {
    for (const query of ['recruiting', 'team stats', 'join requests', 'live', 'settings team', 'drill bank', 'new qualifier', 'roster', 'stats']) {
      for (const m of searchPlaces('player', query, ALL)) expect(m.place.role, `${query} -> ${m.place.id}`).not.toBe('coach');
    }
  });
});

describe('find_in_app', () => {
  const parts = (r: { parts?: Array<{ type: string; data: unknown }> }) => (r.parts ?? []).map((p) => p.data as { label: string; href: string; place: string });

  it('names the places and attaches a button for the best one; the model is never given an address', async () => {
    const out = await findInApp.run(toolCtx({}, coachWho()), { query: 'join requests', player_id: null });
    expect(out.evidence).toBe(false);
    expect(out.summary).toMatch(/^.*Roster: /m);
    expect(out.summary).not.toMatch(/\/golf\//);
    expect(JSON.stringify({ ...out, parts: undefined })).not.toMatch(/\/golf\//);
    expect(parts(out)[0]).toEqual({ label: 'Open Roster', href: '/golf/dashboard/roster', place: 'roster' });
    expect(out.parts?.[0]?.type).toBe('data-app-link');
  });

  it('opens a roster player’s own page when the coach names one, and the id stays out of what the model reads', async () => {
    const out = await findInApp.run(toolCtx({}, coachWho()), { query: 'stats', player_id: AVERY });
    expect(parts(out)[0]).toEqual({ label: 'Open Stats for Avery Lane', href: `/golf/dashboard/stats?player=${AVERY}`, place: 'stats_player' });
    expect(JSON.stringify({ ...out, parts: undefined })).not.toContain(AVERY);
  });

  it('refuses a player who is not on the coach’s roster', async () => {
    const out = await findInApp.run(toolCtx({}, coachWho()), { query: 'stats', player_id: STRANGER });
    expect(out.coverage).toBe('unavailable');
    expect(out.parts).toBeUndefined();
  });

  it('a player page asked for without a player is listed, with no dead link', async () => {
    const out = await findInApp.run(toolCtx({}, coachWho()), { query: 'deep dive', player_id: null });
    expect(out.summary).toMatch(/call find_in_app again with that player’s id/);
    for (const p of parts(out)) expect(p.href).not.toContain('{');
  });

  it('every link it can return for a coach or a player is a real page for that role', async () => {
    const seen = new Set<string>();
    for (const [who, role, tool] of [[coachWho(), 'coach', findInApp], [playerWho(), 'player', findInAppForPlayer]] as const) {
      for (const place of placesFor(role, ALL)) {
        for (const query of [place.name, ...place.keywords]) {
          const out = await (tool as typeof findInApp).run(toolCtx({}, who, role === 'player' ? 'player' : 'ask'), { query, player_id: role === 'coach' ? AVERY : null });
          for (const p of parts(out)) {
            seen.add(`${role} ${p.place}`);
            expect(hasPage(pathOf(p.href)), `${role}: ${p.href}`).toBe(true);
            expect(isRebuilt(pathOf(p.href), role, ALL), `${role}: ${p.href}`).toBe(true);
            if (role === 'player') expect(placesFor('player', ALL).map((x) => x.id), `player got ${p.place}`).toContain(p.place);
          }
        }
      }
    }
    // The sweep reached every place of both roles, so the assertion above is about the whole map, not a sample.
    for (const role of ['coach', 'player'] as const) for (const place of placesFor(role, ALL)) expect(seen, `${role} ${place.id}`).toContain(`${role} ${place.id}`);
  });

  it('a player’s session gets the player’s places even through the coach’s tool object, and a player id is ignored', async () => {
    const out = await findInApp.run(toolCtx({}, playerWho(), 'player'), { query: 'recruiting team stats roster requests', player_id: STRANGER });
    for (const p of parts(out)) {
      expect(placesFor('player', ALL).map((x) => x.id)).toContain(p.place);
      expect(p.href).not.toContain(STRANGER);
    }
    expect(JSON.stringify(out)).not.toMatch(/Recruiting|Team Stats/);
  });

  it('says so when nothing matches, and offers the main places', async () => {
    const out = await findInApp.run(toolCtx({}, coachWho()), { query: 'zzzz qqqq', player_id: null });
    expect(out.summary).toMatch(/^No place in the app matches that\. The main places are: Home, Calendar/);
    expect(out.parts).toBeUndefined();
  });

  it.each([[findInApp], [findInAppForPlayer]])('its schema is a flat strict object with every property required', (tool) => {
    const def = modelToolFor(tool as never);
    const schema = def.input_schema as { type: string; additionalProperties?: boolean; required?: string[]; properties: Record<string, { type?: unknown; anyOf?: unknown }> };
    expect(schema.additionalProperties).toBe(false);
    expect([...(schema.required ?? [])].sort()).toEqual(Object.keys(schema.properties).sort());
    for (const prop of Object.values(schema.properties)) expect(JSON.stringify(prop)).not.toMatch(/"type":"object"/);
    expect(def.description).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('a dashboard request finds the Team board (preview, 12 Nov)', () => {
  it.each(['build me a dashboard showcasing my teams trends this season', 'my team trends this season', 'team dashboard'])('%s', (q) => {
    expect(searchPlaces('coach', q)[0]?.place.id).toBe('coachhelm_board');
  });
});
