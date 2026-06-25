'use server';
import { fromUntyped } from '@/lib/supabase/untyped';

// =============================================================================
// src/app/baseball/actions/program-settings.ts
//
// Wave 4 / packet: settings-os
//
// NOTE: `demo_mode_enabled` is persisted in the DB schema and mapped in
// mapSettingsRow, but the UI toggle has been removed (PKT-12) because the flag
// has no runtime effect — demo access is unconditionally gated by the shared-
// credential path in demo-access.ts. Re-add the toggle once a real demo-data
// gate implementation reads this flag to branch behavior.
//
// Server actions for the BaseballHelm Settings OS:
//   * getProgramSettings        — read team identity + settings document
//                                 (auto-creates the settings doc with the
//                                 program-type variant defaults on first read).
//   * updateProgramSettings     — capability-gated, audited settings update.
//   * changeProgramType         — capability-gated, audited mode switch; reseeds
//                                 the variant defaults for fields a coach hasn't
//                                 customized is intentionally NOT done (a mode
//                                 switch never silently clobbers saved settings).
//   * listImportSources / upsertImportSource / deleteImportSource
//   * listIntegrations / upsertIntegration
//   * getSettingsAuditLog
//
// EVERY mutation runs inside withBaseballAction({ featureArea, requiredCapability })
// so the capability is enforced SERVER-SIDE (head/primary coach implicitly hold
// every capability; suspended/removed/non-staff hold none). No raw DB errors
// leak. revalidatePath on the settings routes. Sensitive changes are written to
// baseball_settings_audit_log. Reads use the request-scoped RLS client.
//
// NO destructive writes: settings use UPSERT (onConflict team_id); the settings
// doc is created lazily, never delete-then-reinsert.
// =============================================================================

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import {
  getDefaultProgramSettings,
  getProgramVariant,
  type BaseballProgramVariant,
} from '@/lib/baseball/program-type-variants';
import type {
  BaseballProgramType,
  BaseballProgramSettings,
  BaseballProgramSettingsUpdate,
  BaseballTeamProgramFields,
  BaseballImportSourceConfig,
  BaseballImportSourceConfigInsert,
  BaseballIntegrationConfig,
  BaseballSettingsAuditEntry,
  BaseballSettingsAuditEvent,
} from '@/lib/types/baseball-settings';
import { BASEBALL_PROGRAM_TYPES } from '@/lib/types/baseball-settings';
import type {
  BaseballProgramIdentity,
  BaseballProgramIdentityUpdate,
  BaseballProgramBrand,
  BaseballSiblingTeam,
  BaseballPublicProfileMode,
  BaseballPlayerAccountPolicy,
} from '@/lib/types/baseball-program-identity';
import {
  BASEBALL_PUBLIC_PROFILE_MODES,
  BASEBALL_PLAYER_ACCOUNT_POLICIES,
  isValidBrandHex,
} from '@/lib/types/baseball-program-identity';

const SETTINGS_PATHS = [
  '/baseball/dashboard/settings',
  '/baseball/dashboard/settings/program',
  '/baseball/dashboard/settings/imports',
  '/baseball/dashboard/settings/integrations',
  '/baseball/dashboard/settings/audit',
];

function revalidateSettings() {
  for (const p of SETTINGS_PATHS) revalidatePath(p);
}

// -----------------------------------------------------------------------------
// Shapes returned to the client
// -----------------------------------------------------------------------------

export interface ProgramSettingsData {
  teamId: string;
  teamName: string;
  program: BaseballTeamProgramFields;
  /** Program-identity + brand columns on baseball_teams (name, logo, colors, etc.). */
  identity: BaseballProgramIdentity;
  /** Sibling teams in the same org (for the default-team picker; self excluded). */
  siblingTeams: BaseballSiblingTeam[];
  settings: BaseballProgramSettings;
  /** The viewer's capability map (drives edit affordances client-side). */
  viewerCanManageSettings: boolean;
  viewerCanManageImports: boolean;
  /** The active variant descriptor (terminology, role templates, nav priority). */
  variant: SerializableVariant;
}

/** Variant fields safe to send to the client (no functions). */
export interface SerializableVariant {
  programType: BaseballProgramType;
  label: string;
  description: string;
  terminology: BaseballProgramVariant['terminology'];
  roleTemplates: string[];
  coachDefaultLandingId: string;
  playerDefaultLandingId: string;
}

function serializeVariant(v: BaseballProgramVariant): SerializableVariant {
  return {
    programType: v.programType,
    label: v.label,
    description: v.description,
    terminology: v.terminology,
    roleTemplates: v.roleTemplates,
    coachDefaultLandingId: v.coachDefaultLandingId,
    playerDefaultLandingId: v.playerDefaultLandingId,
  };
}

// -----------------------------------------------------------------------------
// Audit helper — write a sensitive-change row (best-effort; never blocks the
// primary mutation, but is gated by RLS so only authorized staff can insert).
// -----------------------------------------------------------------------------

async function writeAudit(
  teamId: string,
  actorUserId: string,
  actorCoachId: string | null,
  eventType: BaseballSettingsAuditEvent,
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

// -----------------------------------------------------------------------------
// getProgramSettings — read (auto-create settings doc with variant defaults)
// -----------------------------------------------------------------------------

export const getProgramSettings = withBaseballAction(
  'getProgramSettings',
  { featureArea: 'baseball-settings' },
  async (ctx): Promise<ProgramSettingsData> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    const caps = await resolveBaseballCapabilities(teamId);

    // Team identity + program + brand columns.
    const { data: teamRow } = await fromUntyped(supabase, 'baseball_teams')
      .select(
        'id, name, organization_id, program_type, competition_level, region_state, timezone, season_label, logo_url, primary_color, secondary_color, public_profile_mode, player_account_policy, default_team_id',
      )
      .eq('id', teamId)
      .maybeSingle();

    const team = (teamRow ?? {}) as Record<string, unknown>;
    const programType = ((team.program_type as string) ?? 'college') as BaseballProgramType;
    const variant = getProgramVariant(programType);

    // Sibling teams in the same org (for the default-team picker). Read-only,
    // RLS-scoped; self is excluded client-side. Empty for single-team programs.
    let siblingTeams: BaseballSiblingTeam[] = [];
    const orgId = (team.organization_id as string | null) ?? null;
    if (orgId) {
      const { data: siblings } = await fromUntyped(supabase, 'baseball_teams')
        .select('id, name')
        .eq('organization_id', orgId)
        .order('name', { ascending: true });
      siblingTeams = ((siblings ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id ?? ''),
        name: String(r.name ?? 'Team'),
      }));
    }

    // Settings doc (1:1). Lazily create with variant defaults if absent AND the
    // viewer may manage settings (read-only viewers get the in-memory defaults).
    let settingsRow = await readSettingsRow(teamId);
    if (!settingsRow) {
      if (caps.can_manage_settings || caps.is_head_coach) {
        settingsRow = await createSettingsRow(teamId, programType, ctx.activeCoachId);
      }
    }

    const settings = settingsRow
      ? mapSettingsRow(settingsRow)
      : mapSettingsRow(synthesizeDefaultRow(teamId, programType));

    const program: BaseballTeamProgramFields = {
      program_type: programType,
      competition_level: (team.competition_level as string | null) ?? null,
      region_state: (team.region_state as string | null) ?? null,
      timezone: (team.timezone as string | null) ?? 'America/New_York',
      season_label: (team.season_label as string | null) ?? null,
    };

    const identity: BaseballProgramIdentity = {
      name: (team.name as string) ?? 'Team',
      logo_url: (team.logo_url as string | null) ?? null,
      primary_color: (team.primary_color as string | null) ?? null,
      secondary_color: (team.secondary_color as string | null) ?? null,
      public_profile_mode:
        ((team.public_profile_mode as string | null) ?? 'private') as BaseballPublicProfileMode,
      player_account_policy:
        ((team.player_account_policy as string | null) ?? 'invite_only') as BaseballPlayerAccountPolicy,
      default_team_id: (team.default_team_id as string | null) ?? null,
    };

    return {
      teamId,
      teamName: (team.name as string) ?? 'Team',
      program,
      identity,
      siblingTeams,
      settings,
      viewerCanManageSettings: caps.can_manage_settings || caps.is_head_coach,
      viewerCanManageImports: caps.can_manage_imports || caps.is_head_coach,
      variant: serializeVariant(variant),
    };
  },
);

// -----------------------------------------------------------------------------
// getProgramBrand — lightweight read for the dashboard shell brand consumer.
// Not capability-gated beyond team membership (every member sees the program's
// own branding). RLS scopes the read to the active team.
// -----------------------------------------------------------------------------

export const getProgramBrand = withBaseballAction(
  'getProgramBrand',
  { featureArea: 'baseball-settings' },
  async (ctx): Promise<BaseballProgramBrand> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    const { data: teamRow } = await fromUntyped(supabase, 'baseball_teams')
      .select('name, logo_url, primary_color')
      .eq('id', teamId)
      .maybeSingle();
    const team = (teamRow ?? {}) as Record<string, unknown>;

    const { data: settingsRow } = await fromUntyped(supabase, 'baseball_program_settings')
      .select('brand_accent, appearance_theme')
      .eq('team_id', teamId)
      .maybeSingle();
    const s = (settingsRow ?? {}) as Record<string, unknown>;

    const theme = s.appearance_theme;
    return {
      brand_accent: typeof s.brand_accent === 'string' ? s.brand_accent : null,
      primary_color: (team.primary_color as string | null) ?? null,
      appearance_theme:
        theme === 'dark' || theme === 'system' || theme === 'light' ? theme : 'light',
      logo_url: (team.logo_url as string | null) ?? null,
      name: (team.name as string) ?? 'Program',
    };
  },
);

async function readSettingsRow(teamId: string): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data } = await fromUntyped(supabase, 'baseball_program_settings')
    .select('*')
    .eq('team_id', teamId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function createSettingsRow(
  teamId: string,
  programType: BaseballProgramType,
  coachId: string | null,
): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const defaults = getDefaultProgramSettings(programType);
  // UPSERT on team_id so a concurrent create is non-destructive.
  const { data } = await fromUntyped(supabase, 'baseball_program_settings')
    .upsert(
      { team_id: teamId, updated_by: coachId, ...defaults },
      { onConflict: 'team_id', ignoreDuplicates: false },
    )
    .select('*')
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? (await readSettingsRow(teamId));
}

// -----------------------------------------------------------------------------
// updateProgramSettings — capability-gated, audited
// -----------------------------------------------------------------------------

export const updateProgramSettings = withBaseballAction(
  'updateProgramSettings',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_settings' },
  async (ctx, patch: BaseballProgramSettingsUpdate): Promise<{ success: true }> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    // Ensure the row exists (lazy create), then read the before-state.
    const before = (await readSettingsRow(teamId)) ?? null;
    if (!before) {
      // Resolve current program type for default seeding.
      const { data: t } = await fromUntyped(supabase, 'baseball_teams')
        .select('program_type')
        .eq('id', teamId)
        .maybeSingle();
      const pt = (((t as Record<string, unknown>)?.program_type as string) ??
        'college') as BaseballProgramType;
      await createSettingsRow(teamId, pt, ctx.activeCoachId);
    }

    const sanitized = sanitizeSettingsPatch(patch);

    await fromUntyped(supabase, 'baseball_program_settings')
      .update({
        ...sanitized,
        updated_by: ctx.activeCoachId,
        updated_at: new Date().toISOString(),
      })
      .eq('team_id', teamId);

    const after = await readSettingsRow(teamId);

    // Audit — classify by which sensitive area changed (best-effort labelling).
    const eventType = classifySettingsChange(sanitized);
    await writeAudit(
      teamId,
      ctx.user.id,
      ctx.activeCoachId,
      eventType,
      summarizeChange(sanitized),
      pickAuditFields(before, Object.keys(sanitized)),
      pickAuditFields(after as Record<string, unknown> | null, Object.keys(sanitized)),
    );

    revalidateSettings();
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// changeProgramType — capability-gated, audited. NEVER clobbers saved settings.
// -----------------------------------------------------------------------------

export const changeProgramType = withBaseballAction(
  'changeProgramType',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_settings' },
  async (ctx, programType: BaseballProgramType): Promise<{ success: true }> => {
    if (!BASEBALL_PROGRAM_TYPES.includes(programType)) {
      throw new Error('Invalid program type.');
    }
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    const { data: t } = await fromUntyped(supabase, 'baseball_teams')
      .select('program_type')
      .eq('id', teamId)
      .maybeSingle();
    const prev = (((t as Record<string, unknown>)?.program_type as string) ??
      'college') as BaseballProgramType;

    if (prev === programType) return { success: true };

    await fromUntyped(supabase, 'baseball_teams')
      .update({ program_type: programType, updated_at: new Date().toISOString() })
      .eq('id', teamId);

    // A mode switch re-orders nav + terminology (read at runtime from
    // program_type) but does NOT silently overwrite a coach's saved settings.
    await writeAudit(
      teamId,
      ctx.user.id,
      ctx.activeCoachId,
      'program_type_changed',
      `Program type changed from ${prev} to ${programType}.`,
      { program_type: prev },
      { program_type: programType },
    );

    revalidateSettings();
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// updateProgramIdentity — capability-gated, audited. Writes the program-identity
// + brand columns on baseball_teams (name, competition level, region/state,
// timezone, season label, logo, brand colors, public-profile mode, player-
// account policy, default team). UPSERT-by-update (row always exists), never
// destructive. (v4 §Program Settings + §Appearance And Brand.)
// -----------------------------------------------------------------------------

export const updateProgramIdentity = withBaseballAction(
  'updateProgramIdentity',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_settings' },
  async (ctx, patch: BaseballProgramIdentityUpdate): Promise<{ success: true }> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    const { update, errors } = sanitizeIdentityPatch(patch);
    if (errors.length > 0) {
      // User-safe validation message (no raw DB error).
      throw new Error(errors[0]);
    }
    if (Object.keys(update).length === 0) return { success: true };

    // Default-team must be a sibling in the same org (or null). Validate
    // server-side so the client can never point it at an arbitrary team.
    if ('default_team_id' in update && update.default_team_id !== null) {
      const ok = await defaultTeamIsSibling(teamId, update.default_team_id as string);
      if (!ok) throw new Error('That team is not part of your program.');
    }

    const before = await readTeamIdentityRow(teamId);

    update.updated_at = new Date().toISOString();
    await fromUntyped(supabase, 'baseball_teams').update(update).eq('id', teamId);

    const after = await readTeamIdentityRow(teamId);
    const changedKeys = Object.keys(update).filter((k) => k !== 'updated_at');

    await writeAudit(
      teamId,
      ctx.user.id,
      ctx.activeCoachId,
      classifyIdentityChange(changedKeys),
      `Program identity updated: ${changedKeys.join(', ')}.`,
      pickAuditFields(before, changedKeys),
      pickAuditFields(after, changedKeys),
    );

    revalidateSettings();
    return { success: true };
  },
);

async function readTeamIdentityRow(teamId: string): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data } = await fromUntyped(supabase, 'baseball_teams')
    .select(
      'name, competition_level, region_state, timezone, season_label, logo_url, primary_color, secondary_color, public_profile_mode, player_account_policy, default_team_id',
    )
    .eq('id', teamId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function defaultTeamIsSibling(teamId: string, candidateId: string): Promise<boolean> {
  if (candidateId === teamId) return true; // pointing at self is allowed
  const supabase = await createClient();
  const { data: self } = await fromUntyped(supabase, 'baseball_teams')
    .select('organization_id')
    .eq('id', teamId)
    .maybeSingle();
  const orgId = ((self as Record<string, unknown>)?.organization_id as string | null) ?? null;
  if (!orgId) return false;
  const { data: cand } = await fromUntyped(supabase, 'baseball_teams')
    .select('id')
    .eq('id', candidateId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return Boolean(cand);
}

// -----------------------------------------------------------------------------
// Import source registry CRUD
// -----------------------------------------------------------------------------

export const listImportSources = withBaseballAction(
  'listImportSources',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_imports' },
  async (ctx): Promise<BaseballImportSourceConfig[]> => {
    const supabase = await createClient();
    const { data } = await fromUntyped(supabase, 'baseball_import_sources')
      .select('*')
      .eq('team_id', ctx.targetTeamId)
      .order('source_name', { ascending: true });
    return (data ?? []) as BaseballImportSourceConfig[];
  },
);

export const upsertImportSource = withBaseballAction(
  'upsertImportSource',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_imports' },
  async (
    ctx,
    input: BaseballImportSourceConfigInsert & { id?: string },
  ): Promise<{ success: true }> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;
    if (!input.source_name?.trim() || !input.source_type?.trim()) {
      throw new Error('Source name and type are required.');
    }

    const payload: Record<string, unknown> = {
      team_id: teamId,
      source_name: input.source_name.trim(),
      source_type: input.source_type.trim(),
      trust_level: input.trust_level ?? 'unreviewed',
      default_visibility: input.default_visibility ?? 'staff_only',
      required_review: input.required_review ?? true,
      dedupe_strictness: input.dedupe_strictness ?? 'standard',
      player_match_strategy: input.player_match_strategy ?? 'name_then_external_id',
      external_id_namespace: input.external_id_namespace ?? null,
      enabled: input.enabled ?? true,
      updated_at: new Date().toISOString(),
    };
    if (input.id) payload.id = input.id;
    else payload.created_by = ctx.activeCoachId;

    // UPSERT on (team_id, source_name) — non-destructive, idempotent.
    await fromUntyped(supabase, 'baseball_import_sources').upsert(payload, {
      onConflict: 'team_id,source_name',
      ignoreDuplicates: false,
    });

    await writeAudit(
      teamId,
      ctx.user.id,
      ctx.activeCoachId,
      'import_source_changed',
      `Import source "${payload.source_name as string}" saved (trust: ${payload.trust_level as string}).`,
      null,
      payload,
    );

    revalidateSettings();
    return { success: true };
  },
);

export const deleteImportSource = withBaseballAction(
  'deleteImportSource',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_imports' },
  async (ctx, sourceId: string): Promise<{ success: true }> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;
    // Scope to the active team (RLS also enforces this).
    await fromUntyped(supabase, 'baseball_import_sources')
      .delete()
      .eq('id', sourceId)
      .eq('team_id', teamId);
    await writeAudit(
      teamId,
      ctx.user.id,
      ctx.activeCoachId,
      'import_source_changed',
      'Import source removed.',
      { id: sourceId },
      null,
    );
    revalidateSettings();
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// Integration adapter contracts (NO vendor calls — contract config only)
// -----------------------------------------------------------------------------

export const listIntegrations = withBaseballAction(
  'listIntegrations',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_settings' },
  async (ctx): Promise<BaseballIntegrationConfig[]> => {
    const supabase = await createClient();
    const { data } = await fromUntyped(supabase, 'baseball_integration_configs')
      .select('*')
      .eq('team_id', ctx.targetTeamId)
      .order('display_name', { ascending: true });
    return (data ?? []) as BaseballIntegrationConfig[];
  },
);

export const upsertIntegration = withBaseballAction(
  'upsertIntegration',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_settings' },
  async (
    ctx,
    input: {
      id?: string;
      provider_key: string;
      display_name: string;
      integration_level: 1 | 2 | 3 | 4;
      status?: BaseballIntegrationConfig['status'];
      config?: Record<string, unknown>;
    },
  ): Promise<{ success: true }> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;
    if (!input.provider_key?.trim() || !input.display_name?.trim()) {
      throw new Error('Provider key and display name are required.');
    }
    // Guardrail: level-4 (direct API) cannot be marked 'configured' here — it
    // stays pending_pilot until pilot evidence + explicit permission (v4).
    let status = input.status ?? 'available';
    if (input.integration_level === 4 && status === 'configured') {
      status = 'pending_pilot';
    }

    const payload: Record<string, unknown> = {
      team_id: teamId,
      provider_key: input.provider_key.trim(),
      display_name: input.display_name.trim(),
      integration_level: input.integration_level,
      status,
      // Strip anything that looks like a credential — contracts only.
      config: stripCredentials(input.config ?? {}),
      updated_at: new Date().toISOString(),
    };
    if (input.id) payload.id = input.id;
    else payload.created_by = ctx.activeCoachId;

    await fromUntyped(supabase, 'baseball_integration_configs').upsert(payload, {
      onConflict: 'team_id,provider_key',
      ignoreDuplicates: false,
    });

    await writeAudit(
      teamId,
      ctx.user.id,
      ctx.activeCoachId,
      'integration_changed',
      `Integration "${payload.display_name as string}" set to level ${input.integration_level} (${status}).`,
      null,
      payload,
    );

    revalidateSettings();
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// Audit log read
// -----------------------------------------------------------------------------

export const getSettingsAuditLog = withBaseballAction(
  'getSettingsAuditLog',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_settings' },
  async (ctx, limit: number = 50): Promise<BaseballSettingsAuditEntry[]> => {
    const supabase = await createClient();
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const { data } = await fromUntyped(supabase, 'baseball_settings_audit_log')
      .select('*')
      .eq('team_id', ctx.targetTeamId)
      .order('created_at', { ascending: false })
      .limit(safeLimit);
    return (data ?? []) as BaseballSettingsAuditEntry[];
  },
);

// -----------------------------------------------------------------------------
// updateOrganizationProfile — capability-gated update for the /dashboard/program
// page. Writes safe columns on the `organizations` table (name, description,
// website_url, location_city, location_state, division, conference,
// primary_color, secondary_color). Requires can_manage_settings.
// Logo URL is updated separately (storage upload is client-side; only the
// resulting public URL is persisted here).
// -----------------------------------------------------------------------------

export interface OrganizationProfileUpdate {
  name?: string;
  description?: string | null;
  website_url?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  division?: string | null;
  conference?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
}

export const updateOrganizationProfile = withBaseballAction(
  'updateOrganizationProfile',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_settings' },
  async (ctx, patch: OrganizationProfileUpdate): Promise<{ success: true }> => {
    const supabase = await createClient();

    // Resolve the coach's organization_id from their coach record.
    const { data: coachRow } = await supabase
      .from('baseball_coaches')
      .select('organization_id')
      .eq('user_id', ctx.user.id)
      .maybeSingle();

    const orgId = coachRow?.organization_id ?? null;
    if (!orgId) throw new Error('No organization associated with this account.');

    // Allowlist the columns we permit to prevent arbitrary column injection.
    const ALLOWED_KEYS: (keyof OrganizationProfileUpdate)[] = [
      'name',
      'description',
      'website_url',
      'location_city',
      'location_state',
      'division',
      'conference',
      'primary_color',
      'secondary_color',
    ];

    const update: Partial<OrganizationProfileUpdate> & { updated_at: string } = {
      updated_at: new Date().toISOString(),
    };
    for (const key of ALLOWED_KEYS) {
      if (key in patch) (update as Record<string, unknown>)[key] = patch[key] ?? null;
    }
    if (Object.keys(update).length === 1) return { success: true }; // nothing to do

    const { error } = await supabase
      .from('organizations')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(update as any)
      .eq('id', orgId);

    if (error) throw new Error('Failed to update program profile.');

    revalidatePath('/baseball/dashboard/program');
    revalidateSettings();
    return { success: true };
  },
);

export const updateOrganizationLogoUrl = withBaseballAction(
  'updateOrganizationLogoUrl',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_settings' },
  async (ctx, logoUrl: string): Promise<{ success: true }> => {
    const supabase = await createClient();

    const { data: coachRow } = await supabase
      .from('baseball_coaches')
      .select('organization_id')
      .eq('user_id', ctx.user.id)
      .maybeSingle();

    const orgId = coachRow?.organization_id ?? null;
    if (!orgId) throw new Error('No organization associated with this account.');

    if (!logoUrl || !/^https?:\/\//i.test(logoUrl)) {
      throw new Error('Logo must be a valid https URL.');
    }

    const { error } = await supabase
      .from('organizations')
      .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
      .eq('id', orgId);

    if (error) throw new Error('Failed to update logo URL.');

    revalidatePath('/baseball/dashboard/program');
    return { success: true };
  },
);

// =============================================================================
// Pure helpers (no I/O)
// =============================================================================

/** Strip keys that look like secrets so contracts never store credentials. */
function stripCredentials(config: Record<string, unknown>): Record<string, unknown> {
  const SECRET_HINTS = ['key', 'secret', 'token', 'password', 'credential', 'apikey', 'api_key'];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    const lower = k.toLowerCase();
    if (SECRET_HINTS.some((h) => lower.includes(h))) continue;
    out[k] = v;
  }
  return out;
}

/** Keys the client must never write directly. */
const FORBIDDEN_SETTINGS_KEYS = new Set([
  'id',
  'team_id',
  'created_at',
  'updated_at',
  'updated_by',
  // demo_mode_enabled: removed from the UI (PKT-12) — no runtime effect until
  // a real demo-data gate is wired. Blocked here so a stale client payload
  // cannot accidentally toggle it on the DB row.
  'demo_mode_enabled',
]);

function sanitizeSettingsPatch(
  patch: BaseballProgramSettingsUpdate,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (FORBIDDEN_SETTINGS_KEYS.has(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

// -----------------------------------------------------------------------------
// Program-identity patch sanitation + validation (v4 guardrails).
// -----------------------------------------------------------------------------

/**
 * Validate + normalize an identity patch into a baseball_teams column update.
 * Returns user-safe error strings (never raw DB errors). Only known identity
 * columns are written; brand colors are validated against the spec hex guardrail
 * (well-formed 6-digit hex or cleared); enum fields are checked against their
 * allowed sets.
 */
function sanitizeIdentityPatch(patch: BaseballProgramIdentityUpdate): {
  update: Record<string, unknown>;
  errors: string[];
} {
  const update: Record<string, unknown> = {};
  const errors: string[] = [];

  const trimOrNull = (v: string | null | undefined): string | null => {
    if (v === undefined) return undefined as unknown as string | null;
    const t = (v ?? '').trim();
    return t.length > 0 ? t : null;
  };

  if (patch.name !== undefined) {
    const name = (patch.name ?? '').trim();
    if (name.length < 2) errors.push('Program name must be at least 2 characters.');
    else if (name.length > 120) errors.push('Program name is too long.');
    else update.name = name;
  }
  if (patch.competition_level !== undefined) update.competition_level = trimOrNull(patch.competition_level);
  if (patch.region_state !== undefined) update.region_state = trimOrNull(patch.region_state);
  if (patch.season_label !== undefined) update.season_label = trimOrNull(patch.season_label);

  if (patch.timezone !== undefined) {
    const tz = (patch.timezone ?? '').trim();
    // Accept any non-empty IANA-shaped string ("Area/Location"); the picker only
    // offers curated values but we don't hard-reject a valid custom zone.
    if (tz.length === 0 || !/^[A-Za-z]+\/[A-Za-z0-9_+/-]+$/.test(tz)) {
      errors.push('Please choose a valid timezone.');
    } else {
      update.timezone = tz;
    }
  }

  if (patch.logo_url !== undefined) {
    const url = trimOrNull(patch.logo_url);
    if (url !== null && !/^https?:\/\//i.test(url)) {
      errors.push('Logo must be a valid http(s) URL.');
    } else {
      update.logo_url = url;
    }
  }

  for (const key of ['primary_color', 'secondary_color'] as const) {
    if (patch[key] !== undefined) {
      const raw = patch[key];
      if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
        update[key] = null; // cleared → fall back to product palette
      } else if (isValidBrandHex(raw)) {
        update[key] = (raw as string).trim().toLowerCase();
      } else {
        errors.push('Brand colors must be a 6-digit hex value (e.g. #16a34a).');
      }
    }
  }

  if (patch.public_profile_mode !== undefined) {
    if (BASEBALL_PUBLIC_PROFILE_MODES.includes(patch.public_profile_mode)) {
      update.public_profile_mode = patch.public_profile_mode;
    } else {
      errors.push('Invalid public profile mode.');
    }
  }
  if (patch.player_account_policy !== undefined) {
    if (BASEBALL_PLAYER_ACCOUNT_POLICIES.includes(patch.player_account_policy)) {
      update.player_account_policy = patch.player_account_policy;
    } else {
      errors.push('Invalid player account policy.');
    }
  }
  if (patch.default_team_id !== undefined) {
    update.default_team_id = patch.default_team_id || null;
  }

  // Drop any undefined-normalized entries (trimOrNull returns undefined for
  // untouched fields above only when the source key was absent — guard anyway).
  for (const k of Object.keys(update)) {
    if (update[k] === undefined) delete update[k];
  }

  return { update, errors };
}

function classifyIdentityChange(keys: string[]): BaseballSettingsAuditEvent {
  if (keys.includes('public_profile_mode')) return 'public_profile_changed';
  // Brand/identity changes have no dedicated event; record as a generic change.
  return 'settings_changed';
}

function classifySettingsChange(patch: Record<string, unknown>): BaseballSettingsAuditEvent {
  const keys = Object.keys(patch);
  if (keys.some((k) => k.startsWith('ai_'))) return 'ai_settings_changed';
  if (keys.some((k) => k.startsWith('guardian_'))) return 'guardian_access_changed';
  if (keys.some((k) => k.startsWith('scout_'))) return 'scout_access_changed';
  if (keys.some((k) => k.includes('public_profile'))) return 'public_profile_changed';
  if (keys.some((k) => k.includes('visibility'))) return 'visibility_changed';
  if (keys.some((k) => k.startsWith('notification') || k.startsWith('quiet_hours')))
    return 'notification_settings_changed';
  if (keys.some((k) => k.includes('retention') || k.includes('archive')))
    return 'data_retention_changed';
  // NOTE: demo_mode_changed is intentionally not classified here — the
  // demo_mode_enabled toggle was removed from the UI (PKT-12) pending a real
  // demo-data gate. The audit-event type is kept in the union so historical log
  // rows still render correctly in SettingsAuditClient.
  return 'settings_changed';
}

function summarizeChange(patch: Record<string, unknown>): string {
  const keys = Object.keys(patch);
  if (keys.length === 0) return 'Settings updated.';
  if (keys.length <= 3) return `Updated: ${keys.join(', ')}.`;
  return `Updated ${keys.length} settings.`;
}

function pickAuditFields(
  row: Record<string, unknown> | null,
  keys: string[],
): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in row) out[k] = row[k];
  return out;
}

// -----------------------------------------------------------------------------
// Settings-row mapping (DB row -> typed BaseballProgramSettings)
// -----------------------------------------------------------------------------

function mapSettingsRow(row: Record<string, unknown>): BaseballProgramSettings {
  const b = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);
  const s = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const n = (v: unknown, d: number): number => (typeof v === 'number' ? v : d);
  return {
    id: String(row.id ?? ''),
    team_id: String(row.team_id ?? ''),
    players_require_invite: b(row.players_require_invite, true),
    players_can_self_join: b(row.players_can_self_join),
    players_can_edit_profile: b(row.players_can_edit_profile),
    players_can_edit_public_profile: b(row.players_can_edit_public_profile),
    players_can_view_team_stats: b(row.players_can_view_team_stats, true),
    players_can_self_log_lift: b(row.players_can_self_log_lift, true),
    players_can_self_report_availability: b(row.players_can_self_report_availability, true),
    players_can_upload_video: b(row.players_can_upload_video),
    players_can_see_ai_summaries: b(row.players_can_see_ai_summaries),
    academics_module_enabled: b(row.academics_module_enabled, true),
    travel_module_enabled: b(row.travel_module_enabled, true),
    performance_module_depth: (s(row.performance_module_depth) ?? 'standard') as BaseballProgramSettings['performance_module_depth'],
    recruiting_exposure_enabled: b(row.recruiting_exposure_enabled),
    public_profiles_enabled: b(row.public_profiles_enabled),
    guardian_access_enabled: b(row.guardian_access_enabled),
    guardian_can_view_schedule: b(row.guardian_can_view_schedule, true),
    guardian_can_view_announcements: b(row.guardian_can_view_announcements, true),
    guardian_can_view_travel: b(row.guardian_can_view_travel, true),
    scout_access_enabled: b(row.scout_access_enabled),
    scout_packet_visibility: (s(row.scout_packet_visibility) ?? 'private') as BaseballProgramSettings['scout_packet_visibility'],
    scout_can_export: b(row.scout_can_export),
    scout_show_unverified_metrics: b(row.scout_show_unverified_metrics),
    default_visibility: (s(row.default_visibility) ?? 'staff_only') as BaseballProgramSettings['default_visibility'],
    ai_enabled: b(row.ai_enabled, true),
    ai_staff_enabled: b(row.ai_staff_enabled, true),
    ai_player_visible_enabled: b(row.ai_player_visible_enabled),
    ai_require_staff_approval: b(row.ai_require_staff_approval, true),
    ai_require_source_refs: b(row.ai_require_source_refs, true),
    ai_confidence_threshold: n(row.ai_confidence_threshold, 0.6),
    ai_stale_after_days: n(row.ai_stale_after_days, 14),
    ai_medical_guardrail: b(row.ai_medical_guardrail, true),
    ai_academic_privacy_guardrail: b(row.ai_academic_privacy_guardrail, true),
    notification_defaults: (row.notification_defaults ?? {}) as BaseballProgramSettings['notification_defaults'],
    quiet_hours_start: s(row.quiet_hours_start),
    quiet_hours_end: s(row.quiet_hours_end),
    brand_accent: s(row.brand_accent),
    appearance_theme: (s(row.appearance_theme) ?? 'light') as BaseballProgramSettings['appearance_theme'],
    season_archive_policy: (s(row.season_archive_policy) ?? 'keep') as BaseballProgramSettings['season_archive_policy'],
    import_retention_days: typeof row.import_retention_days === 'number' ? row.import_retention_days : null,
    audit_retention_days: n(row.audit_retention_days, 365),
    demo_mode_enabled: b(row.demo_mode_enabled),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
    updated_by: s(row.updated_by),
  };
}

/** Build an in-memory default row (for read-only viewers before a doc exists). */
function synthesizeDefaultRow(
  teamId: string,
  programType: BaseballProgramType,
): Record<string, unknown> {
  return {
    id: '',
    team_id: teamId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: null,
    notification_defaults: {},
    ...getDefaultProgramSettings(programType),
  };
}

// -----------------------------------------------------------------------------
// update_program_block_order — drag-reorder for program sections (W5c).
//
// Accepts an ordered array of baseball_lift_sections.id values and writes
// section_order (integer) back to each row in a loop. The column already
// exists (migration 20260624000063 line 241) — no migration needed.
//
// Gated: can_manage_lifting (same gate as the lifting authoring surface;
// settings feature-area is used for consistency with this file's other actions).
// -----------------------------------------------------------------------------

const updateBlockOrderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(500),
});

export interface UpdateBlockOrderResult {
  success: boolean;
  error?: string;
}

export const updateProgramBlockOrder = withBaseballAction(
  'updateProgramBlockOrder',
  { featureArea: 'baseball-settings', requiredCapability: 'can_manage_lifting' },
  async (
    _ctx,
    raw: z.input<typeof updateBlockOrderSchema>,
  ): Promise<UpdateBlockOrderResult> => {
    const input = updateBlockOrderSchema.parse(raw);
    const supabase = await createClient();

    // Write section_order for each id in the ordered array. We update one row at
    // a time rather than a bulk CASE WHEN because the array is typically 2-10 items
    // and the per-row RLS check (team_id match inside the section → day → week →
    // program) keeps the surface area tight.
    for (let i = 0; i < input.orderedIds.length; i++) {
      const id = input.orderedIds[i];
      if (!id) continue;
      const { error } = await fromUntyped(supabase, 'baseball_lift_sections')
        .update({ section_order: i, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    }

    // Revalidate the program editor surface so the updated order is reflected.
    revalidatePath('/baseball/dashboard/performance');

    return { success: true };
  },
);
