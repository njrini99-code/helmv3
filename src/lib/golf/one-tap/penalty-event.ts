import { z } from 'zod';
import type { StorageLike } from './anchor-repository';
import type { AnchorCourseBinding, ShotAnchor } from './shot-anchor';

/** Master design §58: penalty strokes are separate events, never fake
 * spatial segments. A penalty is a score fact tied to the mark it follows;
 * the drop is the next ordinary MARK BALL (a normal anchor), so the shot
 * record never branches. Hole score = shots + penalty strokes (+ explicit
 * adjustments made elsewhere). A penalty without a following mark is
 * unresolved and the hole integrity model flags it for review. */
export const PENALTY_SCHEMA_VERSION = 1;
export const PENALTY_KINDS = ['penalty_area', 'lost_ball', 'out_of_bounds', 'unplayable', 'other'] as const;
export type PenaltyKind = typeof PENALTY_KINDS[number];
export const penaltyEventSchema = z.object({
  schemaVersion: z.literal(PENALTY_SCHEMA_VERSION),
  id: z.string().min(1),
  roundId: z.string().min(1),
  courseId: z.string().min(1),
  siteId: z.string().min(1),
  holeKey: z.string().min(1),
  holeId: z.number().int(),
  createdAt: z.string().datetime(),
  strokes: z.union([z.literal(1), z.literal(2)]),
  kind: z.enum(PENALTY_KINDS),
  /** The mark the penalty follows (the ball's last known position); null before any mark. */
  relatedAnchorId: z.string().nullable(),
  syncState: z.enum(['LOCAL', 'QUEUED', 'SYNCED', 'ERROR']),
  deletedAt: z.string().datetime().nullable(),
});
export type PenaltyEvent = z.infer<typeof penaltyEventSchema>;
export type PenaltyStrokes = PenaltyEvent['strokes'];
export const PENALTY_COPY: Readonly<Record<PenaltyKind, { label: string; strokes: PenaltyStrokes; hint: string }>> = Object.freeze({
  penalty_area: { label: 'Penalty area', strokes: 1, hint: 'Water or a marked penalty area. Drop, then mark the ball.' },
  lost_ball: { label: 'Lost ball', strokes: 1, hint: 'Stroke and distance: play again from the last mark and mark it.' },
  out_of_bounds: { label: 'Out of bounds', strokes: 1, hint: 'Stroke and distance: play again from the last mark and mark it.' },
  unplayable: { label: 'Unplayable', strokes: 1, hint: 'Drop under the unplayable rule, then mark the ball.' },
  other: { label: 'Other penalty', strokes: 1, hint: 'Any other penalty stroke.' },
});
export interface PenaltyIdentity extends AnchorCourseBinding { id: string; roundId: string; holeKey: string; holeId: number }
export function createPenaltyEvent(identity: PenaltyIdentity, kind: PenaltyKind, strokes: PenaltyStrokes, relatedAnchorId: string | null, nowMs: number): PenaltyEvent {
  return penaltyEventSchema.parse({ schemaVersion: PENALTY_SCHEMA_VERSION, id: identity.id, roundId: identity.roundId, courseId: identity.courseId, siteId: identity.siteId,
    holeKey: identity.holeKey, holeId: identity.holeId, createdAt: new Date(nowMs).toISOString(), strokes, kind, relatedAnchorId, syncState: 'QUEUED', deletedAt: null });
}
export function tombstonePenalty(event: PenaltyEvent, nowMs: number): PenaltyEvent {
  return event.deletedAt ? event : { ...event, deletedAt: new Date(nowMs).toISOString(), syncState: event.syncState === 'LOCAL' ? 'LOCAL' : 'QUEUED' };
}
/** Live penalties on a hole (or the round), oldest first. */
export function livePenalties(events: readonly PenaltyEvent[], holeKey?: string): PenaltyEvent[] {
  return events.filter(e => !e.deletedAt && (holeKey == null || e.holeKey === holeKey)).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
}
export function penaltyStrokes(events: readonly PenaltyEvent[], holeKey?: string): number {
  return livePenalties(events, holeKey).reduce((s, e) => s + e.strokes, 0);
}
/** Master design "score": derived shot count + penalty strokes + explicit adjustments. */
export function holeScore(shots: number, penalties: number, adjustments = 0): number {
  return Math.max(0, shots + penalties + adjustments);
}
/** A penalty is resolved by the drop — an ordinary finalized mark after it.
 * Until then it is unresolved; the hole integrity model flags a closed hole
 * that still carries one. */
export function unresolvedPenalties(events: readonly PenaltyEvent[], anchors: readonly ShotAnchor[], holeKey?: string): PenaltyEvent[] {
  const marks = anchors.filter(a => !a.deletedAt && !a.provisional && (holeKey == null || a.holeKey === holeKey));
  return livePenalties(events, holeKey).filter(e => !marks.some(a => a.holeKey === e.holeKey && Date.parse(a.tapTimestamp) > Date.parse(e.createdAt)));
}

export interface PenaltyRepository {
  list(roundId: string): PenaltyEvent[];
  get(id: string): PenaltyEvent | null;
  upsert(event: PenaltyEvent): void;
  subscribe(listener: () => void): () => void;
}
export class MemoryPenaltyRepository implements PenaltyRepository {
  protected byId = new Map<string, PenaltyEvent>();
  private listeners = new Set<() => void>();
  list(roundId: string): PenaltyEvent[] { return livePenaltiesAndTombstones([...this.byId.values()].filter(e => e.roundId === roundId)); }
  get(id: string): PenaltyEvent | null { return this.byId.get(id) ?? null; }
  upsert(event: PenaltyEvent): void {
    penaltyEventSchema.parse(event);
    this.byId.set(event.id, event);
    this.persist(event.roundId);
    for (const l of this.listeners) l();
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  protected persist(_roundId: string): void { /* memory only */ }
}
function livePenaltiesAndTombstones(events: PenaltyEvent[]): PenaltyEvent[] {
  return events.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
}
export const PENALTY_STORAGE_PREFIX = 'golfhelm-one-tap-penalties:';
/** Device-durable like the anchors: every event persists per round; an
 * invalid row is counted and skipped, never repaired by guesswork. */
export class StoragePenaltyRepository extends MemoryPenaltyRepository {
  invalidRows = 0;
  constructor(private readonly storage: StorageLike, roundIds: readonly string[]) {
    super();
    for (const roundId of roundIds) this.load(roundId);
  }
  private load(roundId: string) {
    let raw: string | null = null;
    try { raw = this.storage.getItem(PENALTY_STORAGE_PREFIX + roundId); } catch { return; }
    if (!raw) return;
    try {
      const rows = JSON.parse(raw) as unknown[];
      for (const row of Array.isArray(rows) ? rows : []) {
        const result = penaltyEventSchema.safeParse(row);
        if (!result.success) { this.invalidRows++; continue; }
        this.byId.set(result.data.id, result.data);
      }
    } catch { this.invalidRows++; }
  }
  protected override persist(roundId: string): void {
    try { this.storage.setItem(PENALTY_STORAGE_PREFIX + roundId, JSON.stringify(this.list(roundId))); } catch { /* private mode: memory only */ }
  }
  clear(roundId: string) {
    for (const e of this.list(roundId)) this.byId.delete(e.id);
    try { this.storage.removeItem(PENALTY_STORAGE_PREFIX + roundId); } catch { /* ignore */ }
  }
}
