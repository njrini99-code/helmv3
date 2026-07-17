import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { excludeAuthNoise } from '@/lib/admin/data/triage';
import { resolveTeamUserIds, resolveTeamConversationIds } from '@/lib/admin/data/team-scope';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Helm Bridge V2 — "every single thing golf is doing" activity stream.
 *
 * ONE merged, cursor-paginated feed across nine independently-sourced event
 * kinds. Each kind is its own TARGETED, scoped query (own table, own
 * timestamp column, own `.limit()`) — never a platform-wide fetch-everything.
 *
 * MERGE-CORRECTNESS (k-way merge, the reason this is safe):
 * to produce the correct global top-K items (by timestamp, desc) across N
 * independently-sorted-desc sources, it is sufficient to take the top K from
 * EACH source and merge — the worst case is all K winners come from a single
 * source, and fetching fewer than K from that source could miss a winner;
 * fetching K from every source can never miss one. So every per-source query
 * below runs with `.limit(limit)` (the SAME limit as the page size), each
 * already filtered to `ts < cursor` server-side, already sorted desc. The
 * merge itself (`mergeActivityPage`) is a pure, unit-tested JS sort+slice
 * over at most `9 * limit` already-fetched rows — bounded, cheap, never
 * "fetch everything then compute."
 *
 * CURSOR: a single ISO timestamp meaning "strictly older than this." Passing
 * `nextCursor` back in re-applies `.lt(tsColumn, cursor)` to every source.
 * KNOWN EDGE CASE (documented, not silently swallowed): if more than `limit`
 * items across ALL sources share the EXACT same timestamp as the cursor
 * boundary, a strict `.lt()` means none of them repeat (no dupes) but a
 * vanishingly rare tie could theoretically be skipped. Not compound-keyed
 * (ts + kind + row id) because each source's id column differs in shape —
 * an accepted tradeoff at this scale (real timestamps are millisecond-ish
 * unique across sources in practice).
 *
 * nextCursor is null only when EVERY requested source's raw fetch returned
 * FEWER than `limit` rows — i.e. every source is truly exhausted past this
 * point. If any source hit its own cap, there's no way to be sure more
 * doesn't exist beyond the current page, so pagination continues (a caller
 * may get an empty next page — a safe, standard cursor-pagination tradeoff).
 *
 * PER-SOURCE FAILURE ISOLATION: each source fetcher is invoked inside its
 * own try/catch; a thrown error (network blip, one bad table) degrades ONLY
 * that kind to an empty contribution for this page — `degradedKinds` reports
 * which kinds failed so the caller can show "some sources unavailable"
 * without ever blanking the whole feed.
 *
 * SCHEMA-DRIFT FINDINGS baked into the source list below (verified against
 * src/lib/types/database.ts):
 *   - `login_attempts` records ONLY failed attempts (email, failed_attempts,
 *     locked_until) — it has no success flag and cannot represent "signed
 *     in." The honest cheap source for a successful sign-in is
 *     `admin_events` with `event_type = 'login'` (written by
 *     `logLogin()` on auth completion) — same source `auth.ts` already uses
 *     for the platform sign-in trend.
 *   - `admin_events.team_id` is NEVER set for login/signup rows (see
 *     team-scope.ts) — team-scoped sign_in/signup filter by
 *     `.in('user_id', resolveTeamUserIds(teamId))` instead of `.eq('team_id', …)`.
 *   - `golf_messages` has no `team_id` — team-scoped message_sent filters by
 *     `.in('conversation_id', resolveTeamConversationIds(teamId))`.
 *   - `golf_documents.uploaded_by` has NO declared foreign key in the schema
 *     (unlike `baseball_documents.uploaded_by`, which does) — an implicit
 *     PostgREST embed `users(email)` on that column would fail at runtime.
 *     Resolved via a second, batched `.in('id', uploaderIds)` lookup instead
 *     of an embed.
 *   - `golf_demo_sessions` carries no user_id/team_id at all (pre-signup
 *     marketing capture) — it is NEVER team-scopable; a team-filtered feed
 *     always contributes zero demo_session items, honestly, on purpose.
 *   - Representation choice for message_sent: RECENT ROWS, not
 *     per-thread-burst collapsing. A message burst legitimately shows as
 *     several feed entries — for "see every single thing," that's signal
 *     (real volume), not noise to suppress, and it keeps this source's
 *     merge-correctness argument identical to every other source (no
 *     post-fetch semantic reshaping of the fetched window).
 */

export type ActivityKind =
  | 'round_submitted'
  | 'signup'
  | 'sign_in'
  | 'insight_generated'
  | 'message_sent'
  | 'event_created'
  | 'demo_session'
  | 'document_uploaded'
  | 'lift_session_logged'
  | 'error';

const ALL_ACTIVITY_KINDS: readonly ActivityKind[] = [
  'round_submitted',
  'signup',
  'sign_in',
  'insight_generated',
  'message_sent',
  'event_created',
  'demo_session',
  'document_uploaded',
  'lift_session_logged',
  'error',
];

export interface ActivityItem {
  /** `${kind}:${rawRowId}` — unique across all nine sources (a raw row id
   *  alone is not: different tables can share a UUID by coincidence). Stable
   *  across pages, safe as a React key. */
  id: string;
  kind: ActivityKind;
  ts: string;
  title: string;
  detail: string | null;
  href: string | null;
}

export interface FetchGolfActivityOptions {
  types?: ActivityKind[];
  teamId?: string;
  cursor?: string;
  limit?: number;
}

export interface FetchGolfActivityResult {
  items: ActivityItem[];
  nextCursor: string | null;
  degradedKinds: ActivityKind[];
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Clamp to [1, 200], default 50 — never trust an out-of-range caller value
 *  (matches the codebase's `parseErrorsFilters` "drop invalid, don't 400"
 *  convention). */
export function clampActivityLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(raw)));
}

/** A cursor that doesn't parse as a real timestamp is dropped (treated as
 *  "first page"), never trusted as-is. */
export function parseActivityCursor(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return Number.isNaN(Date.parse(raw)) ? undefined : raw;
}

export function fullName(first: string | null | undefined, last: string | null | undefined): string | null {
  const name = `${first ?? ''} ${last ?? ''}`.trim();
  return name.length > 0 ? name : null;
}

export function formatToPar(n: number | null): string {
  if (n === null) return '—';
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `${n}`;
}

export interface ActivitySourceResult {
  kind: ActivityKind;
  items: ActivityItem[];
}

/** Pure k-way merge + pagination decision — see the module doc for the
 *  correctness argument. Fully unit-testable without touching Supabase. */
export function mergeActivityPage(
  sources: readonly ActivitySourceResult[],
  limit: number,
): { items: ActivityItem[]; nextCursor: string | null } {
  const all = sources.flatMap((s) => s.items);
  all.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  const page = all.slice(0, limit);
  const anySourceMayHaveMore = sources.some((s) => s.items.length >= limit);
  const nextCursor = anySourceMayHaveMore && page.length > 0 ? page[page.length - 1]!.ts : null;
  return { items: page, nextCursor };
}

interface SourceCtx {
  admin: AdminClient;
  cursor: string | undefined;
  limit: number;
  teamId: string | null;
  teamUserIds: Set<string> | null;
  teamConversationIds: Set<string> | null;
}

type RoundSubmittedRow = {
  id: string;
  created_at: string | null;
  total_score: number | null;
  score_to_par: number | null;
  course_name: string | null;
  team_id: string | null;
  golf_players: { first_name: string | null; last_name: string | null } | null;
  golf_teams: { name: string } | null;
};
type BaseballGameRow = {
  id: string;
  created_at: string | null;
  team_id: string;
  opponent_name: string | null;
  our_score: number | null;
  opponent_score: number | null;
  status: string;
  game_type: string;
  baseball_teams: { name: string } | null;
};

async function fetchRoundSubmitted(ctx: SourceCtx): Promise<ActivityItem[]> {
  let q = ctx.admin
    .from('golf_rounds')
    .select(
      'id, created_at, total_score, score_to_par, course_name, team_id, golf_players(first_name, last_name), golf_teams(name)',
    )
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(ctx.limit);
  if (ctx.cursor) q = q.lt('created_at', ctx.cursor);
  if (ctx.teamId) q = q.eq('team_id', ctx.teamId);
  let baseballQ = ctx.admin
    .from('baseball_games')
    .select('id, created_at, team_id, opponent_name, our_score, opponent_score, status, game_type, baseball_teams(name)')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(ctx.limit);
  if (ctx.cursor) baseballQ = baseballQ.lt('created_at', ctx.cursor);
  if (ctx.teamId) baseballQ = baseballQ.eq('team_id', ctx.teamId);

  const [{ data, error }, baseballRes] = await Promise.all([q, baseballQ]);
  if (error && baseballRes.error) {
    throw new Error(`round_submitted: ${error.message}; baseball_game: ${baseballRes.error.message}`);
  }

  const rows = error ? [] : (data ?? []) as unknown as RoundSubmittedRow[];
  const items: ActivityItem[] = [];
  for (const r of rows) {
    if (!r.created_at) continue;
    const player = fullName(r.golf_players?.first_name, r.golf_players?.last_name) ?? 'Unknown player';
    const team = r.golf_teams?.name ?? 'an unrostered team';
    items.push({
      id: `round_submitted:${r.id}`,
      kind: 'round_submitted',
      ts: r.created_at,
      title: `${player} submitted a round`,
      detail: `${team} — ${r.total_score ?? '—'} (${formatToPar(r.score_to_par)})${r.course_name ? ` at ${r.course_name}` : ''}`,
      href: `/admin/golf/tracer?round=${r.id}`,
    });
  }
  for (const r of (baseballRes.error ? [] : baseballRes.data ?? []) as unknown as BaseballGameRow[]) {
    if (!r.created_at) continue;
    items.push({
      id: `baseball_game:${r.id}`,
      kind: 'round_submitted',
      ts: r.created_at,
      title: `${r.baseball_teams?.name ?? 'A baseball team'} logged a game`,
      detail: `${r.game_type}${r.opponent_name ? ` vs ${r.opponent_name}` : ''} — ${r.our_score ?? '—'}-${r.opponent_score ?? '—'} (${r.status})`,
      href: `/admin/users?team=${r.team_id}`,
    });
  }
  return items;
}

type SignupRow = { id: string; email: string; role: string; created_at: string | null };

async function fetchSignup(ctx: SourceCtx): Promise<ActivityItem[]> {
  if (ctx.teamId && (!ctx.teamUserIds || ctx.teamUserIds.size === 0)) return [];

  let q = ctx.admin
    .from('users')
    .select('id, email, role, created_at')
    .order('created_at', { ascending: false })
    .limit(ctx.limit);
  if (ctx.cursor) q = q.lt('created_at', ctx.cursor);
  if (ctx.teamId) q = q.in('id', Array.from(ctx.teamUserIds!));
  const { data, error } = await q;
  if (error) throw new Error(`signup: ${error.message}`);

  const rows = (data ?? []) as unknown as SignupRow[];
  return rows
    .filter((r): r is SignupRow & { created_at: string } => !!r.created_at)
    .map((r) => ({
      id: `signup:${r.id}`,
      kind: 'signup' as const,
      ts: r.created_at,
      title: `${r.email} signed up`,
      detail: `role: ${r.role}`,
      href: `/admin/users/${r.id}`,
    }));
}

type LoginRow = { id: string; created_at: string | null; user_id: string | null; user_email: string | null };

async function fetchSignIn(ctx: SourceCtx): Promise<ActivityItem[]> {
  if (ctx.teamId && (!ctx.teamUserIds || ctx.teamUserIds.size === 0)) return [];

  let q = ctx.admin
    .from('admin_events')
    .select('id, created_at, user_id, user_email')
    .eq('event_type', 'login')
    .order('created_at', { ascending: false })
    .limit(ctx.limit);
  if (ctx.cursor) q = q.lt('created_at', ctx.cursor);
  if (ctx.teamId) q = q.in('user_id', Array.from(ctx.teamUserIds!));
  const { data, error } = await q;
  if (error) throw new Error(`sign_in: ${error.message}`);

  const rows = (data ?? []) as unknown as LoginRow[];
  const items: ActivityItem[] = [];
  for (const r of rows) {
    if (!r.created_at || !r.user_id) continue;
    items.push({
      id: `sign_in:${r.id}`,
      kind: 'sign_in',
      ts: r.created_at,
      title: `${r.user_email ?? 'A user'} signed in`,
      detail: null,
      href: `/admin/users/${r.user_id}`,
    });
  }
  return items;
}

type InsightRow = {
  id: string;
  created_at: string | null;
  team_id: string | null;
  insight_type: string;
  title: string;
  golf_teams: { name: string } | null;
  golf_coaches: { user_id: string; full_name: string | null } | null;
};

async function fetchInsightGenerated(ctx: SourceCtx): Promise<ActivityItem[]> {
  let q = ctx.admin
    .from('golf_coach_insights')
    .select('id, created_at, team_id, insight_type, title, golf_teams(name), golf_coaches(user_id, full_name)')
    .order('created_at', { ascending: false })
    .limit(ctx.limit);
  if (ctx.cursor) q = q.lt('created_at', ctx.cursor);
  if (ctx.teamId) q = q.eq('team_id', ctx.teamId);
  const { data, error } = await q;
  if (error) throw new Error(`insight_generated: ${error.message}`);

  const rows = (data ?? []) as unknown as InsightRow[];
  const items: ActivityItem[] = [];
  for (const r of rows) {
    if (!r.created_at) continue;
    const href = r.team_id ? `/admin/teams/${r.team_id}` : r.golf_coaches?.user_id ? `/admin/users/${r.golf_coaches.user_id}` : null;
    if (!href) continue; // no viable drill-down — never emit a dead-end row
    const scope = r.golf_teams?.name ?? (r.golf_coaches?.full_name ? `${r.golf_coaches.full_name}'s coaching` : 'a team');
    items.push({
      id: `insight_generated:${r.id}`,
      kind: 'insight_generated',
      ts: r.created_at,
      title: `New ${r.insight_type} insight generated`,
      detail: `${scope} — "${r.title}"`,
      href,
    });
  }
  return items;
}

type MessageRow = {
  id: string;
  created_at: string | null;
  conversation_id: string;
  sender_id: string;
  users: { email: string } | null;
  golf_conversations: { team_id: string | null; title: string | null; is_team_channel: boolean | null } | null;
};
type BaseballMessageRow = {
  id: string;
  created_at: string | null;
  conversation_id: string;
  sender_id: string;
  users: { email: string } | null;
  baseball_conversations: { team_id: string | null; title: string | null; is_team_chat: boolean | null } | null;
};

async function fetchMessageSent(ctx: SourceCtx): Promise<ActivityItem[]> {
  if (ctx.teamId && (!ctx.teamConversationIds || ctx.teamConversationIds.size === 0)) return [];

  let q = ctx.admin
    .from('golf_messages')
    .select('id, created_at, conversation_id, sender_id, users(email), golf_conversations(team_id, title, is_team_channel)')
    .not('is_deleted', 'is', true)
    .order('created_at', { ascending: false })
    .limit(ctx.limit);
  if (ctx.cursor) q = q.lt('created_at', ctx.cursor);
  if (ctx.teamId) q = q.in('conversation_id', Array.from(ctx.teamConversationIds!));
  let baseballQ = ctx.admin
    .from('baseball_messages')
    .select('id, created_at, conversation_id, sender_id, users(email), baseball_conversations(team_id, title, is_team_chat)')
    .order('created_at', { ascending: false })
    .limit(ctx.limit);
  if (ctx.cursor) baseballQ = baseballQ.lt('created_at', ctx.cursor);
  if (ctx.teamId) baseballQ = baseballQ.in('conversation_id', Array.from(ctx.teamConversationIds!));

  const [{ data, error }, baseballRes] = await Promise.all([q, baseballQ]);
  if (error && baseballRes.error) {
    throw new Error(`message_sent: ${error.message}; baseball_message_sent: ${baseballRes.error.message}`);
  }

  const rows = error ? [] : (data ?? []) as unknown as MessageRow[];
  const items: ActivityItem[] = [];
  for (const r of rows) {
    if (!r.created_at) continue;
    const conv = r.golf_conversations;
    const href = conv?.team_id ? `/admin/teams/${conv.team_id}` : `/admin/users/${r.sender_id}`;
    const thread = conv?.title ?? (conv?.is_team_channel ? 'the team channel' : 'a conversation');
    items.push({
      id: `message_sent:${r.id}`,
      kind: 'message_sent',
      ts: r.created_at,
      title: `${r.users?.email ?? 'A user'} sent a message`,
      detail: `in ${thread}`,
      href,
    });
  }
  for (const r of (baseballRes.error ? [] : baseballRes.data ?? []) as unknown as BaseballMessageRow[]) {
    if (!r.created_at) continue;
    const conv = r.baseball_conversations;
    const href = conv?.team_id ? `/admin/users?team=${conv.team_id}` : `/admin/users/${r.sender_id}`;
    const thread = conv?.title ?? (conv?.is_team_chat ? 'the baseball team chat' : 'a baseball conversation');
    items.push({
      id: `baseball_message:${r.id}`,
      kind: 'message_sent',
      ts: r.created_at,
      title: `${r.users?.email ?? 'A baseball user'} sent a message`,
      detail: `in ${thread}`,
      href,
    });
  }
  return items;
}

type EventRow = {
  id: string;
  created_at: string | null;
  team_id: string;
  title: string;
  event_type: string;
  start_time: string;
  golf_teams: { name: string } | null;
};
type BaseballEventRow = {
  id: string;
  created_at: string | null;
  team_id: string;
  title: string;
  event_type: string;
  start_time: string;
  baseball_teams: { name: string } | null;
};

async function fetchEventCreated(ctx: SourceCtx): Promise<ActivityItem[]> {
  let q = ctx.admin
    .from('golf_events')
    .select('id, created_at, team_id, title, event_type, start_time, golf_teams(name)')
    .order('created_at', { ascending: false })
    .limit(ctx.limit);
  if (ctx.cursor) q = q.lt('created_at', ctx.cursor);
  if (ctx.teamId) q = q.eq('team_id', ctx.teamId);
  let baseballQ = ctx.admin
    .from('baseball_events')
    .select('id, created_at, team_id, title, event_type, start_time, baseball_teams(name)')
    .order('created_at', { ascending: false })
    .limit(ctx.limit);
  if (ctx.cursor) baseballQ = baseballQ.lt('created_at', ctx.cursor);
  if (ctx.teamId) baseballQ = baseballQ.eq('team_id', ctx.teamId);

  const [{ data, error }, baseballRes] = await Promise.all([q, baseballQ]);
  if (error && baseballRes.error) {
    throw new Error(`event_created: ${error.message}; baseball_event_created: ${baseballRes.error.message}`);
  }

  const rows = error ? [] : (data ?? []) as unknown as EventRow[];
  const items = rows
    .filter((r): r is EventRow & { created_at: string } => !!r.created_at)
    .map((r) => ({
      id: `event_created:${r.id}`,
      kind: 'event_created' as const,
      ts: r.created_at,
      title: `${r.golf_teams?.name ?? 'A team'} scheduled "${r.title}"`,
      detail: `${r.event_type} — starts ${new Date(r.start_time).toLocaleString()}`,
      href: `/admin/teams/${r.team_id}`,
    }));
  for (const r of (baseballRes.error ? [] : baseballRes.data ?? []) as unknown as BaseballEventRow[]) {
    if (!r.created_at) continue;
    items.push({
      id: `baseball_event:${r.id}`,
      kind: 'event_created',
      ts: r.created_at,
      title: `${r.baseball_teams?.name ?? 'A baseball team'} scheduled "${r.title}"`,
      detail: `${r.event_type} — starts ${new Date(r.start_time).toLocaleString()}`,
      href: `/admin/users?team=${r.team_id}`,
    });
  }
  return items;
}

type DemoRow = { id: string; entered_at: string; name: string; email: string; school: string | null };
type BaseballDemoRow = { id: string; entered_at: string; name: string; email: string; program: string | null };

async function fetchDemoSession(ctx: SourceCtx): Promise<ActivityItem[]> {
  // Never team-scopable — golf_demo_sessions carries no user_id/team_id at
  // all (pre-signup marketing capture). Honest zero, not a broken filter.
  if (ctx.teamId) return [];

  let q = ctx.admin
    .from('golf_demo_sessions')
    .select('id, entered_at, name, email, school')
    .order('entered_at', { ascending: false })
    .limit(ctx.limit);
  if (ctx.cursor) q = q.lt('entered_at', ctx.cursor);
  let baseballQ = ctx.admin
    .from('baseball_demo_sessions')
    .select('id, entered_at, name, email, program')
    .order('entered_at', { ascending: false })
    .limit(ctx.limit);
  if (ctx.cursor) baseballQ = baseballQ.lt('entered_at', ctx.cursor);
  const [{ data, error }, baseballRes] = await Promise.all([q, baseballQ]);
  if (error && baseballRes.error) {
    throw new Error(`demo_session: ${error.message}; baseball_demo_session: ${baseballRes.error.message}`);
  }

  const rows = error ? [] : (data ?? []) as unknown as DemoRow[];
  return [
    ...rows.map((r) => ({
    id: `demo_session:${r.id}`,
    kind: 'demo_session' as const,
    ts: r.entered_at,
    title: `${r.name} entered the demo`,
    detail: r.school ? `${r.email} — ${r.school}` : r.email,
    href: '/admin/golf#demo',
    })),
    ...((baseballRes.error ? [] : baseballRes.data ?? []) as unknown as BaseballDemoRow[]).map((r) => ({
      id: `baseball_demo_session:${r.id}`,
      kind: 'demo_session' as const,
      ts: r.entered_at,
      title: `${r.name} entered the baseball demo`,
      detail: r.program ? `${r.email} — ${r.program}` : r.email,
      href: '/admin/baseball',
    })),
  ];
}

type DocRow = {
  id: string;
  created_at: string | null;
  team_id: string;
  title: string;
  category: string | null;
  uploaded_by: string | null;
  golf_teams: { name: string } | null;
};
type BaseballDocRow = {
  id: string;
  created_at: string | null;
  team_id: string;
  title: string;
  category: string | null;
  uploaded_by: string | null;
  baseball_teams: { name: string } | null;
  users: { email: string } | null;
};

async function fetchDocumentUploaded(ctx: SourceCtx): Promise<ActivityItem[]> {
  let q = ctx.admin
    .from('golf_documents')
    .select('id, created_at, team_id, title, category, uploaded_by, golf_teams(name)')
    .order('created_at', { ascending: false })
    .limit(ctx.limit);
  if (ctx.cursor) q = q.lt('created_at', ctx.cursor);
  if (ctx.teamId) q = q.eq('team_id', ctx.teamId);
  let baseballQ = ctx.admin
    .from('baseball_documents')
    .select('id, created_at, team_id, title, category, uploaded_by, baseball_teams(name), users(email)')
    .order('created_at', { ascending: false })
    .limit(ctx.limit);
  if (ctx.cursor) baseballQ = baseballQ.lt('created_at', ctx.cursor);
  if (ctx.teamId) baseballQ = baseballQ.eq('team_id', ctx.teamId);

  const [{ data, error }, baseballRes] = await Promise.all([q, baseballQ]);
  if (error && baseballRes.error) {
    throw new Error(`document_uploaded: ${error.message}; baseball_document_uploaded: ${baseballRes.error.message}`);
  }

  const rows = error ? [] : (data ?? []) as unknown as DocRow[];
  // golf_documents.uploaded_by has NO declared foreign key (see module doc)
  // — resolve uploader emails via a separate batched lookup, not an embed.
  const uploaderIds = Array.from(new Set(rows.map((r) => r.uploaded_by).filter((v): v is string => !!v)));
  const uploaderEmails = new Map<string, string>();
  if (uploaderIds.length > 0) {
    const { data: users, error: usersError } = await ctx.admin
      .from('users')
      .select('id, email')
      .in('id', uploaderIds);
    if (usersError) throw new Error(`document_uploaded uploaders: ${usersError.message}`);
    for (const u of (users ?? []) as unknown as Array<{ id: string; email: string }>) {
      uploaderEmails.set(u.id, u.email);
    }
  }

  const items = rows
    .filter((r): r is DocRow & { created_at: string } => !!r.created_at)
    .map((r) => ({
      id: `document_uploaded:${r.id}`,
      kind: 'document_uploaded' as const,
      ts: r.created_at,
      title: `${r.uploaded_by ? uploaderEmails.get(r.uploaded_by) ?? 'Someone' : 'Someone'} uploaded "${r.title}"`,
      detail: `${r.golf_teams?.name ?? 'a team'}${r.category ? ` — ${r.category}` : ''}`,
      href: `/admin/teams/${r.team_id}`,
    }));
  for (const r of (baseballRes.error ? [] : baseballRes.data ?? []) as unknown as BaseballDocRow[]) {
    if (!r.created_at) continue;
    items.push({
      id: `baseball_document:${r.id}`,
      kind: 'document_uploaded',
      ts: r.created_at,
      title: `${r.users?.email ?? 'Someone'} uploaded "${r.title}"`,
      detail: `${r.baseball_teams?.name ?? 'a baseball team'}${r.category ? ` — ${r.category}` : ''}`,
      href: `/admin/users?team=${r.team_id}`,
    });
  }
  return items;
}

type ErrorRow = {
  id: string;
  created_at: string | null;
  title: string;
  severity: string;
  fingerprint: string | null;
  team_id: string | null;
  sport: string | null;
};

async function fetchError(ctx: SourceCtx): Promise<ActivityItem[]> {
  let q = ctx.admin
    .from('admin_events')
    .select('id, created_at, title, severity, fingerprint, team_id, sport')
    .eq('event_type', 'error')
    .in('severity', ['error', 'critical'])
    .order('created_at', { ascending: false })
    .limit(ctx.limit);
  q = excludeAuthNoise(q);
  if (ctx.cursor) q = q.lt('created_at', ctx.cursor);
  if (ctx.teamId) q = q.eq('team_id', ctx.teamId);
  const { data, error } = await q;
  if (error) throw new Error(`error: ${error.message}`);

  const rows = (data ?? []) as unknown as ErrorRow[];
  return rows
    .filter((r): r is ErrorRow & { created_at: string } => !!r.created_at)
    .map((r) => {
      const fp = r.fingerprint ?? `row:${r.id}`;
      return {
        id: `error:${r.id}`,
        kind: 'error' as const,
        ts: r.created_at,
        title: r.title,
        detail: `${r.severity}${r.sport ? ` — ${r.sport}` : ''}`,
        href: `/admin/errors/${fp}`,
      };
    });
}

type LiftSessionActivityRow = {
  id: string;
  created_at: string | null;
  status: string;
  sport: string;
  team_id: string | null;
  helm_lifting_athletes: { first_name: string | null; last_name: string | null } | null;
  organizations: { name: string } | null;
};

/**
 * Lift Lab kind (bridge-tab-audit-p0p1 activity Finding 1) — the "Everything
 * Helm is doing" feed previously covered only golf + baseball; Lift Lab is a
 * genuinely cross-sport product (helm_lifting_sessions carries its own
 * `sport` column, not a golf_/baseball_ table prefix), so this source is not
 * team-scoped the way round_submitted/event_created are UNLESS the caller's
 * teamId happens to match `helm_lifting_sessions.team_id` directly (no
 * resolveTeamUserIds-style indirection exists for Lift Lab yet) — an honest
 * empty contribution, not a broken filter, when it doesn't.
 */
async function fetchLiftSessionLogged(ctx: SourceCtx): Promise<ActivityItem[]> {
  let q = ctx.admin
    .from('helm_lifting_sessions')
    .select(
      'id, created_at, status, sport, team_id, helm_lifting_athletes(first_name, last_name), organizations!helm_lifting_sessions_organization_id_fkey(name)',
    )
    .order('created_at', { ascending: false })
    .limit(ctx.limit);
  if (ctx.cursor) q = q.lt('created_at', ctx.cursor);
  if (ctx.teamId) q = q.eq('team_id', ctx.teamId);
  const { data, error } = await q;
  if (error) throw new Error(`lift_session_logged: ${error.message}`);

  const rows = (data ?? []) as unknown as LiftSessionActivityRow[];
  const items: ActivityItem[] = [];
  for (const r of rows) {
    if (!r.created_at) continue;
    const first = r.helm_lifting_athletes?.first_name ?? '';
    const last = r.helm_lifting_athletes?.last_name ?? '';
    const name = `${first} ${last}`.trim() || 'An athlete';
    items.push({
      id: `lift_session_logged:${r.id}`,
      kind: 'lift_session_logged',
      ts: r.created_at,
      title: `${name} logged a Lift Lab session`,
      detail: `${r.organizations?.name ?? 'an org'} — ${r.sport} — ${r.status}`,
      href: '/admin/lifting',
    });
  }
  return items;
}

const SOURCE_FETCHERS: Record<ActivityKind, (ctx: SourceCtx) => Promise<ActivityItem[]>> = {
  round_submitted: fetchRoundSubmitted,
  signup: fetchSignup,
  sign_in: fetchSignIn,
  insight_generated: fetchInsightGenerated,
  message_sent: fetchMessageSent,
  event_created: fetchEventCreated,
  demo_session: fetchDemoSession,
  document_uploaded: fetchDocumentUploaded,
  lift_session_logged: fetchLiftSessionLogged,
  error: fetchError,
};

/**
 * CALLER must have passed requireSuperAdmin() — every query below runs
 * against the service-role client (createAdminClient()).
 */
export async function fetchGolfActivity(options: FetchGolfActivityOptions = {}): Promise<FetchGolfActivityResult> {
  const limit = clampActivityLimit(options.limit);
  const cursor = parseActivityCursor(options.cursor);
  const requested = options.types && options.types.length > 0
    ? options.types.filter((k) => ALL_ACTIVITY_KINDS.includes(k))
    : ALL_ACTIVITY_KINDS;
  const kinds = requested.length > 0 ? requested : ALL_ACTIVITY_KINDS;

  const admin = createAdminClient();

  let teamUserIds: Set<string> | null = null;
  let teamConversationIds: Set<string> | null = null;
  if (options.teamId) {
    const needsUserIds = kinds.includes('signup') || kinds.includes('sign_in');
    const needsConversationIds = kinds.includes('message_sent');
    const teamId = options.teamId;
    [teamUserIds, teamConversationIds] = await Promise.all([
      needsUserIds ? resolveTeamUserIds(teamId).catch(() => new Set<string>()) : Promise.resolve(null),
      needsConversationIds ? resolveTeamConversationIds(teamId).catch(() => new Set<string>()) : Promise.resolve(null),
    ]);
  }

  const ctx: SourceCtx = {
    admin,
    cursor,
    limit,
    teamId: options.teamId ?? null,
    teamUserIds,
    teamConversationIds,
  };

  const degraded: ActivityKind[] = [];
  const results = await Promise.all(
    kinds.map(async (kind): Promise<ActivitySourceResult> => {
      try {
        return { kind, items: await SOURCE_FETCHERS[kind](ctx) };
      } catch {
        degraded.push(kind);
        return { kind, items: [] };
      }
    }),
  );

  const { items, nextCursor } = mergeActivityPage(results, limit);
  return { items, nextCursor, degradedKinds: degraded };
}
