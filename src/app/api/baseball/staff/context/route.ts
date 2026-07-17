// =============================================================================
// src/app/api/baseball/staff/context/route.ts
//
// Wave 2 / packet: auth-join
//
// AUTHORITATIVE server resolution of a coaching-staff member's capability map.
//
// The client hook `useBaseballStaffAuth` (src/hooks/use-baseball-staff-auth.ts)
// POSTs here to learn what the current authenticated coach may do on a team. The
// browser NEVER decides capabilities — this route resolves them server-side from
// baseball_team_coach_staff under RLS via the shared resolvers in
// src/lib/baseball/capabilities.ts, scoped to the active team resolved by
// src/lib/baseball/active-context.ts.
//
// CONTRACT (must match the hook's `normalizeContext` parser exactly):
//   Request:  POST { teamId: string | null }   (content-type: application/json)
//   Response (200, staff member):
//     {
//       coachId:   string | null,
//       teamId:    string | null,
//       staffRole: string | null,
//       isPrimary: boolean,
//       isHeadCoach: boolean,
//       capabilities: { <12 capability keys>: boolean }
//     }
//
// FAIL-CLOSED: unauthenticated, no active team, or not a staff member returns a
// non-2xx status with an all-false capability payload. The hook treats any
// non-OK response as "authenticated non-staff with zero capabilities", so the
// status is what drives deny-by-default; the zero payload is belt-and-braces.
// Errors never leak DB details and the handler never throws raw.
// =============================================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import {
  getBaseballStaff,
  resolveBaseballCapabilities,
  BASEBALL_CAPABILITY_KEYS,
  type BaseballCapabilityMap,
} from '@/lib/baseball/capabilities';
import { logServerException } from '@/lib/server-error-logger';

/** Always re-resolve per request — capabilities are auth- and cookie-dependent. */
export const dynamic = 'force-dynamic';

/** The wire shape the hook's `normalizeContext` consumes. */
interface StaffContextPayload {
  coachId: string | null;
  teamId: string | null;
  staffRole: string | null;
  isPrimary: boolean;
  isHeadCoach: boolean;
  capabilities: BaseballCapabilityMap;
}

/** All-false capability map — the safe default for every deny path. */
function emptyCapabilities(): BaseballCapabilityMap {
  return BASEBALL_CAPABILITY_KEYS.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {} as BaseballCapabilityMap);
}

/** A fully-populated, zero-capability payload for fail-closed responses. */
function failClosedPayload(teamId: string | null): StaffContextPayload {
  return {
    coachId: null,
    teamId,
    staffRole: null,
    isPrimary: false,
    isHeadCoach: false,
    capabilities: emptyCapabilities(),
  };
}

/**
 * Read an optional `teamId` from the request body without trusting its type.
 * The body is the only client input and is used ONLY to scope which team's
 * capabilities to resolve — it can never grant a capability, and the team is
 * still validated against real staff membership under RLS below.
 */
async function readRequestedTeamId(request: NextRequest): Promise<string | null> {
  try {
    const raw: unknown = await request.json();
    if (raw && typeof raw === 'object') {
      const candidate = (raw as { teamId?: unknown }).teamId;
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
    }
  } catch {
    // Missing/invalid body is fine — fall back to the active-team cookie.
  }
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestedTeamId = await readRequestedTeamId(request);

  try {
    // 1. Authoritative identity. Store identity in the browser can be stale.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(failClosedPayload(requestedTeamId), { status: 401 });
    }

    // 2. Resolve the team to scope to. An explicit, valid teamId wins; otherwise
    //    fall back to the server-validated active-team context.
    let teamId = requestedTeamId;
    if (!teamId) {
      const activeContext = await getActiveBaseballContext();
      teamId = activeContext?.activeTeamId ?? null;
    }
    if (!teamId) {
      return NextResponse.json(failClosedPayload(null), { status: 403 });
    }

    // 3. Resolve the staff membership (RLS-scoped: a coach only ever reads their
    //    own row, which also validates the requested team belongs to them).
    const staff = await getBaseballStaff(teamId);
    if (!staff) {
      // Authenticated, but not a staff member of this team -> zero capabilities.
      return NextResponse.json(failClosedPayload(teamId), { status: 403 });
    }

    // 4. Resolve the full capability map server-side from the same membership.
    const capabilities = await resolveBaseballCapabilities(teamId);

    const payload: StaffContextPayload = {
      coachId: staff.coach_id,
      teamId,
      staffRole: staff.role,
      isPrimary: staff.is_primary,
      isHeadCoach: capabilities.is_head_coach,
      capabilities,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    // Never leak DB errors; fail closed with a non-2xx + zero-capability body.
    await logServerException(error, {
      action: 'baseballStaffContextApi.post',
      route: '/api/baseball/staff/context',
      url: request.url,
      source: 'route_handler',
      sport: 'baseball',
      featureArea: 'baseball_staff_capabilities',
      handled: false,
      statusCode: 500,
      teamId: requestedTeamId,
    });
    return NextResponse.json(failClosedPayload(requestedTeamId), { status: 500 });
  }
}
