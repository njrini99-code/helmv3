/**
 * P-10 held pushes, the pure half: what a hold instruction looks like, which notifications a class holds by default, and the one
 * "While you were in class" summary a release sends. Nothing here reads a clock, a database or the environment, so the gate
 * (class-hold.ts), the release job and the tests run the same rules.
 *
 * The rule that shapes everything: a hold must never become silence. An unknown type, a malformed instruction, a missing field all
 * resolve to "send it now".
 */

export const CLASS_AWARENESS_FLAG = 'class_awareness_v1';

export type HoldGroup = 'announcements' | 'events' | 'coach_dm' | 'group' | 'tasks' | 'coachhelm' | 'other';

/** A sender's instruction to the class gate. `'bypass'` is never held (Notify anyway, a null team, the summary itself). */
export type HoldSpec =
  | 'bypass'
  | { group: HoldGroup; dedupeKey?: string; conversationId?: string; messageId?: string; expiresAt?: string };

const GROUPS: readonly HoldGroup[] = ['announcements', 'events', 'coach_dm', 'group', 'tasks', 'coachhelm', 'other'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 200): string | undefined => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined);
const uuidText = (v: unknown): string | undefined =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : undefined;
const isoText = (v: unknown): string | undefined => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : undefined);

/**
 * The instruction a sender attached as `data.hold`, validated. The queue serialises it, so it arrives as JSON: anything that does not
 * parse reads as "no instruction", never as a guess.
 */
export function readHoldSpec(raw: unknown): HoldSpec | undefined {
  if (raw === 'bypass') return 'bypass';
  if (!isRecord(raw)) return undefined;
  const group = GROUPS.find((g) => g === raw.group);
  if (!group) return undefined;
  const spec: Exclude<HoldSpec, 'bypass'> = { group };
  const dedupeKey = text(raw.dedupeKey, 120);
  const conversationId = uuidText(raw.conversationId);
  const messageId = uuidText(raw.messageId);
  const expiresAt = isoText(raw.expiresAt);
  if (dedupeKey) spec.dedupeKey = dedupeKey;
  if (conversationId) spec.conversationId = conversationId;
  if (messageId) spec.messageId = messageId;
  if (expiresAt) spec.expiresAt = expiresAt;
  return spec;
}

/**
 * What the class holds when the sender gave no instruction. Returns `undefined` for "not held" (no RPC at all).
 *
 * - new_message has no default: whether it is a coach DM or a group thread, and which conversation it belongs to, only the fan-out
 *   knows, and the database refuses to hold a message with no conversation team. So a message without an instruction goes out.
 * - An urgent announcement is never held. A `high` one is (important, not urgent; owner call 3).
 * - A reminder or an update that is only useful before something starts carries that time as `expiresAt`: a push whose expiry is at
 *   or before the release is sent now, not held.
 * - Coaches are never held (they have no class status), so a coach-audience insight, a submitted round and the task pushes that
 *   reach coaches are not classified at all.
 */
export function defaultHoldSpec(type: string, data: Record<string, unknown>): HoldSpec | undefined {
  switch (type) {
    case 'class_summary':
      return 'bypass';
    case 'team_announcement':
      return data.urgency === 'urgent' ? 'bypass' : { group: 'announcements' };
    case 'qualifier_created':
    case 'qualifier_updated':
    case 'event_rsvp_reminder': {
      const expiresAt = isoText(data.eventDate) ?? isoText(data.expiresAt);
      return expiresAt ? { group: 'events', expiresAt } : { group: 'events' };
    }
    case 'task_reminder': {
      const expiresAt = isoText(data.dueAt) ?? isoText(data.expiresAt);
      return expiresAt ? { group: 'tasks', expiresAt } : { group: 'tasks' };
    }
    case 'coachhelm_insight':
      return data.audience === 'player' ? { group: 'coachhelm' } : undefined;
    default:
      return undefined;
  }
}

/** The instruction to act on: the sender's, else the default for the type. */
export function holdSpecFor(type: string, data: Record<string, unknown>): HoldSpec | undefined {
  return readHoldSpec(data.hold) ?? defaultHoldSpec(type, data);
}

/** The hold-specific keys, in the order the RPC takes them (`golf_push_hold_put`), for the gate and for the SQL parity test. */
export const HOLD_PUT_ARGS = [
  'p_user_id',
  'p_hold_id',
  'p_notification_type',
  'p_group_key',
  'p_dedupe_key',
  'p_title',
  'p_body',
  'p_data',
  'p_conversation_id',
  'p_message_id',
  'p_expires_at',
] as const;

// --- The summary ----------------------------------------------------------------------------------------------------------------

/** The columns of a held row the composer reads. */
export type HeldRow = {
  id: string;
  notification_type: string;
  group_key: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  conversation_id: string | null;
  held_at: string;
};

export type SummaryContext = {
  baseUrl: string;
  /** Thread titles by conversation id (a group's name). */
  titles: Readonly<Record<string, string>>;
  /** `class-yyyy-mm-dd-HHmm` of the release, so a second release the same day replaces nothing it should not. */
  collapseId: string;
};

export type ClassSummary = {
  title: string;
  body: string;
  link: string;
  threadId: 'class-summary';
  collapseId: string;
  interruptionLevel: 'active';
  relevanceScore: 0.6;
};

export const SUMMARY_TITLE = 'While you were in class';
export const SUMMARY_BODY_MAX = 150;
const PREVIEW_MAX = 60;

const ORDER: readonly HoldGroup[] = ['announcements', 'events', 'coach_dm', 'group', 'tasks', 'coachhelm', 'other'];

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
const newestFirst = (rows: HeldRow[]) => [...rows].sort((a, b) => Date.parse(b.held_at) - Date.parse(a.held_at));
const dataText = (row: HeldRow, key: string) => {
  const v = row.data?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};
const trimTo = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** One line for one group, by the rules of the plan (4.8.1). Never names a class. */
function segmentFor(group: HoldGroup, rows: HeldRow[], ctx: SummaryContext): string {
  const rs = newestFirst(rows);
  const first = rs[0]!;
  switch (group) {
    case 'announcements':
      return rs.length === 1 ? `Announcement: ${first.body}` : `${rs.length} announcements`;
    case 'events':
      return rs.length === 1 ? first.body : `${rs.length} schedule updates`;
    case 'coach_dm': {
      const senders = new Set(rs.map((r) => dataText(r, 'senderName') ?? ''));
      const sender = dataText(first, 'senderName') ?? 'your coach';
      if (rs.length === 1) {
        const preview = dataText(first, 'preview');
        return preview ? `${sender}: ${trimTo(preview, PREVIEW_MAX)}` : `1 message from ${sender}`;
      }
      return senders.size === 1 ? `${rs.length} messages from ${sender}` : `${rs.length} messages from coaches`;
    }
    case 'group': {
      const threads = new Set(rs.map((r) => r.conversation_id ?? ''));
      if (threads.size === 1) {
        const title = first.conversation_id ? ctx.titles[first.conversation_id] : undefined;
        return `${count(rs.length, 'message', 'messages')} from ${title ?? 'a group chat'}`;
      }
      return `${rs.length} messages in ${threads.size} chats`;
    }
    case 'tasks':
      return count(rs.length, 'task', 'tasks');
    case 'coachhelm':
      return count(rs.length, 'insight', 'insights');
    default:
      return count(rs.length, 'update', 'updates');
  }
}

/** Where tapping the summary goes: one conversation, else the inbox when everything is a message, else Home. */
export function summaryLink(rows: HeldRow[], baseUrl: string): string {
  const messages = rows.filter((r) => r.notification_type === 'new_message');
  if (messages.length === rows.length) {
    const conversations = new Set(messages.map((r) => r.conversation_id).filter((id): id is string => !!id));
    if (conversations.size === 1 && messages.every((r) => r.conversation_id)) {
      return `${baseUrl}/golf/dashboard/messages?conversation=${[...conversations][0]}`;
    }
    return `${baseUrl}/golf/dashboard/messages`;
  }
  return `${baseUrl}/golf/dashboard`;
}

/**
 * The one push a release sends when two or more rows are left. Groups in a fixed order, newest first inside a group, joined with
 * " · ", at most 150 UTF-16 units: whole segments are cut and " and N more" counts the rows they held. Copy never names the class.
 */
export function composeClassSummary(rows: HeldRow[], ctx: SummaryContext): ClassSummary {
  const byGroup = new Map<HoldGroup, HeldRow[]>();
  for (const row of rows) {
    const group = ORDER.find((g) => g === row.group_key) ?? 'other';
    byGroup.set(group, [...(byGroup.get(group) ?? []), row]);
  }
  const segments = ORDER.filter((g) => byGroup.has(g)).map((g) => ({ text: segmentFor(g, byGroup.get(g)!, ctx), rows: byGroup.get(g)!.length }));

  const more = (n: number) => ` and ${n} more`;
  let body = '';
  let used = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const next = body ? `${body} · ${seg.text}` : seg.text;
    const left = rows.length - used - seg.rows;
    const fits = left > 0 ? next.length + more(left).length <= SUMMARY_BODY_MAX : next.length <= SUMMARY_BODY_MAX;
    if (!fits) break;
    body = next;
    used += seg.rows;
  }
  if (!body) {
    // Even the first line is too long: keep what fits of it rather than send an empty summary.
    const first = segments[0]!.text;
    const left = rows.length - segments[0]!.rows;
    body = trimTo(first, SUMMARY_BODY_MAX - (left > 0 ? more(left).length : 0));
    used = segments[0]!.rows;
  }
  if (used < rows.length) body += more(rows.length - used);

  return {
    title: SUMMARY_TITLE,
    body,
    link: summaryLink(rows, ctx.baseUrl),
    threadId: 'class-summary',
    collapseId: ctx.collapseId,
    interruptionLevel: 'active',
    relevanceScore: 0.6,
  };
}

/** `class-yyyy-mm-dd-HHmm` for a release instant, in UTC (a stable key, not shown to anyone). */
export function summaryCollapseId(releaseAt: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `class-${releaseAt.getUTCFullYear()}-${p(releaseAt.getUTCMonth() + 1)}-${p(releaseAt.getUTCDate())}-${p(releaseAt.getUTCHours())}${p(releaseAt.getUTCMinutes())}`;
}
