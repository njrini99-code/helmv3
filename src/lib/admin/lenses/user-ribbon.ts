import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchUserDetail } from '@/lib/admin/data/users';
import { fetchReleaseLedger } from '@/lib/admin/data/release-ledger';
import { isUuid } from '@/lib/utils/uuid';

/**
 * User Journey Ribbon lens (brief §20-27: "Users: ... User Journey Ribbon on
 * detail (Login → Dashboard → Start round → Autosave → Submit → Stats →
 * CoachHelm) with incidents, sessions, release, flags/cohort, trace/replay
 * availability").
 *
 * PII / OPAQUE-ID CONTRACT: this module's return type carries NO email and
 * NO name — only the caller-supplied subject id (already an opaque uuid,
 * the same one every other admin_events-backed page keys on) and structural
 * counts/timestamps. `fetchUserDetail()` (reused below for events/activity)
 * DOES return user_email on its raw rows; this module reads it internally
 * only to decide which admin_events rows belong to this user (email is one
 * of the identity fields some event writers use) and never copies it into
 * the returned `UserJourneyRibbon`. A caller that wants to render the
 * user's name/email does so from its OWN fetchUserDetail/fetchUsersTab call
 * at the page level — normal admin-console display, not a props leak.
 *
 * REUSE: built on fetchUserDetail() (already returns memberships,
 * recentActivity, authEvents, errorEvents for one user) rather than
 * re-querying admin_events from scratch. Adds two targeted, user-scoped
 * queries fetchUserDetail does not: round_submitted and ai_generation event
 * counts, which are the only durable "did this stage succeed" signals this
 * codebase writes (see golf-journey.ts's header for why admin_events cannot
 * usually answer this — the login/round_submitted/ai_generation event types
 * are the deliberate exceptions, per src/lib/admin-logger.ts).
 *
 * Stages this codebase genuinely cannot answer (Dashboard, Autosave, Stats)
 * render `reached: null` — never coerced to false (which would read as "we
 * checked and it didn't happen") or true (fabricated).
 */

export interface RibbonStage {
  id: string;
  label: string;
  /** null = not instrumented, cannot say either way. */
  reached: boolean | null;
  /** ISO timestamp of the most recent evidence, or null. */
  at: string | null;
  sourceNote: string;
}

export interface UserJourneyRibbon {
  /** The subject id the caller passed in — never an email or a name. */
  subjectRef: string;
  /**
   * Tri-state — the caller MUST check this before rendering the ribbon,
   * and MUST render the three states differently:
   *   - `true`  — a `users` row confirmed to exist for `subjectRef`.
   *   - `false` — CONFIRMED absent: either `subjectRef` is not even
   *     UUID-shaped (gated before any query reaches the database — a
   *     malformed id can never match a stored uuid) or a direct existence
   *     check succeeded and found no row.
   *   - `null`  — UNKNOWN: the existence check itself failed (timeout,
   *     connection fault, ...). This is NOT the same as `false`.
   *     `fetchUserDetail()` (reused below for events/activity) does not
   *     check its own `users` query's error and collapses both cases to
   *     `user: null` — that collapse is exactly what `found` exists to
   *     undo, via a dedicated existence check with its own error capture.
   *     Render `null` as "temporarily unavailable" (e.g. `PanelStale`),
   *     never as "not found" (`PanelNoData`) — a transient read failure is
   *     not evidence the user doesn't exist.
   */
  found: boolean | null;
  stages: RibbonStage[];
  incidents: { count: number | null; recentTitles: readonly string[] };
  /** Login-event count as a session-count proxy — noted as such, not a true
   *  session-table count (this codebase has no session table). */
  sessions: { count: number | null };
  release: { sha: string | null; sinceIso: string | null };
  flagsCohort: { note: string };
  traceReplayAvailable: boolean;
  /** Link to the existing semantic-thread page for this user — reuse, not
   *  a rebuild of entity-thread.ts. */
  threadHref: string;
  generatedAt: string;
  degradedNote: string | null;
}

/** Shared shape for every early-return path (malformed id / confirmed
 *  absent / existence check unreadable) — none of them have real stage or
 *  activity data to show, so none of them should compute any. */
function emptyRibbon(userId: string, found: boolean | null, now: Date, degradedNote: string | null): UserJourneyRibbon {
  return {
    subjectRef: userId,
    found,
    stages: [],
    incidents: { count: null, recentTitles: [] },
    sessions: { count: null },
    release: { sha: null, sinceIso: null },
    flagsCohort: { note: 'Not tracked — this codebase has no feature-flag/cohort assignment table to read from.' },
    traceReplayAvailable: false,
    threadHref: `/admin/thread/user/${userId}`,
    generatedAt: now.toISOString(),
    degradedNote,
  };
}

export async function fetchUserJourneyRibbon(userId: string, now: Date = new Date()): Promise<UserJourneyRibbon> {
  const admin = createAdminClient();
  const degraded: string[] = [];

  // Malformed ids never match a stored uuid — a deterministic "not found",
  // and gated BEFORE any query reaches the database rather than surfacing
  // as a 22P02 "invalid input syntax for type uuid" that would otherwise
  // masquerade as "unreadable" (the #1767 [id]-page convention).
  if (!isUuid(userId)) {
    return emptyRibbon(userId, false, now, null);
  }

  const [existsRes, detail, roundSubmittedRes, aiGenRes, releaseLedger] = await Promise.all([
    // A DEDICATED existence check with its OWN error capture.
    // fetchUserDetail()'s internal `users` query (reused below for
    // events/activity) does NOT check its error — a timeout or connection
    // fault there resolves `user: null` identically to a genuinely absent
    // id, which is exactly the collapse `found` must not repeat.
    admin.from('users').select('id').eq('id', userId).maybeSingle(),
    fetchUserDetail(userId),
    admin
      .from('admin_events')
      .select('id, created_at')
      .eq('user_id', userId)
      .eq('event_type', 'round_submitted')
      .order('created_at', { ascending: false })
      .limit(1),
    admin
      .from('admin_events')
      .select('id, created_at')
      .eq('user_id', userId)
      .eq('event_type', 'ai_generation')
      .order('created_at', { ascending: false })
      .limit(1),
    fetchReleaseLedger(),
  ]);

  const found: boolean | null = existsRes.error ? null : existsRes.data !== null;
  if (existsRes.error) {
    // Unreadable, not absent — return early rather than building stages
    // off `detail`, whose own `user: null` on this same failure mode is
    // exactly what this check exists to not trust.
    return emptyRibbon(userId, null, now, `user existence check failed: ${existsRes.error.message}`);
  }
  if (!found) {
    return emptyRibbon(userId, false, now, null);
  }

  if (roundSubmittedRes.error) degraded.push(`round_submitted read failed: ${roundSubmittedRes.error.message}`);
  if (aiGenRes.error) degraded.push(`ai_generation read failed: ${aiGenRes.error.message}`);
  if (releaseLedger.status === 'error') degraded.push(`release ledger unreadable: ${releaseLedger.error ?? 'unknown error'}`);

  const lastLogin = detail.authEvents.find((e) => e.event_type === 'login') ?? null;
  const lastRound = detail.recentActivity.find((a) => a.kind === 'round') ?? null;
  const lastSubmitted = roundSubmittedRes.error ? null : roundSubmittedRes.data?.[0] ?? null;
  const lastAiGen = aiGenRes.error ? null : aiGenRes.data?.[0] ?? null;

  const stages: RibbonStage[] = [
    {
      id: 'login',
      label: 'Login',
      reached: detail.authEvents.length > 0 ? detail.authEvents.some((e) => e.event_type === 'login') : null,
      at: lastLogin?.created_at ?? null,
      sourceNote: 'admin_events login rows for this user (captured since Bridge began tracking auth events).',
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      reached: null,
      at: null,
      sourceNote: 'Viewing the dashboard writes no durable event for this user — not instrumented.',
    },
    {
      id: 'start_round',
      label: 'Start round',
      reached: detail.recentActivity.length > 0 ? Boolean(lastRound) : null,
      at: lastRound?.at ?? null,
      sourceNote: 'golf_rounds rows for this player (via fetchUserDetail\'s recentActivity).',
    },
    {
      id: 'autosave',
      label: 'Autosave',
      reached: null,
      at: null,
      sourceNote: 'No per-user autosave event exists — see golf-journey.ts for the platform-level proxy this ribbon does not attempt per-user.',
    },
    {
      id: 'submit',
      label: 'Submit',
      reached: roundSubmittedRes.error ? null : lastSubmitted !== null,
      at: lastSubmitted?.created_at ?? null,
      sourceNote: 'admin_events round_submitted rows for this user (logRoundSubmitted, a genuine success write).',
    },
    {
      id: 'stats',
      label: 'Stats',
      reached: null,
      at: null,
      sourceNote: 'Stats are computed from existing round data on view — no distinct per-user event exists.',
    },
    {
      id: 'coachhelm',
      label: 'CoachHelm',
      reached: aiGenRes.error ? null : lastAiGen !== null,
      at: lastAiGen?.created_at ?? null,
      sourceNote: 'admin_events ai_generation rows for this user — a partial proxy (CoachHelm insight views themselves write nothing durable).',
    },
  ];

  const liveRelease = releaseLedger.status === 'ok' ? releaseLedger.data?.cards.find((c) => c.isLive) ?? null : null;

  return {
    subjectRef: userId,
    found: true,
    stages,
    incidents: {
      count: detail.errorEvents.length,
      recentTitles: detail.errorEvents.slice(0, 3).map((e) => e.title),
    },
    sessions: { count: detail.authEvents.filter((e) => e.event_type === 'login').length },
    release: { sha: liveRelease?.commitSha ?? null, sinceIso: liveRelease ? new Date(liveRelease.createdAt).toISOString() : null },
    flagsCohort: { note: 'Not tracked — this codebase has no feature-flag/cohort assignment table to read from.' },
    traceReplayAvailable: false,
    threadHref: `/admin/thread/user/${userId}`,
    generatedAt: now.toISOString(),
    degradedNote: degraded.length > 0 ? degraded.join('; ') : null,
  };
}
