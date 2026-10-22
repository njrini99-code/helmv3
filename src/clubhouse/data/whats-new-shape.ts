import type { WhatsNewItem, WhatsNewType } from '@/app/golf/actions/whats-new';

/**
 * What's new for a coach: the team's CoachHelm activity of the past seven days (insights detected, matured and resolved,
 * patterns the coach validated, focus areas started and finished), laid out for the page. The pure steps live apart from
 * the loader (data/whats-new.ts) so the preview and the tests use the code the page does. Every day label and time is
 * worked out here, on the server, in the team's zone: the client formats nothing, so the first paint cannot disagree with
 * hydration (the Fairway feed threw React #418 on exactly that).
 */

export type ChWhatsNewKind = 'insights' | 'patterns' | 'focus';

export interface ChWhatsNewItem {
  /** Unique in the feed: the event's type and the thing it is about. */
  key: string;
  kind: ChWhatsNewKind;
  /** "Insight resolved", "New focus area". */
  what: string;
  /** The two outcomes that are good news (an insight resolved, a focus area finished), set in the green ink. */
  good: boolean;
  /** When it happened, ISO. */
  at: string;
  /** "3:42 PM", in the team's zone. */
  time: string;
  playerId: string;
  player: string;
  title: string;
  /** The insight's or focus area's own words, trimmed to a short passage; null when there are none. */
  detail: string | null;
}

export interface ChWhatsNewDay {
  /** yyyy-mm-dd in the team's zone. */
  key: string;
  /** "Today", "Yesterday", "Mon, Oct 19". */
  label: string;
  items: ChWhatsNewItem[];
}

export interface ChWhatsNew {
  /** The feed did not load: nothing below is a finding. */
  error: boolean;
  /** One category came back at its row ceiling, so older events in the week may be missing. */
  truncated: boolean;
  days: ChWhatsNewDay[];
  total: number;
  counts: Record<'all' | ChWhatsNewKind, number>;
  /** The newest event, ISO; null when there are none. */
  newestAt: string | null;
}

const KIND: Record<WhatsNewType, { kind: ChWhatsNewKind; what: string; good: boolean }> = {
  insight_resolved: { kind: 'insights', what: 'Insight resolved', good: true },
  insight_matured: { kind: 'insights', what: 'Insight matured', good: false },
  insight_detected: { kind: 'insights', what: 'New insight', good: false },
  pattern_validated: { kind: 'patterns', what: 'Pattern validated', good: false },
  focus_area_created: { kind: 'focus', what: 'New focus area', good: false },
  focus_area_completed: { kind: 'focus', what: 'Focus area completed', good: true },
};

/** The longest passage a row shows; the rest is the player's page. */
const DETAIL_MAX = 220;

/** The zone to read the week in when the team has set none (the shell's own default). */
export const WHATS_NEW_DEFAULT_ZONE = 'America/New_York';

function validZone(zone: string | null | undefined): string {
  if (!zone) return WHATS_NEW_DEFAULT_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return WHATS_NEW_DEFAULT_ZONE;
  }
}

const dayKey = (ms: number, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

/** One calendar day before `key`, by date arithmetic alone. */
function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! - 1)).toISOString().slice(0, 10);
}

function dayLabel(key: string, today: string): string {
  if (key === today) return 'Today';
  if (key === previousDay(today)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${key}T12:00:00Z`));
}

/** A passage cut at a word, with an ellipsis, and nothing for blank text. */
export function passage(text: string | null | undefined): string | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (t.length <= DETAIL_MAX) return t;
  const cut = t.slice(0, DETAIL_MAX);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), DETAIL_MAX - 30)).trimEnd()}…`;
}

/** The feed as the page draws it: newest first, grouped by the team's calendar day. `nowMs` is the server's clock. */
export function toWhatsNew(items: readonly WhatsNewItem[], opts: { nowMs: number; zone?: string | null; truncated?: boolean }): ChWhatsNew {
  const zone = validZone(opts.zone);
  const today = dayKey(opts.nowMs, zone);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' });
  const rows: ChWhatsNewItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const ms = Date.parse(it.occurredAt);
    if (!Number.isFinite(ms)) continue;
    const meta = KIND[it.type];
    const about = it.insightId ?? it.patternId ?? it.focusAreaId ?? it.playerId;
    const key = `${it.type}:${about}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ key, kind: meta.kind, what: meta.what, good: meta.good, at: it.occurredAt, time: time.format(new Date(ms)), playerId: it.playerId, player: it.playerName, title: it.title, detail: passage(it.description) });
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.key.localeCompare(b.key)));
  const days: ChWhatsNewDay[] = [];
  for (const r of rows) {
    const k = dayKey(Date.parse(r.at), zone);
    const last = days[days.length - 1];
    if (last && last.key === k) last.items.push(r);
    else days.push({ key: k, label: dayLabel(k, today), items: [r] });
  }
  const count = (kind: ChWhatsNewKind) => rows.filter((r) => r.kind === kind).length;
  return {
    error: false,
    truncated: !!opts.truncated,
    days,
    total: rows.length,
    counts: { all: rows.length, insights: count('insights'), patterns: count('patterns'), focus: count('focus') },
    newestAt: rows[0]?.at ?? null,
  };
}

/** A feed that failed to load. */
export const WHATS_NEW_FAILED: ChWhatsNew = { error: true, truncated: false, days: [], total: 0, counts: { all: 0, insights: 0, patterns: 0, focus: 0 }, newestAt: null };
