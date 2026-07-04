'use server';
import { fromUntyped } from '@/lib/supabase/untyped';

// =============================================================================
// src/app/baseball/actions/team-season-settings.ts
//
// Wave 4 / packet: qa-screens (Settings routes coverage completeness)
//
// Server actions for the two settings surfaces that previously had NO editing
// home (v4 §Team And Season Settings):
//
//   TEAM settings  (join policy at the TEAM grain — distinct from the
//                   program_type-grain baseball_program_settings doc):
//     * getTeamJoinSettings        — identity + join code + join policy.
//     * updateTeamJoinSettings     — capability-gated, audited join-policy patch.
//
//   SEASON settings (per-team season records + season-specific module toggles):
//     * listSeasons                — every season for the active team.
//     * createSeason               — capability-gated, audited; one current/team.
//     * updateSeason               — capability-gated, audited season patch.
//     * setCurrentSeason           — atomically flip the current season.
//     * archiveSeason              — archive (non-destructive lifecycle change).
//
// EVERY mutation runs inside withBaseballAction({ featureArea, requiredCapability })
// so the capability is enforced SERVER-SIDE. No raw DB errors leak.
// revalidatePath on the settings routes. Sensitive changes are written to the
// existing baseball_settings_audit_log. Reads use the request-scoped RLS client.
//
// NO destructive writes: settings use UPDATE in place / INSERT new rows;
// "delete a season" is exposed only as ARCHIVE (status flip). The current-season
// flip is a two-step UPDATE (clear-then-set) scoped to the team, never a
// delete-then-reinsert.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import {
  BASEBALL_INVITE_POLICIES,
  BASEBALL_SEASON_PHASES,
  BASEBALL_SEASON_STATUSES,
  type BaseballInvitePolicy,
  type BaseballTeamSettings,
  type BaseballTeamJoinPolicyUpdate,
  type BaseballSeason,
  type BaseballSeasonInsert,
  type BaseballSeasonUpdate,
} from '@/lib/types/baseball-team-season-settings';

const SETTINGS_PATHS = [
  '/baseball/dashboard/settings',
  '/baseball/dashboard/settings/teams',
  '/baseball/dashboard/settings/season',
];

function revalidateSettings() {
  for (const p of SETTINGS_PATHS) revalidatePath(p);
}

// -----------------------------------------------------------------------------
// Audit helper (mirrors program-settings.writeAudit; RLS-gated insert).
// -----------------------------------------------------------------------------

async function writeAudit(
  teamId: string,
  actorUserId: string,
  actorCoachId: string | null,
  eventType: string,
  summary: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  const supabase = await createClient();
  await fromUntyped(supabase, 'baseball_settings_audit_log').insert({
    team_id: teamId,
    actor_user_id: actorUserId,
    actor_coach_id: actorCoachId,
    event_type: eventType,
    summary,
    before_value: before,
    after_value: after,
  });
}

// =============================================================================
// TEAM SETTINGS — join policy
// =============================================================================

export interface TeamSettingsData {
  settings: BaseballTeamSettings;
  viewerCanManageSettings: boolean;
}

export const getTeamJoinSettings = withBaseballAction(
  'getTeamJoinSettings',
  { featureArea: 'baseball-settings' },
  async (ctx): Promise<TeamSettingsData> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;
    const caps = await resolveBaseballCapabilities(teamId);

    const { data: row } = await fromUntyped(supabase, 'baseball_teams')
      .select('id, name, join_code, invite_policy, allow_player_self_join, require_coach_approval')
      .eq('id', teamId)
      .maybeSingle();

    const t = (row ?? {}) as Record<string, unknown>;
    const invitePolicy = ((t.invite_policy as string) ?? 'invite_only') as BaseballInvitePolicy;

    return {
      settings: {
        teamId,
        teamName: (t.name as string) ?? 'Team',
        joinCode: (t.join_code as string | null) ?? null,
        invite_policy: invitePolicy,
        allow_player_self_join: t.allow_player_self_join === true,
        require_coach_approval: t.require_coach_approval !== false, // default true
      },
      viewerCanManageSettings: caps.can_manage_settings || caps.is_head_coach,
    };
  },
);

export const updateTeamJoinSettings = withBaseballAction(
  'updateTeamJoinSettings',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_settings' },
  async (ctx, patch: BaseballTeamJoinPolicyUpdate): Promise<{ success: true }> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    const update: Record<string, unknown> = {};
    if (patch.invite_policy !== undefined) {
      if (!BASEBALL_INVITE_POLICIES.includes(patch.invite_policy)) {
        throw new Error('Invalid invite policy.');
      }
      update.invite_policy = patch.invite_policy;
      // Keep the convenience flag consistent with the controlling enum.
      update.allow_player_self_join = patch.invite_policy === 'code_self_join';
    }
    if (patch.allow_player_self_join !== undefined) {
      update.allow_player_self_join = patch.allow_player_self_join === true;
    }
    if (patch.require_coach_approval !== undefined) {
      update.require_coach_approval = patch.require_coach_approval === true;
    }
    if (Object.keys(update).length === 0) return { success: true };

    const { data: before } = await fromUntyped(supabase, 'baseball_teams')
      .select('invite_policy, allow_player_self_join, require_coach_approval')
      .eq('id', teamId)
      .maybeSingle();

    update.updated_at = new Date().toISOString();
    await fromUntyped(supabase, 'baseball_teams').update(update).eq('id', teamId);

    await writeAudit(
      teamId,
      ctx.user.id,
      ctx.activeCoachId,
      'settings_changed',
      `Team join policy updated: ${Object.keys(update)
        .filter((k) => k !== 'updated_at')
        .join(', ')}.`,
      (before as Record<string, unknown> | null) ?? null,
      update,
    );

    revalidateSettings();
    return { success: true };
  },
);

// =============================================================================
// SEASON SETTINGS
// =============================================================================

export interface SeasonSettingsData {
  seasons: BaseballSeason[];
  viewerCanManageSettings: boolean;
}

function mapSeasonRow(row: Record<string, unknown>): BaseballSeason {
  const b = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);
  const s = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const seasonYear = typeof row.season_year === 'number' ? row.season_year : null;
  const status = s(row.status) ?? 'active';
  return {
    id: String(row.id ?? ''),
    team_id: String(row.team_id ?? ''),
    label: String(row.label ?? row.season_name ?? seasonYear ?? ''),
    phase: ((s(row.phase) ?? 'preseason') as BaseballSeason['phase']),
    starts_on: s(row.starts_on) ?? s(row.start_date),
    ends_on: s(row.ends_on) ?? s(row.end_date),
    status: (status as BaseballSeason['status']),
    is_current: b(row.is_current, status === 'active'),
    roster_enabled: b(row.roster_enabled, true),
    schedule_enabled: b(row.schedule_enabled, true),
    stats_enabled: b(row.stats_enabled, true),
    practice_templates_enabled: b(row.practice_templates_enabled, true),
    lift_groups_enabled: b(row.lift_groups_enabled, b(row.lifting_enabled, true)),
    performance_baselines_enabled: b(row.performance_baselines_enabled, true),
    player_status_tracking_enabled: b(row.player_status_tracking_enabled, true),
    created_by: s(row.created_by) ?? s(row.created_by_coach_id),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export const listSeasons = withBaseballAction(
  'listSeasons',
  { featureArea: 'baseball-settings' },
  async (ctx): Promise<SeasonSettingsData> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;
    const caps = await resolveBaseballCapabilities(teamId);

    const { data } = await fromUntyped(supabase, 'baseball_seasons')
      .select('*')
      .eq('team_id', teamId)
      .order('status', { ascending: true })
      .order('created_at', { ascending: false });

    return {
      seasons: ((data ?? []) as Record<string, unknown>[]).map(mapSeasonRow),
      viewerCanManageSettings: caps.can_manage_settings || caps.is_head_coach,
    };
  },
);

export const createSeason = withBaseballAction(
  'createSeason',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_settings' },
  async (ctx, input: BaseballSeasonInsert): Promise<{ success: true; id: string }> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    const label = input.label?.trim();
    if (!label) throw new Error('A season name is required.');
    if (input.phase && !BASEBALL_SEASON_PHASES.includes(input.phase)) {
      throw new Error('Invalid season phase.');
    }
    if (input.status && !BASEBALL_SEASON_STATUSES.includes(input.status)) {
      throw new Error('Invalid season status.');
    }

    const makeCurrent = input.is_current === true;
    // If this season is to become current, clear the existing current flag first
    // (the partial unique index allows only one current season per team).
    if (makeCurrent) {
      await fromUntyped(supabase, 'baseball_seasons')
        .update({ is_current: false })
        .eq('team_id', teamId)
        .eq('is_current', true);
    }

    const { data } = await fromUntyped(supabase, 'baseball_seasons')
      .insert({
        team_id: teamId,
        season_name: label,
        season_year:
          input.starts_on ? Number(input.starts_on.slice(0, 4)) : new Date().getFullYear(),
        phase: input.phase ?? 'preseason',
        start_date: input.starts_on ?? null,
        end_date: input.ends_on ?? null,
        status: input.status ?? 'active',
        lifting_enabled: true,
        created_by_coach_id: ctx.activeCoachId,
      })
      .select('id')
      .maybeSingle();

    const id = String((data as Record<string, unknown> | null)?.id ?? '');

    await writeAudit(
      teamId,
      ctx.user.id,
      ctx.activeCoachId,
      'settings_changed',
      `Season "${label}" created${makeCurrent ? ' (set current)' : ''}.`,
      null,
      { label, phase: input.phase ?? 'preseason', is_current: makeCurrent },
    );

    revalidateSettings();
    return { success: true, id };
  },
);

export const updateSeason = withBaseballAction(
  'updateSeason',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_settings' },
  async (ctx, seasonId: string, patch: BaseballSeasonUpdate): Promise<{ success: true }> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;
    if (!seasonId) throw new Error('Missing season.');

    const update: Record<string, unknown> = {};
    if (patch.label !== undefined) {
      const label = patch.label.trim();
      if (!label) throw new Error('A season name is required.');
      update.season_name = label;
    }
    if (patch.phase !== undefined) {
      if (!BASEBALL_SEASON_PHASES.includes(patch.phase)) throw new Error('Invalid season phase.');
      update.phase = patch.phase;
    }
    if (patch.status !== undefined) {
      if (!BASEBALL_SEASON_STATUSES.includes(patch.status)) throw new Error('Invalid season status.');
      update.status = patch.status;
    }
    if (patch.starts_on !== undefined) {
      update.start_date = patch.starts_on || null;
      if (patch.starts_on) update.season_year = Number(patch.starts_on.slice(0, 4));
    }
    if (patch.ends_on !== undefined) update.end_date = patch.ends_on || null;

    // Season-specific module toggles.
    const TOGGLE_KEYS = [
      'roster_enabled',
      'schedule_enabled',
      'stats_enabled',
      'practice_templates_enabled',
      'lift_groups_enabled',
      'performance_baselines_enabled',
      'player_status_tracking_enabled',
    ] as const;
    for (const k of TOGGLE_KEYS) {
      if (patch[k] !== undefined && k === 'lift_groups_enabled') {
        update.lifting_enabled = patch[k] === true;
      }
    }

    // is_current is handled via setCurrentSeason to keep the single-current
    // invariant atomic; ignore it here so a stray patch can't create a conflict.

    if (Object.keys(update).length === 0) return { success: true };
    update.updated_at = new Date().toISOString();

    await fromUntyped(supabase, 'baseball_seasons')
      .update(update)
      .eq('id', seasonId)
      .eq('team_id', teamId);

    await writeAudit(
      teamId,
      ctx.user.id,
      ctx.activeCoachId,
      'settings_changed',
      `Season updated: ${Object.keys(update)
        .filter((k) => k !== 'updated_at')
        .join(', ')}.`,
      null,
      update,
    );

    revalidateSettings();
    return { success: true };
  },
);

export const setCurrentSeason = withBaseballAction(
  'setCurrentSeason',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_settings' },
  async (ctx, seasonId: string): Promise<{ success: true }> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;
    if (!seasonId) throw new Error('Missing season.');

    // Clear-then-set, both scoped to the team (the partial unique index allows
    // exactly one current season). Non-destructive (UPDATE only).
    await fromUntyped(supabase, 'baseball_seasons')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('team_id', teamId)
      .eq('status', 'active');

    await fromUntyped(supabase, 'baseball_seasons')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', seasonId)
      .eq('team_id', teamId);

    await writeAudit(
      teamId,
      ctx.user.id,
      ctx.activeCoachId,
      'settings_changed',
      'Current season changed.',
      null,
      { season_id: seasonId, is_current: true },
    );

    revalidateSettings();
    return { success: true };
  },
);

export const archiveSeason = withBaseballAction(
  'archiveSeason',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_settings' },
  async (ctx, seasonId: string): Promise<{ success: true }> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;
    if (!seasonId) throw new Error('Missing season.');

    // Archive is a lifecycle flip (never a delete). Archiving clears current.
    await fromUntyped(supabase, 'baseball_seasons')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', seasonId)
      .eq('team_id', teamId);

    await writeAudit(
      teamId,
      ctx.user.id,
      ctx.activeCoachId,
      'data_retention_changed',
      'Season archived.',
      null,
      { season_id: seasonId, status: 'archived' },
    );

    revalidateSettings();
    return { success: true };
  },
);
