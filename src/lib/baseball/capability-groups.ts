// =============================================================================
// src/lib/baseball/capability-groups.ts
//
// Wave 4 / packet: qa-screens (Settings routes coverage completeness)
//
// The v4 §Role And Capability Settings capability GROUPS, mapped to the
// server-enforced BaseballCapability keys. This is the reference model that the
// /settings/permissions surface renders so a coach can SEE which capabilities
// belong to which group — and that every sensitive capability is "visible in
// role settings" (v4 acceptance: "every sensitive capability ... visible in
// role settings"). Pure + isomorphic (no React, no Supabase). NO golf vocab.
//
// Capability ASSIGNMENT (who holds what) lives on the staff surface; this module
// only describes the capability taxonomy so roles/permissions are understandable
// without a support engineer.
// =============================================================================

import type { BaseballCapability } from '@/lib/baseball/capabilities';

export interface BaseballCapabilityGroup {
  /** Stable group key (v4 §Capability groups). */
  key: string;
  /** Human label. */
  label: string;
  /** One-line description of what the group controls. */
  description: string;
  /** The server-enforced capability keys in this group. */
  capabilities: BaseballCapability[];
  /** Whether the group governs staff-only / sensitive surfaces (v4 emphasis). */
  sensitive: boolean;
}

/**
 * v4 §Capability groups, projected onto the V11 capability keys that actually
 * exist and are enforced by has_baseball_staff_capability(). Groups in the spec
 * that don't have a dedicated key yet (e.g. wellness/travel/documents) are folded
 * under the closest enforced capability so the surface stays honest — it never
 * claims a capability the server can't check.
 */
export const BASEBALL_CAPABILITY_GROUPS: readonly BaseballCapabilityGroup[] = [
  {
    key: 'roster',
    label: 'Roster',
    description: 'Add, edit, and organize players on the roster.',
    capabilities: ['can_manage_roster'],
    sensitive: false,
  },
  {
    key: 'schedule',
    label: 'Schedule',
    description: 'Manage the calendar, games, and events.',
    capabilities: ['can_manage_calendar'],
    sensitive: false,
  },
  {
    key: 'practice',
    label: 'Practice',
    description: 'Build and run practice plans and templates.',
    capabilities: ['can_manage_practice'],
    sensitive: false,
  },
  {
    key: 'stats',
    label: 'Stats',
    description: 'Enter, review, and manage performance stats.',
    capabilities: ['can_manage_stats'],
    sensitive: false,
  },
  {
    key: 'performance',
    label: 'Performance & lifting',
    description: 'Strength groups, lift assignments, and readiness.',
    capabilities: ['can_manage_lifting', 'can_view_readiness'],
    sensitive: false,
  },
  {
    key: 'wellness',
    label: 'Wellness & medical',
    description: 'View medical and private wellness detail. Sensitive — staff only.',
    capabilities: ['can_view_medical', 'can_view_private_notes'],
    sensitive: true,
  },
  {
    key: 'academics',
    label: 'Academics',
    description: 'View academic eligibility and class-conflict detail.',
    capabilities: ['can_view_academics'],
    sensitive: true,
  },
  {
    key: 'lineups',
    label: 'Lineups',
    description: 'Build and publish lineups.',
    capabilities: ['can_manage_lineups'],
    sensitive: false,
  },
  {
    key: 'availability',
    label: 'Availability',
    description: 'Modify player availability and status.',
    capabilities: ['can_modify_availability'],
    sensitive: false,
  },
  {
    key: 'messages',
    label: 'Messages',
    description: 'Message players and the team.',
    capabilities: ['can_message_players'],
    sensitive: false,
  },
  {
    key: 'imports',
    label: 'Imports',
    description: 'Register import sources and commit imports.',
    capabilities: ['can_manage_imports'],
    sensitive: true,
  },
  {
    key: 'reports',
    label: 'Reports & exports',
    description: 'Export reports and packets. Sensitive — leaves the platform.',
    capabilities: ['can_export_reports'],
    sensitive: true,
  },
  {
    key: 'documents',
    label: 'Documents',
    description: 'Upload and manage team document library.',
    capabilities: ['can_manage_documents'],
    sensitive: true,
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Manage program, team, season, and access settings.',
    capabilities: ['can_manage_settings'],
    sensitive: true,
  },
  {
    key: 'staff',
    label: 'Staff & audit',
    description: 'Invite staff and view the settings audit log. Sensitive.',
    capabilities: ['can_invite_staff'],
    sensitive: true,
  },
] as const;
