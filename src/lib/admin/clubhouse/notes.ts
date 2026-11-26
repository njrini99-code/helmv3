/**
 * The Bridge's own notes (`bridge_notes`, plan §4.5): a code marked expected (BR-0506), a watched code (BR-0507) and
 * the Duet desk's queue of packs (BR-1304 to BR-1306). Pure: the read is `readNotes` in live.ts and the writes are the
 * server actions in src/app/admin/actions/bridge-notes.ts.
 *
 * The table has no status column, so a pack's place in the queue is worked out, never stored: `created_at` is when it
 * was sent, `resolved_at` is when it was archived, and fixed or regressed comes from the hourly counters of the first
 * release after it was sent. Nothing about a person is kept here: `bridge_notes` is kept forever, so a person's or a
 * team's pack is never queued (D7).
 */
import { isFailureRow, type HourlyRow } from './live-model';

export const NOTE_COLUMNS = 'id, kind, code, bridge_id, page_id, body, created_at, created_by, resolved_at';

/** The kinds the table's check constraint allows. `note` is reserved for a free note and has no control yet. */
export type NoteKind = 'expected' | 'watch' | 'pack' | 'note';

export interface BridgeNoteRow {
  id: string;
  kind: string;
  code: string | null;
  bridge_id: number | null;
  page_id: string | null;
  body: string;
  created_at: string;
  created_by: string | null;
  resolved_at: string | null;
}

/** The longest reason "Mark expected…" keeps. */
export const REASON_MAX = 500;

/** A reason as it is stored: trimmed, control characters gone, capped. Null when nothing is left. */
export function cleanReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  const text = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, REASON_MAX) : null;
}

export interface NotesIndex {
  /** Open "expected" notes by CH code, newest first wins. */
  expected: Map<string, BridgeNoteRow>;
  /** Open watches by CH code. */
  watched: Map<string, BridgeNoteRow>;
  /** Packs on the queue (sent, not archived), newest first. */
  packs: BridgeNoteRow[];
}

export const EMPTY_NOTES: NotesIndex = { expected: new Map(), watched: new Map(), packs: [] };

/** Open notes only (an archived pack, an unmarked code or a stopped watch has `resolved_at`). */
export function indexNotes(rows: readonly BridgeNoteRow[]): NotesIndex {
  const open = rows.filter((r) => !r.resolved_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const expected = new Map<string, BridgeNoteRow>();
  const watched = new Map<string, BridgeNoteRow>();
  const packs: BridgeNoteRow[] = [];
  for (const r of open) {
    if (r.kind === 'expected' && r.code && !expected.has(r.code)) expected.set(r.code, r);
    else if (r.kind === 'watch' && r.code && !watched.has(r.code)) watched.set(r.code, r);
    else if (r.kind === 'pack' && r.body) packs.push(r);
  }
  return { expected, watched, packs };
}

/** The open pack note for a target key, if it is already on the queue. */
export function queuedPack(index: NotesIndex, key: string): BridgeNoteRow | null {
  return index.packs.find((p) => p.body === key) ?? null;
}

// ---------------------------------------------------------------------------
// The queue: sent, waiting for a release, fixed, regressed
// ---------------------------------------------------------------------------

export type PackStatus = 'sent' | 'waiting' | 'fixed' | 'regressed';

export const PACK_STATUS_WORDS: Readonly<Record<PackStatus, string>> = {
  sent: 'sent',
  waiting: 'sent · waiting for a release',
  fixed: 'fixed in the next release',
  regressed: 'still firing in the next release',
};

export interface PackVerdict {
  status: PackStatus;
  /** The first release seen after the pack was sent: the one that decides it. */
  release: string | null;
  /** Failures of the pack's codes in that release. */
  firing: number;
}

const HOUR_MS = 3_600_000;

/**
 * Where a sent pack stands. A pack with no failure codes to watch (a release or a finding) is just "sent": B10's
 * comparison decides it. Otherwise the first release whose first hour comes after the hour the pack was sent decides:
 * none of its codes failed there is fixed, any did is regressed, no such release yet is waiting. A release first seen
 * in the hour the pack was sent counts as before it, since it may not hold the fix.
 */
export function packVerdict(i: { sentAt: string; codes: readonly string[]; rows: readonly HourlyRow[] }): PackVerdict {
  if (!i.codes.length) return { status: 'sent', release: null, firing: 0 };
  const sentHour = Math.floor(Date.parse(i.sentAt) / HOUR_MS) * HOUR_MS;
  const firstSeen = new Map<string, number>();
  for (const r of i.rows) {
    if (!r.release || r.release === 'main') continue;
    const t = Date.parse(r.bucket_hour);
    const prev = firstSeen.get(r.release);
    if (prev === undefined || t < prev) firstSeen.set(r.release, t);
  }
  const next = [...firstSeen.entries()].filter(([, t]) => t > sentHour).sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;
  if (!next) return { status: 'waiting', release: null, firing: 0 };
  const codes = new Set(i.codes);
  const firing = i.rows.filter((r) => r.release === next && codes.has(r.code) && isFailureRow(r)).reduce((a, r) => a + r.signal_count, 0);
  return { status: firing ? 'regressed' : 'fixed', release: next, firing };
}

/** The earliest time a queued pack was sent: how far back the queue's hourly read must reach. */
export function oldestSent(packs: readonly BridgeNoteRow[]): string | null {
  return packs.reduce<string | null>((min, p) => (min === null || p.created_at < min ? p.created_at : min), null);
}

// ---------------------------------------------------------------------------
// Watched codes on Pulse and in the digest
// ---------------------------------------------------------------------------

export interface WatchedCode {
  code: string;
  bridgeId: number | null;
  page: string | null;
  /** Failures in the window. */
  failures: number;
  /** Everything it sent in the window (a watched code need not be a failure). */
  count: number;
  users: number;
  lastSeen: string | null;
  since: string;
}

/** Each watched code with what it did in the rows given, busiest first; a quiet one still shows, at zero. */
export function watchedCodes(index: NotesIndex, rows: readonly HourlyRow[]): WatchedCode[] {
  return [...index.watched.values()]
    .map((n) => {
      const mine = rows.filter((r) => r.code === n.code);
      const users = new Set(mine.flatMap((r) => r.user_ids));
      const last = mine.reduce<string | null>((m, r) => (m === null || r.last_at > m ? r.last_at : m), null);
      return {
        code: n.code!,
        bridgeId: n.bridge_id,
        page: n.page_id,
        failures: mine.filter(isFailureRow).reduce((a, r) => a + r.signal_count, 0),
        count: mine.reduce((a, r) => a + r.signal_count, 0),
        users: users.size,
        lastSeen: last,
        since: n.created_at,
      };
    })
    .sort((a, b) => b.failures - a.failures || b.count - a.count || a.code.localeCompare(b.code));
}
