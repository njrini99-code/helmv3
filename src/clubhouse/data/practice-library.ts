import 'server-only';
import { LIBRARY_DRILL_KINDS } from '@/lib/coachhelm/v3/practice-plan/library-kinds';
import { createClient } from '@/lib/supabase/server';
import { practiceTables } from '@/lib/golf/practice-db';
import { isPracticeMissing } from '@/lib/golf/practice-errors';
import { logServerError } from '@/lib/server-error-logger';
import { loadActiveRoster } from '@/lib/coachhelm/v3/chat/context';
import { parsePlanBody, type DrillKind, type PlanArea } from '@/lib/coachhelm/v3/practice-plan/model';
import { AREA_WORDS } from '../screens/practice/starters';
import type { ChDrillDetail, ChDrillRow, ChLibraryLoad, ChPracticeGroup, ChPracticeTemplate, ChRosterRow } from './practice-library-shape';

/** N-00 4.7: what a library category becomes on a copy. A category with no match keeps its own word. */
const TEAM_COLUMNS = 'id, name, area, kind, minutes, players, levels, setup, goal, equipment, scoring, tags, media_url, archived_at';

interface TeamDrillFull {
  id: string;
  name: string;
  area: PlanArea;
  kind: DrillKind;
  minutes: number;
  players: string;
  levels: { par?: string; birdie?: string; eagle?: string } | null;
  setup: string;
  goal: string;
  equipment: Array<{ item: string; qty: number }> | null;
  scoring: Array<{ label: string; points: number }> | null;
  tags: string[] | null;
  media_url: string | null;
  archived_at: string | null;
}

function levelsLine(l: TeamDrillFull['levels']): string | null {
  const parts = [l?.par ? `Par ${l.par}` : null, l?.birdie ? `Birdie ${l.birdie}` : null, l?.eagle ? `Eagle ${l.eagle}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
const teamRow = (d: TeamDrillFull): ChDrillRow => ({ id: d.id, source: 'team', name: d.name, area: d.area, areaLabel: AREA_WORDS[d.area] ?? d.area, kind: d.kind, minutes: d.minutes, players: d.players, levels: levelsLine(d.levels) });
const libRow = (d: { id: string; title: string; category: string | null; duration_min: number | null }): ChDrillRow => {
  const m = d.category ? LIBRARY_DRILL_KINDS[d.category] : undefined;
  return { id: d.id, source: 'lib', name: d.title, area: m?.area ?? null, areaLabel: m ? AREA_WORDS[m.area] : (d.category ?? 'Drill').replace(/_/g, ' '), kind: m?.kind ?? null, minutes: d.duration_min, players: null, levels: null };
};

function missing(code?: string | null) {
  return isPracticeMissing(code ?? null);
}

export async function loadDrills(teamId: string): Promise<ChLibraryLoad<{ team: ChDrillRow[]; library: ChDrillRow[] }>> {
  const sb = await createClient();
  const [team, lib] = await Promise.all([
    practiceTables(sb).from('golf_team_drills').select(TEAM_COLUMNS).eq('team_id', teamId).is('archived_at', null).order('name'),
    sb.from('golf_drills').select('id, title, category, duration_min').order('title').limit(200),
  ]);
  if (team.error) {
    if (missing(team.error.code)) return { status: 'unavailable' };
    await logServerError(`loadDrills: ${team.error.message}`, { action: 'practice.drills' }, 'warning');
    return { status: 'failed' };
  }
  if (lib.error) return { status: 'failed' };
  return { status: 'ready', data: { team: ((team.data ?? []) as unknown as TeamDrillFull[]).map(teamRow), library: (lib.data ?? []).map(libRow) } };
}

export async function loadDrill(teamId: string, drillId: string): Promise<ChLibraryLoad<ChDrillDetail | null>> {
  const sb = await createClient();
  const db = practiceTables(sb);
  const team = await db.from('golf_team_drills').select(TEAM_COLUMNS).eq('team_id', teamId).eq('id', drillId).maybeSingle();
  if (team.error && missing(team.error.code)) return { status: 'unavailable' };
  if (team.error) return { status: 'failed' };
  if (team.data) {
    const d = team.data as unknown as TeamDrillFull;
    // Counted from the plans themselves: a drill ref lives in the plan's body, and there's no index of them.
    const used = await db.from('golf_practice_plans').select('body').eq('team_id', teamId).limit(500);
    const usedIn = used.error ? null : ((used.data ?? []) as Array<{ body: unknown }>).filter((r) => JSON.stringify(r.body).includes(d.id)).length;
    return { status: 'ready', data: { ...teamRow(d), setup: d.setup, goal: d.goal, equipment: d.equipment ?? [], scoring: d.scoring ?? [], tags: d.tags ?? [], mediaUrl: d.media_url, usedIn, archived: !!d.archived_at } };
  }
  const lib = await sb.from('golf_drills').select('id, title, category, duration_min, description').eq('id', drillId).maybeSingle();
  if (lib.error) return { status: 'failed' };
  if (!lib.data) return { status: 'ready', data: null };
  return { status: 'ready', data: { ...libRow(lib.data), setup: lib.data.description ?? '', goal: '', equipment: [], scoring: [], tags: [], mediaUrl: null, usedIn: null, archived: false } };
}

export async function loadGroups(teamId: string): Promise<ChLibraryLoad<{ groups: ChPracticeGroup[]; roster: ChRosterRow[] }>> {
  const sb = await createClient();
  const [groups, roster] = await Promise.all([
    practiceTables(sb).from('golf_practice_groups').select('id, name, player_ids').eq('team_id', teamId).order('name'),
    loadActiveRoster(sb, teamId).catch(() => null),
  ]);
  if (groups.error) return missing(groups.error.code) ? { status: 'unavailable' } : { status: 'failed' };
  if (!roster) return { status: 'failed' };
  return {
    status: 'ready',
    data: {
      groups: ((groups.data ?? []) as Array<{ id: string; name: string; player_ids: string[] }>).map((g) => ({ id: g.id, name: g.name, playerIds: g.player_ids ?? [], usedIn: null })),
      roster: roster.map((p) => ({ id: p.id, name: p.name })),
    },
  };
}

export async function loadTemplates(teamId: string): Promise<ChLibraryLoad<ChPracticeTemplate[]>> {
  const sb = await createClient();
  const { data, error } = await practiceTables(sb).from('golf_practice_templates').select('id, name, kind, minutes, body').eq('team_id', teamId).order('name');
  if (error) return missing(error.code) ? { status: 'unavailable' } : { status: 'failed' };
  const rows = (data ?? []) as Array<{ id: string; name: string; kind: ChPracticeTemplate['kind']; minutes: number | null; body: unknown }>;
  return { status: 'ready', data: rows.flatMap((r) => {
    const body = parsePlanBody(r.body);
    return body ? [{ id: r.id, name: r.name, kind: r.kind, minutes: r.minutes, body }] : [];
  }) };
}
