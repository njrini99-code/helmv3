import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingSchema } from './drift-server';
import type { PackLiveSource, PackPseudonymizer, PackTarget } from './pack';

/**
 * A short, stable, pseudonymous id for a person (D7): the same user reads the same across packs, and the id says
 * nothing about who they are. Not reversible without the user table.
 */
export function pseudonym(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `u-${createHash('sha256').update(`bridge-pack:${userId}`).digest('hex').slice(0, 10)}`;
}

/** A team's pseudonym, the same way: `t-` and a SHA-256 prefix. */
export function teamPseudonym(teamId: string | null | undefined): string | null {
  if (!teamId) return null;
  return `t-${createHash('sha256').update(`bridge-pack:${teamId}`).digest('hex').slice(0, 8)}`;
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
  user_email: string | null;
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
        .select('created_at, severity, title, ch_code, bridge_id, release, platform, session_id, fingerprint, user_id, user_email, team_id');
      const filtered = filter.prefix ? base.like(filter.column, `${filter.value}%`) : base.eq(filter.column, filter.value);
      const { data, error } = await filtered.order('created_at', { ascending: false }).limit(limit);
      if (error) {
        if (isMissingSchema(error)) {
          return { source: 'admin-events', title, state: 'no-signal', note: 'No signal yet: admin_events has no Bridge columns until migration 20261124090000 is applied.' };
        }
        return { source: 'admin-events', title, state: 'failed', note: error.message };
      }
      const rows = ((data ?? []) as IncidentRow[]).map((r) => ({
        when: r.created_at,
        severity: r.severity,
        title: r.title,
        code: r.ch_code ?? (r.bridge_id !== null ? String(r.bridge_id) : null),
        release: r.release ? r.release.slice(0, 7) : null,
        platform: r.platform,
        session: r.session_id,
        incident: r.fingerprint ? `/admin/errors/${r.fingerprint}` : null,
        person: ctx.includeNames ? (r.user_email ?? r.user_id) : pseudonym(r.user_id),
        team: r.team_id ? (ctx.includeNames ? r.team_id : teamPseudonym(r.team_id)) : null,
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
