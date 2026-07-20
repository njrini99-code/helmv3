'use server';

/**
 * CRM-side read of `golf_demo_sessions` — everyone who walked into the
 * shared self-serve demo at /golf/demo (reached via the Coach Demo Invite
 * email → gate). This is a *visit log*, deliberately kept separate from
 * `demo_requests` (the homepage "Request a demo" form, already surfaced by
 * InboundLeadsView's existing list): gate walk-ins have no status lifecycle,
 * they just tell us who showed up and what they typed into the gate.
 *
 * See supabase/migrations/20260611000000_create_golf_demo_sessions.sql for
 * the table shape — columns are `entered_at` (not `created_at`) and there is
 * NO public RLS policy (RESTRICTIVE deny-all), so every read goes through
 * the service-role (admin) client, gated by requireAdmin() on the
 * user-scoped client FIRST. `golf_demo_sessions` is also not yet in the
 * generated Database type (see demo-tracking.ts:51-54), so the admin client
 * is widened for that one table the same way.
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerException } from '@/lib/server-error-logger';

// ---------------------------------------------------------------------------
// Auth helper — admin role required, mirrors crm-engagement.ts:29-43
// ---------------------------------------------------------------------------
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>();

  if (!profile || profile.role !== 'admin') {
    throw new Error('Forbidden');
  }
}

const DEMO_SESSION_LIMIT = 100;

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------
interface RawDemoSession {
  id: string;
  name: string;
  email: string;
  school: string | null;
  ip: string | null;
  user_agent: string | null;
  referrer: string | null;
  entered_at: string;
}

interface CrmCoachMatchRow {
  id: string;
  email: string | null;
  school: string;
  status: string;
}

export interface DemoSessionRow {
  id: string;
  name: string;
  email: string;
  school: string | null;
  ip: string | null;
  user_agent: string | null;
  referrer: string | null;
  entered_at: string;
  /** Set (case-insensitive email match) when this visitor is already a
      tracked crm_coaches lead — lets the CRM offer "Open coach" inline. */
  matched_coach_id: string | null;
  matched_coach_school: string | null;
  matched_coach_status: string | null;
}

/**
 * Return the most-recent demo-gate visits (limit 100, newest first), each
 * annotated with the crm_coaches row it matches on email, if any.
 *
 * Admin-only: requireAdmin() runs OUTSIDE the try/catch below and throws
 * ('Unauthorized' / 'Forbidden') straight to the caller — mirroring
 * getEngagementSignals in crm-signals.ts. Only the data-fetch step is
 * try/caught, returning [] (and logging) on unexpected query failure so a
 * transient DB hiccup degrades the CRM section gracefully instead of
 * throwing past an admin check that already passed.
 */
export async function getCrmDemoSessions(): Promise<DemoSessionRow[]> {
  await requireAdmin();

  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyAdmin = admin as unknown as { from: (table: string) => any };
    const { data, error } = await anyAdmin
      .from('golf_demo_sessions')
      .select('id, name, email, school, ip, user_agent, referrer, entered_at')
      .order('entered_at', { ascending: false })
      .limit(DEMO_SESSION_LIMIT);

    if (error) throw error instanceof Error ? error : new Error(String(error));

    const sessions = (data ?? []) as RawDemoSession[];
    if (sessions.length === 0) return [];

    // Second query: in-memory join against crm_coaches by email so we can
    // surface a matched coach without a DB-level join on a service-role,
    // RLS-locked table.
    const emails = Array.from(
      new Set(
        sessions
          .map((s) => s.email?.toLowerCase())
          .filter((e): e is string => Boolean(e)),
      ),
    );

    const coachByEmail = new Map<string, CrmCoachMatchRow>();
    if (emails.length > 0) {
      const { data: coachData, error: coachError } = await admin
        .from('crm_coaches')
        .select('id, email, school, status')
        .in('email', emails);

      if (coachError) throw coachError;

      for (const c of (coachData ?? []) as CrmCoachMatchRow[]) {
        if (c.email) coachByEmail.set(c.email.toLowerCase(), c);
      }
    }

    return sessions.map((s) => {
      const match = s.email ? coachByEmail.get(s.email.toLowerCase()) : undefined;
      return {
        id: s.id,
        name: s.name,
        email: s.email,
        school: s.school,
        ip: s.ip,
        user_agent: s.user_agent,
        referrer: s.referrer,
        entered_at: s.entered_at,
        matched_coach_id: match?.id ?? null,
        matched_coach_school: match?.school ?? null,
        matched_coach_status: match?.status ?? null,
      };
    });
  } catch (error) {
    void logServerException(error, {
      action: 'crm_demo_sessions.getCrmDemoSessions',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    return [];
  }
}
