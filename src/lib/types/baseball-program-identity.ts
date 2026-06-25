// =============================================================================
// src/lib/types/baseball-program-identity.ts
//
// Wave 4 / packet: settings-os (program-identity completeness follow-up)
//
// HAND-WRITTEN TypeScript types for the program-identity columns added to
// baseball_teams by:
//   * supabase/migrations/20260624000091_baseball_program_identity.sql
//     (public_profile_mode, player_account_policy, default_team_id)
//
// plus the already-existing baseball_teams identity columns this surface edits
// (name, logo_url, primary_color, secondary_color) which had no dedicated type.
//
// Owned by THIS packet because the migration is WRITTEN, NOT APPLIED — Supabase
// generated types cannot be regenerated against an unapplied schema. Reconcile
// with the generated Database barrel once the migration lands.
// =============================================================================

/** How a program's public profile is exposed (v4 §Program Settings). */
export type BaseballPublicProfileMode = 'private' | 'unlisted' | 'public';

export const BASEBALL_PUBLIC_PROFILE_MODES: readonly BaseballPublicProfileMode[] = [
  'private',
  'unlisted',
  'public',
] as const;

/** Program-level player-account stance (v4 §Program Settings). */
export type BaseballPlayerAccountPolicy =
  | 'invite_only'
  | 'approval_required'
  | 'open_join';

export const BASEBALL_PLAYER_ACCOUNT_POLICIES: readonly BaseballPlayerAccountPolicy[] = [
  'invite_only',
  'approval_required',
  'open_join',
] as const;

/**
 * The full program-identity field set surfaced in Program Settings. Mirrors the
 * editable baseball_teams columns (existing + newly added). `season_label`,
 * `competition_level`, `region_state`, `timezone`, `program_type` live in
 * BaseballTeamProgramFields (baseball-settings.ts); this type carries the
 * remaining identity + brand columns so the Program Identity / Appearance
 * editors have a single typed shape.
 */
export interface BaseballProgramIdentity {
  /** Program name (baseball_teams.name). */
  name: string;
  /** Logo image URL (baseball_teams.logo_url). */
  logo_url: string | null;
  /** Primary brand color (baseball_teams.primary_color), hex. */
  primary_color: string | null;
  /** Secondary brand color (baseball_teams.secondary_color), hex. */
  secondary_color: string | null;
  /** Public profile exposure mode. */
  public_profile_mode: BaseballPublicProfileMode;
  /** Program-level player-account policy. */
  player_account_policy: BaseballPlayerAccountPolicy;
  /** Default team for multi-team orgs (null = this team). */
  default_team_id: string | null;
}

/** Patch shape for updateProgramIdentity (all fields optional). */
export interface BaseballProgramIdentityUpdate {
  name?: string;
  competition_level?: string | null;
  region_state?: string | null;
  timezone?: string;
  season_label?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  public_profile_mode?: BaseballPublicProfileMode;
  player_account_policy?: BaseballPlayerAccountPolicy;
  default_team_id?: string | null;
}

/** A sibling team in the same org, for the default-team picker. */
export interface BaseballSiblingTeam {
  id: string;
  name: string;
}

/** Brand values consumed by the dashboard shell to render program branding. */
export interface BaseballProgramBrand {
  /** Brand accent (program_settings.brand_accent) — the sanctioned single accent. */
  brand_accent: string | null;
  /** Team primary color (baseball_teams.primary_color) — fallback accent source. */
  primary_color: string | null;
  /** Theme preference. */
  appearance_theme: 'light' | 'dark' | 'system';
  /** Logo URL, surfaced where the shell shows program identity. */
  logo_url: string | null;
  /** Program name. */
  name: string;
}

// -----------------------------------------------------------------------------
// IANA timezone options offered in the Program Identity editor. A curated North
// American + common-international set (not an exhaustive tz database) — coaches
// pick from a readable list rather than free-typing an IANA string.
// -----------------------------------------------------------------------------

export const BASEBALL_TIMEZONE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Phoenix', label: 'Mountain — no DST (Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'America/Puerto_Rico', label: 'Atlantic (Puerto Rico)' },
  { value: 'America/Toronto', label: 'Eastern — Canada (Toronto)' },
  { value: 'America/Mexico_City', label: 'Central — Mexico (Mexico City)' },
] as const;

/**
 * Validate a user-supplied brand hex color. Spec guardrail (v4 §Appearance And
 * Brand): keep readability, no oversaturated chaos. We accept only well-formed
 * 6-digit hex; saturation/lightness clamping is applied at render time by the
 * shell consumer so a stored value is never silently rewritten.
 */
export function isValidBrandHex(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}
