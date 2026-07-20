'use server';

/**
 * Server actions powering the "Signals" engagement-driven action queues at
 * the top of the CRM Today tab (SignalsPanel.tsx).
 *
 * Turns two data sources that already exist but aren't surfaced anywhere —
 * the `crm_coach_engagement` materialized view (Hot/Warm/Cold temperature +
 * score) and `crm_coaches.next_follow_up_at` — into three ranked, actionable
 * lists: coaches who are hot right now, follow-ups that slipped past their
 * date, and pipeline coaches nobody ever scheduled a next step for.
 *
 * Auth: admin-gated at the action layer, mirroring crm-engagement.ts:29-43.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerException } from '@/lib/server-error-logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SignalCoach {
  id: string;
  name: string;
  school: string | null;
  status: string;
  temperature?: string;
  score?: number;
  last_event_at?: string | null;
  next_follow_up_at?: string | null;
  last_contacted_at?: string | null;
}

export interface EngagementSignals {
  hot: SignalCoach[];
  overdue: SignalCoach[];
  noNextStep: SignalCoach[];
  noNextStepTotal: number;
}

const CRM_REVALIDATE_PATH = '/golf/admin/crm';

// A coach in either of these terminal statuses is out of active play —
// never worth surfacing as an actionable signal.
const CLOSED_STATUSES = new Set(['won', 'lost']);
// Known-bad deliverability states — mirrors the send-gate used elsewhere in
// the CRM (e.g. TodayQueue's hasValidEmail/email_status check).
const BAD_EMAIL_STATUSES = new Set(['bounced', 'complained', 'unsubscribed']);
const NO_NEXT_STEP_STATUSES = ['contacted', 'engaged', 'proposal'] as const;

const HOT_ROW_LIMIT = 8;
const OVERDUE_ROW_LIMIT = 8;
const NO_NEXT_STEP_ROW_LIMIT = 8;
// overdue/noNextStep can't push the BAD_EMAIL_STATUSES exclusion into the DB
// filter (a `.not('email_status', 'in', ...)` would silently drop legacy
// NULL-email_status rows too — the exact NULL-unsafe trap is_archived has,
// see the .or('is_archived.is.null,...') below). So they over-fetch this
// multiple of the row limit and filter/slice in JS instead, mirroring
// getHotSignals (24 fetched / 8 kept = 3x).
const ROW_LIMIT_BUFFER_FACTOR = 3;

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

// Read-path gate — mirrors crm-engagement.ts:29-43 exactly. Intentionally
// left unwrapped by try/catch: an unauthenticated/non-admin caller should
// see the thrown error (there is no "safe empty default" for an auth
// failure), only the per-list DB reads below degrade to [].
async function requireAdmin(): Promise<void> {
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

// Write-path gate — copies the getAuthedClient() idiom from
// crm-foundations.ts:36 (throw Unauthorized; RLS covers the rest).
async function getAuthedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return { supabase, user };
}

// ---------------------------------------------------------------------------
// Internal row shapes
// ---------------------------------------------------------------------------
interface EngagementScoreRow {
  coach_id: string;
  score: number | null;
  temperature: string | null;
  last_event_at: string | null;
}

interface CoachSignalRow {
  id: string;
  name: string;
  school: string | null;
  status: string;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  is_archived: boolean | null;
  email_status: string | null;
}

const COACH_SIGNAL_COLUMNS =
  'id, name, school, status, next_follow_up_at, last_contacted_at, is_archived, email_status';

// A coach whose email is known-bad should never surface as an actionable
// signal anywhere — a dead-email row earning quick-set buttons wastes
// operator time exactly like it would in the hot list.
function hasBadEmail(coach: Pick<CoachSignalRow, 'email_status'>): boolean {
  return !!coach.email_status && BAD_EMAIL_STATUSES.has(coach.email_status);
}

// ---------------------------------------------------------------------------
// hot — top-scoring "Hot" coaches from crm_coach_engagement, joined in
// memory against crm_coaches (a materialized view can't be filtered on
// crm_coaches columns in a single PostgREST call) and filtered down to
// still-actionable rows.
// ---------------------------------------------------------------------------
async function getHotSignals(): Promise<SignalCoach[]> {
  try {
    const admin = createAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: engagementData, error: engagementError } = await (admin as any)
      .from('crm_coach_engagement')
      .select('coach_id, score, temperature, last_event_at')
      .eq('temperature', 'Hot')
      .order('score', { ascending: false })
      .limit(24);

    if (engagementError) throw engagementError;

    const engagementRows = (engagementData ?? []) as EngagementScoreRow[];
    if (engagementRows.length === 0) return [];

    const coachIds = engagementRows.map((r) => r.coach_id);
    const { data: coachData, error: coachError } = await admin
      .from('crm_coaches')
      .select(COACH_SIGNAL_COLUMNS)
      .in('id', coachIds);

    if (coachError) throw coachError;

    const coachById = new Map<string, CoachSignalRow>();
    for (const c of (coachData ?? []) as CoachSignalRow[]) {
      coachById.set(c.id, c);
    }

    const out: SignalCoach[] = [];
    for (const row of engagementRows) {
      const coach = coachById.get(row.coach_id);
      if (!coach) continue;
      if (coach.is_archived) continue;
      if (CLOSED_STATUSES.has(coach.status)) continue;
      if (hasBadEmail(coach)) continue;

      out.push({
        id: coach.id,
        name: coach.name,
        school: coach.school,
        status: coach.status,
        temperature: row.temperature ?? undefined,
        score: row.score ?? undefined,
        last_event_at: row.last_event_at,
        next_follow_up_at: coach.next_follow_up_at,
        last_contacted_at: coach.last_contacted_at,
      });
      if (out.length >= HOT_ROW_LIMIT) break;
    }
    return out;
  } catch (error) {
    void logServerException(error, {
      action: 'crm_signals.getHotSignals',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// overdue — follow-ups whose date has already passed.
// ---------------------------------------------------------------------------
async function getOverdueSignals(): Promise<SignalCoach[]> {
  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data, error } = await admin
      .from('crm_coaches')
      .select(COACH_SIGNAL_COLUMNS)
      .lt('next_follow_up_at', nowIso)
      // NULL-safe: a plain .eq('is_archived', false) drops rows where the
      // column is NULL (unarchived-by-default legacy rows) — see the same
      // fix in crm-dedup.ts / crm-gmail-send.ts / crm-templates.ts.
      .or('is_archived.is.null,is_archived.eq.false')
      .not('status', 'in', '(won,lost)')
      .order('next_follow_up_at', { ascending: true })
      .limit(OVERDUE_ROW_LIMIT * ROW_LIMIT_BUFFER_FACTOR);

    if (error) throw error;

    return ((data ?? []) as CoachSignalRow[])
      .filter((c) => !hasBadEmail(c))
      .slice(0, OVERDUE_ROW_LIMIT)
      .map((c) => ({
        id: c.id,
        name: c.name,
        school: c.school,
        status: c.status,
        next_follow_up_at: c.next_follow_up_at,
        last_contacted_at: c.last_contacted_at,
      }));
  } catch (error) {
    void logServerException(error, {
      action: 'crm_signals.getOverdueSignals',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// noNextStep — pipeline coaches (contacted/engaged/proposal) nobody ever
// scheduled a follow-up for.
// ---------------------------------------------------------------------------
async function getNoNextStepSignals(): Promise<{ rows: SignalCoach[]; total: number }> {
  try {
    const admin = createAdminClient();

    const { data, error, count } = await admin
      .from('crm_coaches')
      .select(COACH_SIGNAL_COLUMNS, { count: 'exact' })
      .in('status', [...NO_NEXT_STEP_STATUSES])
      .is('next_follow_up_at', null)
      // NULL-safe: a plain .eq('is_archived', false) drops rows where the
      // column is NULL (unarchived-by-default legacy rows) — see the same
      // fix in crm-dedup.ts / crm-gmail-send.ts / crm-templates.ts. `count`
      // (the "N in pipeline with no follow-up" headline) is computed against
      // this same filter set, independent of .limit()/.range().
      .or('is_archived.is.null,is_archived.eq.false')
      .order('last_contacted_at', { ascending: true, nullsFirst: true })
      .limit(NO_NEXT_STEP_ROW_LIMIT * ROW_LIMIT_BUFFER_FACTOR);

    if (error) throw error;

    const rows = ((data ?? []) as CoachSignalRow[])
      .filter((c) => !hasBadEmail(c))
      .slice(0, NO_NEXT_STEP_ROW_LIMIT)
      .map((c) => ({
        id: c.id,
        name: c.name,
        school: c.school,
        status: c.status,
        next_follow_up_at: c.next_follow_up_at,
        last_contacted_at: c.last_contacted_at,
      }));

    return { rows, total: count ?? rows.length };
  } catch (error) {
    void logServerException(error, {
      action: 'crm_signals.getNoNextStepSignals',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    return { rows: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// getEngagementSignals — the three lists SignalsPanel renders.
// ---------------------------------------------------------------------------
export async function getEngagementSignals(): Promise<EngagementSignals> {
  await requireAdmin();

  const [hot, overdue, noNextStep] = await Promise.all([
    getHotSignals(),
    getOverdueSignals(),
    getNoNextStepSignals(),
  ]);

  return {
    hot,
    overdue,
    noNextStep: noNextStep.rows,
    noNextStepTotal: noNextStep.total,
  };
}

// ---------------------------------------------------------------------------
// setNextFollowUp — quick-set action from any Signals row. RLS on
// crm_coaches covers authorization (admin-only), so getAuthedClient() only
// needs to fail fast on a missing session.
// ---------------------------------------------------------------------------
export async function setNextFollowUp(
  coachId: string,
  followUpAt: string | null,
): Promise<{ success: true }> {
  const { supabase } = await getAuthedClient();

  const { error } = await supabase
    .from('crm_coaches')
    .update({ next_follow_up_at: followUpAt })
    .eq('id', coachId);

  if (error) {
    throw new Error(`Failed to set next follow-up: ${error.message}`);
  }

  revalidatePath(CRM_REVALIDATE_PATH);
  return { success: true };
}
