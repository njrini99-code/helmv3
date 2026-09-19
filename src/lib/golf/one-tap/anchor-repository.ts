import { migrateAnchorRow, shotAnchorSchema, type AnchorCourseBinding, type ShotAnchor } from './shot-anchor';
import type { PenaltyEvent, PenaltyRepository } from './penalty-event';

/** Local-first persistence (master plan "Local-first persistence"). A tap
 * writes the anchor to local storage before anything else; the anchor id is
 * the idempotency key for the server, so any number of retries create exactly
 * one anchor. Nothing here needs a network. */
export interface AnchorRepository {
  list(roundId: string): ShotAnchor[];
  get(id: string): ShotAnchor | null;
  upsert(anchor: ShotAnchor): void;
  subscribe(listener: () => void): () => void;
}
export class MemoryAnchorRepository implements AnchorRepository {
  protected byId = new Map<string, ShotAnchor>();
  private listeners = new Set<() => void>();
  list(roundId: string): ShotAnchor[] { return [...this.byId.values()].filter(a => a.roundId === roundId).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)); }
  get(id: string): ShotAnchor | null { return this.byId.get(id) ?? null; }
  upsert(anchor: ShotAnchor): void {
    shotAnchorSchema.parse(anchor);
    this.byId.set(anchor.id, anchor);
    this.persist(anchor.roundId);
    for (const l of this.listeners) l();
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  protected persist(_roundId: string): void { /* memory only */ }
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export const ANCHOR_STORAGE_PREFIX = 'golfhelm-one-tap-anchors:';
/** Synchronous whole-round snapshot per write: a tap is durable on the
 * device before the estimator even finishes. V1 lab rows migrate under the
 * round's course binding (raw windows dropped) and are written back on the
 * next persist; rows that no longer parse are dropped and counted, never
 * silently repaired. */
export class StorageAnchorRepository extends MemoryAnchorRepository {
  invalidRows = 0;
  migratedRows = 0;
  constructor(private readonly storage: StorageLike, roundIds: readonly string[], private readonly binding: AnchorCourseBinding) {
    super();
    for (const roundId of roundIds) this.load(roundId);
  }
  private load(roundId: string) {
    let raw: string | null = null;
    try { raw = this.storage.getItem(ANCHOR_STORAGE_PREFIX + roundId); } catch { return; }
    if (!raw) return;
    let migrated = false;
    try {
      const rows = JSON.parse(raw) as unknown[];
      for (const row of Array.isArray(rows) ? rows : []) {
        const result = migrateAnchorRow(row, this.binding);
        if (!result) { this.invalidRows++; continue; }
        this.byId.set(result.anchor.id, result.anchor);
        if (result.migrated) { this.migratedRows++; migrated = true; }
      }
    } catch { this.invalidRows++; }
    if (migrated) this.persist(roundId);
  }
  protected override persist(roundId: string): void {
    try { this.storage.setItem(ANCHOR_STORAGE_PREFIX + roundId, JSON.stringify(this.list(roundId))); } catch { /* private mode: memory only */ }
  }
  clear(roundId: string) {
    for (const a of this.list(roundId)) this.byId.delete(a.id);
    try { this.storage.removeItem(ANCHOR_STORAGE_PREFIX + roundId); } catch { /* ignore */ }
  }
}
/** What a transport reports back. `acceptedIds` is the server's own answer —
 * the ids it actually stored — so an attempt that returns fewer ids than it
 * sent leaves the rest queued instead of pretending they landed.
 * `rejectedIds` is advisory: rows the transport refused to send at all (a
 * malformed round id, say), which a caller can log but the queue treats the
 * same as any other non-acceptance. */
export interface SyncResult { acceptedIds: readonly string[]; rejectedIds?: readonly string[] }
/** §75 sync outbox. Both records are keyed by their client-generated id, and
 * every attempt sends the whole row, so the server upserts and N retries
 * converge on exactly one row. A tombstone is an ordinary send of a row whose
 * `deletedAt` is set — it synchronizes as an update, never as a delete.
 *
 * `upsertPenalties` is optional so an anchors-only transport (the lab's
 * synthetic one, and anything written before penalties existed) still type
 * checks. A queue whose transport lacks it leaves penalties QUEUED forever
 * rather than marking them SYNCED — a penalty stroke is score, and claiming it
 * reached the server when no code sent it is the one failure worth avoiding. */
export interface SyncTransport {
  upsertAnchors(anchors: readonly ShotAnchor[]): Promise<SyncResult>;
  upsertPenalties?(events: readonly PenaltyEvent[]): Promise<SyncResult>;
}
export const SYNC_BACKOFF_MS: readonly number[] = [1000, 2000, 5000, 15000, 60000];
/** Idempotent server sync. Every attempt sends the full record keyed by id;
 * the server upserts. Failure leaves the row QUEUED (or ERROR after the
 * backoff ladder is exhausted, still retried on the next flush).
 *
 * The retry ladder lives only in memory: a relaunch restarts it at the first
 * rung, which is correct — the durable record is the repository's, and a fresh
 * process has no reason to believe the last attempt's failure still applies. */
export class SyncQueue {
  private attempts = new Map<string, number>();
  private inFlight: Promise<void> | null = null;
  constructor(
    private readonly repo: AnchorRepository,
    private readonly transport: SyncTransport | null,
    private readonly roundId: string,
    /** Optional so existing call sites keep working; without it the queue
     * simply has no penalties to flush. */
    private readonly penalties: PenaltyRepository | null = null,
  ) {}
  enqueue(id: string) {
    const anchor = this.repo.get(id);
    if (anchor && anchor.syncState !== 'QUEUED') this.repo.upsert({ ...anchor, syncState: 'QUEUED' });
  }
  enqueuePenalty(id: string) {
    const event = this.penalties?.get(id);
    if (event && event.syncState !== 'QUEUED') this.penalties?.upsert({ ...event, syncState: 'QUEUED' });
  }
  pending(): ShotAnchor[] { return this.repo.list(this.roundId).filter(a => a.syncState === 'QUEUED' || a.syncState === 'ERROR'); }
  pendingPenalties(): PenaltyEvent[] { return (this.penalties?.list(this.roundId) ?? []).filter(e => e.syncState === 'QUEUED' || e.syncState === 'ERROR'); }
  backoffFor(id: string): number { return SYNC_BACKOFF_MS[Math.min(this.attempts.get(id) ?? 0, SYNC_BACKOFF_MS.length - 1)]!; }
  flush(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
  /** Anchors first, then penalties: a penalty carries the id of the mark it
   * follows, so sending the mark first is what keeps that reference resolvable
   * on the server even though it is not enforced as a foreign key. */
  private async run() {
    if (!this.transport) return;
    await this.flushAnchors(this.transport);
    await this.flushPenalties(this.transport);
  }
  private async flushAnchors(transport: SyncTransport) {
    const batch = this.pending();
    if (!batch.length) return;
    try {
      const { acceptedIds } = await transport.upsertAnchors(batch);
      for (const anchor of batch) {
        const current = this.repo.get(anchor.id);
        if (!current) continue;
        if (acceptedIds.includes(anchor.id)) { this.attempts.delete(anchor.id); this.repo.upsert({ ...current, syncState: 'SYNCED' }); }
        else this.fail(current);
      }
    } catch { for (const anchor of batch) { const current = this.repo.get(anchor.id); if (current) this.fail(current); } }
  }
  private async flushPenalties(transport: SyncTransport) {
    const repo = this.penalties;
    const batch = this.pendingPenalties();
    if (!repo || !batch.length || !transport.upsertPenalties) return;
    try {
      const { acceptedIds } = await transport.upsertPenalties(batch);
      for (const event of batch) {
        const current = repo.get(event.id);
        if (!current) continue;
        if (acceptedIds.includes(event.id)) { this.attempts.delete(event.id); repo.upsert({ ...current, syncState: 'SYNCED' }); }
        else this.failPenalty(repo, current);
      }
    } catch { for (const event of batch) { const current = repo.get(event.id); if (current) this.failPenalty(repo, current); } }
  }
  private fail(anchor: ShotAnchor) {
    this.repo.upsert({ ...anchor, syncState: this.nextState(anchor.id) });
  }
  private failPenalty(repo: PenaltyRepository, event: PenaltyEvent) {
    repo.upsert({ ...event, syncState: this.nextState(event.id) });
  }
  private nextState(id: string): ShotAnchor['syncState'] {
    const n = (this.attempts.get(id) ?? 0) + 1;
    this.attempts.set(id, n);
    return n >= SYNC_BACKOFF_MS.length ? 'ERROR' : 'QUEUED';
  }
}
