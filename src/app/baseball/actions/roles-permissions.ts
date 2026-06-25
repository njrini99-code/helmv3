'use server';

// =============================================================================
// src/app/baseball/actions/roles-permissions.ts
//
// Wave 4 / packet: qa-screens (Settings routes coverage completeness)
//
// Read-only resolvers for the two reference surfaces the v4 route map lists but
// that had no home (v4 §Role And Capability Settings):
//
//   * getRoleTemplates  — the role templates that make sense for the active
//                          team's program_type (read from the variant engine),
//                          so /settings/roles is a per-mode role-template picker
//                          reference.
//   * getPermissionMatrix — the capability GROUPS -> server-enforced capability
//                          keys taxonomy, so /settings/permissions makes every
//                          sensitive capability "visible in role settings".
//
// These are REFERENCE views. Capability ASSIGNMENT (which coach holds which
// capability) is performed on the staff surface; both pages link there. Reads run
// inside withBaseballAction so the active-team context + viewer caps resolve
// server-side; no raw DB errors leak. NO golf vocabulary.
// =============================================================================

import { createClient } from '@/lib/supabase/server';

import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { getProgramVariant } from '@/lib/baseball/program-type-variants';
import {
  BASEBALL_CAPABILITY_GROUPS,
  type BaseballCapabilityGroup,
} from '@/lib/baseball/capability-groups';
import type { BaseballProgramType } from '@/lib/types/baseball-settings';

export interface RoleTemplatesData {
  programType: BaseballProgramType;
  programLabel: string;
  roleTemplates: string[];
  viewerCanManageSettings: boolean;
  viewerCanInviteStaff: boolean;
}

export const getRoleTemplates = withBaseballAction(
  'getRoleTemplates',
  { featureArea: 'baseball-settings' },
  async (ctx): Promise<RoleTemplatesData> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;
    const caps = await resolveBaseballCapabilities(teamId);

    const { data: row } = await supabase.from('baseball_teams')
      .select('program_type')
      .eq('id', teamId)
      .maybeSingle();

    const programType = (((row as Record<string, unknown> | null)?.program_type as string) ??
      'college') as BaseballProgramType;
    const variant = getProgramVariant(programType);

    return {
      programType,
      programLabel: variant.label,
      roleTemplates: variant.roleTemplates,
      viewerCanManageSettings: caps.can_manage_settings || caps.is_head_coach,
      viewerCanInviteStaff: caps.can_invite_staff || caps.is_head_coach,
    };
  },
);

export interface PermissionMatrixData {
  groups: BaseballCapabilityGroup[];
  viewerCanManageSettings: boolean;
  viewerCanInviteStaff: boolean;
}

export const getPermissionMatrix = withBaseballAction(
  'getPermissionMatrix',
  { featureArea: 'baseball-settings' },
  async (ctx): Promise<PermissionMatrixData> => {
    const caps = await resolveBaseballCapabilities(ctx.targetTeamId);
    return {
      groups: [...BASEBALL_CAPABILITY_GROUPS],
      viewerCanManageSettings: caps.can_manage_settings || caps.is_head_coach,
      viewerCanInviteStaff: caps.can_invite_staff || caps.is_head_coach,
    };
  },
);
