// =============================================================================
// src/lib/types/helm-lifting.ts
//
// HAND-WRITTEN Row/Insert/Update types for the Helm Lifting Lab identity &
// access tables created by:
//   supabase/migrations/20260625000000_helm_lifting_identity.sql
//
// These are the type contract until a post-apply `db:types` regen. Actions use
// the fromUntyped() accessor pattern (src/lib/supabase/untyped.ts) so there are
// no compile errors against the generated database.ts.
//
// Convention: Row = exact DB shape; Insert = optional where DB has a default or
// nullable; Update = Partial<Insert> + updated_at.
// =============================================================================

// -----------------------------------------------------------------------------
// String-enum vocabularies (mirror CHECK constraints in the migration)
// -----------------------------------------------------------------------------

export type HelmLiftingCoachStatus = 'active' | 'suspended' | 'removed';
export type HelmLiftingSport = 'baseball' | 'golf';
export type HelmLiftingInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type HelmLiftingViewerGrantedBy = 'invite_accept' | 'onboarding_no_coach' | 'manual';

// -----------------------------------------------------------------------------
// helm_lifting_coaches
// -----------------------------------------------------------------------------

export interface HelmLiftingCoachRow {
  id: string;
  user_id: string;
  organization_id: string;
  full_name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: HelmLiftingCoachStatus;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface HelmLiftingCoachInsert {
  id?: string;
  user_id: string;
  organization_id: string;
  full_name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  status?: HelmLiftingCoachStatus;
  onboarding_completed?: boolean;
}

export type HelmLiftingCoachUpdate = Partial<HelmLiftingCoachInsert> & { updated_at?: string };

// -----------------------------------------------------------------------------
// helm_lifting_coach_assignments
// -----------------------------------------------------------------------------

export interface HelmLiftingCoachAssignmentRow {
  id: string;
  coach_id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  team_id: string | null;
  team_name_snapshot: string | null;
  is_active: boolean;
  assigned_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HelmLiftingCoachAssignmentInsert {
  id?: string;
  coach_id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  team_id?: string | null;
  team_name_snapshot?: string | null;
  is_active?: boolean;
  assigned_by_user_id?: string | null;
}

export type HelmLiftingCoachAssignmentUpdate =
  Partial<HelmLiftingCoachAssignmentInsert> & { updated_at?: string };

// -----------------------------------------------------------------------------
// helm_lifting_athletes
// -----------------------------------------------------------------------------

export interface HelmLiftingAthleteRow {
  id: string;
  organization_id: string;
  sport: HelmLiftingSport;
  sport_player_id: string | null;
  user_id: string | null;
  team_id: string | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HelmLiftingAthleteInsert {
  id?: string;
  organization_id: string;
  sport: HelmLiftingSport;
  sport_player_id?: string | null;
  user_id?: string | null;
  team_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  is_active?: boolean;
}

export type HelmLiftingAthleteUpdate = Partial<HelmLiftingAthleteInsert> & { updated_at?: string };

// -----------------------------------------------------------------------------
// helm_lifting_org_viewers
// -----------------------------------------------------------------------------

export interface HelmLiftingOrgViewerRow {
  id: string;
  organization_id: string;
  user_id: string;
  sport: HelmLiftingSport;
  source_team_id: string | null;
  granted_by: string;
  can_edit: boolean;
  created_at: string;
}

export interface HelmLiftingOrgViewerInsert {
  id?: string;
  organization_id: string;
  user_id: string;
  sport: HelmLiftingSport;
  source_team_id?: string | null;
  granted_by?: string;
  can_edit?: boolean;
}

// No Update — viewer rows are managed by the accept RPC (service_role).

// -----------------------------------------------------------------------------
// helm_lifting_coach_invites
// -----------------------------------------------------------------------------

export interface HelmLiftingCoachInviteRow {
  id: string;
  organization_id: string;
  email: string;
  token: string;
  invited_by_user_id: string | null;
  invited_by_sport: HelmLiftingSport;
  source_team_id: string | null;
  role_title: string | null;
  status: HelmLiftingInviteStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface HelmLiftingCoachInviteInsert {
  id?: string;
  organization_id: string;
  email: string;
  token?: string; // DB-defaulted; never client-set
  invited_by_user_id?: string | null;
  invited_by_sport: HelmLiftingSport;
  source_team_id?: string | null;
  role_title?: string | null;
  status?: HelmLiftingInviteStatus;
  expires_at?: string;
}

export type HelmLiftingCoachInviteUpdate =
  Partial<HelmLiftingCoachInviteInsert> & { updated_at?: string };

// -----------------------------------------------------------------------------
// Access resolution result (used by src/lib/lifting/access.ts)
// -----------------------------------------------------------------------------

export interface HelmLiftingAccessResult {
  isCoach: boolean;
  canEdit: boolean;
  canView: boolean;
  coachRow: HelmLiftingCoachRow | null;
  assignments: HelmLiftingCoachAssignmentRow[];
}
