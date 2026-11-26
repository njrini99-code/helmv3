import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingSchema } from './drift-server';
import type { BridgeGraph } from './graph';
import { readLiveSnapshot, readPeopleNames, readTeamName } from './live';
import { bridgePseudonym, scrubFreeText } from './pseudonym';
import { DEFAULT_LIVE_SOURCES, withSources, type PackLiveSource, type PackPseudonymizer, type PackTarget } from './pack';
import {
  countersSection,
  envelopesSection,
  releaseSection,
  rulesSection,
  sessionsFor,
  sessionsSection,
  type PackLiveData,
  type PackPeopleLabels,
} from './pack-live';

/**
 * A short, stable, pseudonymous id for a person (D7): the same user reads the same across packs, and the id says
 * nothing about who they are. Keyed (pseudonym.ts), so a list of user ids can't be hashed back to it.
 */
export function pseudonym(userId: string | null | undefined): string | null {
  return bridgePseudonym('person', userId);
}

/** A team's pseudonym, the same way. */
export function teamPseudonym(teamId: string | null | undefined): string | null {
  return bridgePseudonym('team', teamId);
}

/** A session's pseudonym: a session id joins straight to its user, so a pseudonymous pack never prints one. */
export function sessionPseudonym(sessionId: string | null | undefined): string | null {
  return bridgePseudonym('session', sessionId);
}

/** The pseudonymizer buildPack takes, so a person or team pack names its subject the way its rows name people. */
export const packPseudonym: PackPseudonymizer = (kind, id) => (kind === 'person' ? pseudonym(id) : teamPseudonym(id)) ?? (kind === 'person' ? 'u-withheld' : 't-withheld');

/** The admin_events Bridge column a target is filed under, and the value. A finding files under its page. */
function incidentFilter(target: PackTarget): { column: string; value: string | number; prefix?: boolean } {
  switch (target.kind) {
    case 'code':
      return { column: 'bridge_id', value: Number(target.key) };
    case 'action':
      return { column: 'action_id', value: target.key };
    case 'control':
      return { column: 'control_id', value: target.key };
    case 'release':
      // A short SHA matches the full one the column holds.
      return { column: 'release', value: target.ref ?? '', prefix: true };
    case 'person':
      return { column: 'user_id', value: target.ref ?? '' };
    case 'team':
      return { column: 'team_id', value: target.ref ?? '' };
    default:
      return { column: 'page_id', value: target.page ?? target.key };
  }
}

interface IncidentRow {
  created_at: string | null;
  severity: string | null;
  title: string | null;
  ch_code: string | null;
  bridge_id: number | null;
  release: string | null;
  platform: string | null;
  session_id: string | null;
  fingerprint: string | null;
  user_id: string | null;
  team_id: string | null;
}

/**
 * The incidents half of the evidence (plan §9.1 part 3): the newest admin_events rows that carry this target in their
 * Bridge columns. Those columns arrive with held migration 20261124090000; until then the read fails with 42703 and
 * the section says "No signal yet". People come back as pseudonymous ids unless the pack asked for names.
 */
export function adminEventsPackSource(client: SupabaseClient, limit = 12): PackLiveSource {
  const title = 'Incidents (admin_events)';
  return {
    id: 'admin-events',
    title,
    async read(target, _graph, ctx) {
      const filter = incidentFilter(target);
      const base = client
        .from('admin_events')
        .select('created_at, severity, title, ch_code, bridge_id, release, platform, session_id, fingerprint, user_id, team_id');
      const matched = filter.prefix ? base.like(filter.column, `${filter.value}%`) : base.eq(filter.column, filter.value);
      // A person's or team's rows span every sport; the pack (and the Duet door) is Clubhouse's only.
      const filtered = target.kind === 'person' || target.kind === 'team' ? matched.not('page_id', 'is', null) : matched;
      const { data, error } = await filtered.order('created_at', { ascending: false }).limit(limit);
      if (error) {
        if (isMissingSchema(error)) {
          return { source: 'admin-events', title, state: 'no-signal', note: 'No signal yet: admin_events has no Bridge columns until migration 20261124090000 is applied.' };
        }
        // The code only: a database message names columns and can echo values.
        return { source: 'admin-events', title, state: 'failed', note: `The incidents read failed${error.code ? ` (${error.code})` : ''}.` };
      }
      const list = (data ?? []) as IncidentRow[];
      const labels = await peopleLabelsFor(
        list.map((r) => r.user_id),
        list.map((r) => r.team_id),
        ctx.includeNames,
      );
      const rows = list.map((r) => ({
        when: r.created_at,
        severity: r.severity,
        title: ctx.includeNames ? r.title : scrubFreeText(r.title),
        code: r.ch_code ?? (r.bridge_id !== null ? String(r.bridge_id) : null),
        release: r.release ? r.release.slice(0, 7) : null,
        platform: r.platform,
        session: labels.session(r.session_id),
        incident: r.fingerprint ? `/admin/errors/${r.fingerprint}` : null,
        person: labels.person(r.user_id),
        team: labels.team(r.team_id),
      }));
      return {
        source: 'admin-events',
        title,
        state: 'ok',
        note: rows.length ? `The newest ${rows.length} incident row(s) carrying ${ctx.subject}.` : `No incident row carries ${ctx.subject}.`,
        rows,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The live lenses' evidence: counters, envelopes, sessions, release, rules
// ---------------------------------------------------------------------------

/**
 * One read of the live tables for a pack: the rules' snapshot (the last day and the week before it, the failed sessions
 * of the last day and their events, every rule hit). The snapshot already says "no-signal" while the held migration
 * keeps the tables away, and "error" when a read failed.
 */
export async function loadPackLive(graph: BridgeGraph): Promise<PackLiveData> {
  const snap = await readLiveSnapshot(graph);
  if (snap.state !== 'ok') {
    // No database message in a paste: it names columns and can echo values. The screens show the detail to the admin.
    return { state: snap.state, error: snap.errors.length ? 'A live read failed.' : undefined, truncated: snap.truncated, rows: [], sessions: [], events: [], alerts: [] };
  }
  return {
    state: 'ok',
    truncated: snap.truncated,
    rows: [...snap.dayRows, ...snap.baselineRows],
    sessions: snap.failedSessions,
    events: snap.failedEvents,
    alerts: snap.alerts,
  };
}

/**
 * People, teams and sessions as a pack prints them (D7): pseudonyms by default. When names were asked for, a person is
 * their name and a team its name, falling back to the pseudonym; never an email (contact data, and for minors) and
 * never a raw id a token holder could turn into another pack. Session ids stay pseudonymous either way.
 */
export async function peopleLabelsFor(
  userIds: readonly (string | null)[],
  teamIds: readonly (string | null)[],
  includeNames: boolean,
): Promise<PackPeopleLabels> {
  const session = (id: string | null) => sessionPseudonym(id);
  if (!includeNames) return { person: (id) => pseudonym(id), team: (id) => teamPseudonym(id), session };
  const people = [...new Set(userIds.filter((u): u is string => !!u))];
  const teams = [...new Set(teamIds.filter((t): t is string => !!t))].slice(0, 20);
  const [names, teamNames] = await Promise.all([
    people.length ? readPeopleNames(people) : Promise.resolve(new Map<string, { name?: string | null }>()),
    Promise.all(teams.map(async (t) => [t, await readTeamName(t).catch(() => null)] as const)),
  ]);
  const teamName = new Map(teamNames);
  return {
    person: (id) => (id ? (names.get(id)?.name ?? pseudonym(id)) : null),
    team: (id) => (id ? (teamName.get(id) ?? teamPseudonym(id)) : null),
    session,
  };
}

async function peopleLabels(graph: BridgeGraph, target: PackTarget, data: PackLiveData, includeNames: boolean): Promise<PackPeopleLabels> {
  const mine = sessionsFor(graph, target, data.sessions, data.events);
  return peopleLabelsFor(mine.map((s) => s.user_id), mine.map((s) => s.team_id), includeNames);
}

/**
 * The §9.1 evidence from the live lenses (live.ts), replacing DEFAULT_LIVE_SOURCES' "No signal yet" placeholders by id
 * and adding the rules firing. They share one read per pack: build a fresh set for each pack (`load` is for tests).
 */
export function livePackSources(load: (graph: BridgeGraph) => Promise<PackLiveData> = loadPackLive): PackLiveSource[] {
  let cached: Promise<PackLiveData> | null = null;
  const once = (graph: BridgeGraph) => (cached ??= load(graph));
  return [
    { id: 'counters', title: 'Counts and their split', read: async (t, g, ctx) => countersSection(g, t, await once(g), ctx) },
    {
      id: 'envelopes',
      title: 'Representative envelopes',
      read: async (t, g, ctx) => {
        const data = await once(g);
        return envelopesSection(g, t, data, ctx, await peopleLabels(g, t, data, ctx.includeNames));
      },
    },
    {
      id: 'sessions',
      title: 'Sessions',
      read: async (t, g, ctx) => {
        const data = await once(g);
        return sessionsSection(g, t, data, ctx, await peopleLabels(g, t, data, ctx.includeNames));
      },
    },
    { id: 'release', title: 'The release it started in', read: async (t, g, ctx) => releaseSection(g, t, await once(g), ctx) },
    { id: 'rules', title: 'Rules firing', read: async (t, g, ctx) => rulesSection(g, t, await once(g), ctx) },
  ];
}

/**
 * Every evidence source a pack reads, for the Duet desk and the 9.2 door alike, so the two cannot drift: the
 * incidents (admin_events through `client`, when there is one) and the live lenses (through the service role).
 */
export function bridgePackSources(client: SupabaseClient | null): PackLiveSource[] {
  return withSources(DEFAULT_LIVE_SOURCES, [...(client ? [adminEventsPackSource(client)] : []), ...livePackSources()]);
}
