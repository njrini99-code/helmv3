/**
 * Read-model: Staff Settings (Decision Room → Staff tab)
 *
 * Wires the previously-empty `loadStaffSettings` stub to the real prod tables:
 *   - baseball_team_coach_staff   → active staff members + per-member capabilities + role
 *   - baseball_staff_invitations  → pending staff invitations
 *
 * RLS SAFETY: callers MUST pass the AUTHENTICATED server supabase client
 * (`await createClient()` from '@/lib/supabase/server'). Every query here is
 * additionally scoped to `teamId` so a caller can only see their own team's
 * staff. Never call this with the service-role/admin client.
 *
 * This is a plain server module — NO 'use server'. Reads only; no writes.
 *
 * Type shapes (StaffMemberView, StaffInvitationView, StaffSettingsData) are
 * imported from the action module so this read-model always matches the exact
 * shape the UI consumes. Do not redefine them here.
 */
import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  StaffMemberView,
  StaffInvitationView,
  StaffSettingsData,
} from '@/app/baseball/actions/decision-room';

/**
 * Shape of a `baseball_team_coach_staff` row, joined to the owning coach's
 * profile (`baseball_coaches`) for display name / email / avatar / title.
 *
 * Column names verified against the live prod schema via information_schema.
 */
interface StaffRow {
  id: string;
  team_id: string;
  coach_id: string;
  role: string | null;
  title: string | null;
  status: string;
  is_primary: boolean | null;
  is_head_coach: boolean;
  visible_to_players: boolean;
  bio: string | null;
  phone: string | null;
  scope_player_ids: string[] | null;
  scope_group_ids: string[] | null;
  capabilities: Record<string, boolean> | null;
  created_at: string | null;
  // Per-column capability booleans (the canonical source of truth in this table).
  can_manage_roster: boolean;
  can_manage_practice: boolean;
  can_manage_lifting: boolean;
  can_view_academics: boolean;
  can_manage_imports: boolean;
  can_manage_stats: boolean;
  can_invite_staff: boolean;
  can_manage_settings: boolean;
  can_view_medical: boolean;
  can_message_players: boolean;
  can_manage_calendar: boolean;
  can_manage_lineups: boolean;
  can_view_readiness: boolean;
  can_modify_availability: boolean;
  can_view_private_notes: boolean;
  can_export_reports: boolean;
  // Joined coach profile (nullable if the coach row was removed).
  baseball_coaches: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    title: string | null;
  } | null;
}

interface InvitationRow {
  id: string;
  team_id: string;
  email: string;
  invitee_name: string | null;
  role: string | null;
  capabilities: Record<string, boolean> | null;
  status: string;
  message: string | null;
  token: string;
  invited_by: string | null;
  invited_by_coach_id: string | null;
  expires_at: string;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
  created_at: string;
}

/** The discrete capability flags stored as columns on baseball_team_coach_staff. */
const CAPABILITY_COLUMNS = [
  'can_manage_roster',
  'can_manage_practice',
  'can_manage_lifting',
  'can_view_academics',
  'can_manage_imports',
  'can_manage_stats',
  'can_invite_staff',
  'can_manage_settings',
  'can_view_medical',
  'can_message_players',
  'can_manage_calendar',
  'can_manage_lineups',
  'can_view_readiness',
  'can_modify_availability',
  'can_view_private_notes',
  'can_export_reports',
] as const;

/**
 * Collapse the per-column capability booleans (plus any extra keys carried in
 * the `capabilities` jsonb) into a single flat map the UI can render.
 * Column booleans take precedence over jsonb so the typed columns stay
 * canonical.
 */
function buildCapabilities(row: StaffRow): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  // Start from the jsonb blob (may carry capabilities not modelled as columns).
  if (row.capabilities && typeof row.capabilities === 'object') {
    for (const [k, v] of Object.entries(row.capabilities)) {
      out[k] = Boolean(v);
    }
  }
  // Overlay the canonical typed columns.
  for (const col of CAPABILITY_COLUMNS) {
    out[col] = Boolean(row[col]);
  }
  return out;
}

function mapStaffRow(row: StaffRow): StaffMemberView {
  const coach = row.baseball_coaches;
  const capabilities = buildCapabilities(row);
  return {
    id: row.id,
    coachId: row.coach_id,
    name: coach?.full_name ?? null,
    email: coach?.email ?? null,
    avatarUrl: coach?.avatar_url ?? null,
    role: row.role ?? null,
    title: row.title ?? coach?.title ?? null,
    isPrimary: Boolean(row.is_primary),
    isHeadCoach: Boolean(row.is_head_coach),
    status: row.status,
    visibleToPlayers: Boolean(row.visible_to_players),
    bio: row.bio ?? null,
    phone: row.phone ?? null,
    scopePlayerIds: row.scope_player_ids ?? [],
    scopeGroupIds: row.scope_group_ids ?? [],
    capabilities,
    createdAt: row.created_at ?? null,
  } as StaffMemberView;
}

function mapInvitationRow(row: InvitationRow): StaffInvitationView {
  return {
    id: row.id,
    email: row.email,
    role: row.role ?? null,
    token: row.status === 'accepted' || row.status === 'revoked' ? '' : row.token,
    status: row.status,
    expiresAt: row.expires_at,
    isExpired: new Date(row.expires_at) < new Date(),
    invitedByName: row.invited_by ?? null,
  };
}

/**
 * Load the Staff Settings panel for a team.
 *
 * @param supabase AUTHENTICATED server client (RLS-scoped to the caller).
 * @param teamId   The team whose staff to load.
 *
 * Returns active staff members, pending invitations, and whether the caller
 * is permitted to manage staff. Honest empties on missing data — never
 * fabricated rows.
 */
export async function loadStaffSettings(
  supabase: SupabaseClient,
  teamId: string,
): Promise<StaffSettingsData> {
  if (!teamId) {
    return { staff: [], invitations: [], canManageStaff: false };
  }

  // Staff members for this team, joined to the coach profile for display.
  // Active members surface first; ordered for a stable list.
  const { data: staffData, error: staffError } = await supabase
    .from('baseball_team_coach_staff')
    .select(
      `id, team_id, coach_id, role, title, status, is_primary, is_head_coach,
       visible_to_players, bio, phone, scope_player_ids, scope_group_ids,
       capabilities, created_at,
       can_manage_roster, can_manage_practice, can_manage_lifting,
       can_view_academics, can_manage_imports, can_manage_stats,
       can_invite_staff, can_manage_settings, can_view_medical,
       can_message_players, can_manage_calendar,
       can_manage_lineups, can_view_readiness, can_modify_availability,
       can_view_private_notes, can_export_reports,
       baseball_coaches:coach_id ( id, full_name, email, avatar_url, title )`,
    )
    .eq('team_id', teamId)
    .order('is_head_coach', { ascending: false })
    .order('created_at', { ascending: true });

  if (staffError) {
    // RLS denial or transient error → honest empty, never throw the UI down.
    return { staff: [], invitations: [], canManageStaff: false };
  }

  const staffRows = (staffData ?? []) as unknown as StaffRow[];
  const staff = staffRows.map(mapStaffRow);

  // Pending invitations only — accepted/revoked/expired are not "pending".
  const { data: inviteData, error: inviteError } = await supabase
    .from('baseball_staff_invitations')
    .select(
      `id, team_id, email, invitee_name, role, capabilities, status, message,
       token, invited_by, invited_by_coach_id, expires_at, accepted_at,
       accepted_by_user_id, created_at`,
    )
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const invitationRows = inviteError
    ? []
    : ((inviteData ?? []) as unknown as InvitationRow[]);
  const invitations = invitationRows.map(mapInvitationRow);

  // canManageStaff: the caller can manage staff if their own active staff row
  // grants can_invite_staff or can_manage_settings, or they are head coach.
  // We derive this from the caller's auth user → their coach row → their
  // staff row for this team (all RLS-scoped).
  const canManageStaff = await resolveCanManageStaff(supabase, teamId);

  return { staff, invitations, canManageStaff };
}

/**
 * Determine whether the authenticated caller may manage staff for this team.
 * Resolves auth user → baseball_coaches.id → their baseball_team_coach_staff
 * row → capability flags. All scoped by RLS + team_id.
 */
async function resolveCanManageStaff(
  supabase: SupabaseClient,
  teamId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach?.id) return false;

  const { data: myStaff } = await supabase
    .from('baseball_team_coach_staff')
    .select('is_head_coach, can_invite_staff, can_manage_settings, status')
    .eq('team_id', teamId)
    .eq('coach_id', coach.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!myStaff) return false;

  return Boolean(
    myStaff.is_head_coach ||
      myStaff.can_invite_staff ||
      myStaff.can_manage_settings,
  );
}
