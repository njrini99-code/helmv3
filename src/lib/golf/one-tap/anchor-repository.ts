import { shotAnchorSchema, type ShotAnchor } from './shot-anchor';

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
 * device before the estimator even finishes. Rows that no longer parse are
 * dropped and counted, never silently repaired. */
export class StorageAnchorRepository extends MemoryAnchorRepository {
  invalidRows = 0;
  constructor(private readonly storage: StorageLike, roundIds: readonly string[]) {
    super();
    for (const roundId of roundIds) this.load(roundId);
  }
  private load(roundId: string) {
    let raw: string | null = null;
    try { raw = this.storage.getItem(ANCHOR_STORAGE_PREFIX + roundId); } catch { return; }
    if (!raw) return;
    try {
      const rows = JSON.parse(raw) as unknown[];
      for (const row of Array.isArray(rows) ? rows : []) {
        const parsed = shotAnchorSchema.safeParse(row);
        if (parsed.success) this.byId.set(parsed.data.id, parsed.data); else this.invalidRows++;
      }
    } catch { this.invalidRows++; }
  }
  protected override persist(roundId: string): void {
    try { this.storage.setItem(ANCHOR_STORAGE_PREFIX + roundId, JSON.stringify(this.list(roundId))); } catch { /* private mode: memory only */ }
  }
  clear(roundId: string) {
    for (const a of this.list(roundId)) this.byId.delete(a.id);
    try { this.storage.removeItem(ANCHOR_STORAGE_PREFIX + roundId); } catch { /* ignore */ }
  }
}
export interface SyncTransport { upsertAnchors(anchors: readonly ShotAnchor[]): Promise<{ acceptedIds: readonly string[] }> }
export const SYNC_BACKOFF_MS: readonly number[] = [1000, 2000, 5000, 15000, 60000];
/** Idempotent server sync. Every attempt sends the full anchor keyed by id;
 * the server upserts. Failure leaves the row QUEUED (or ERROR after the
 * backoff ladder is exhausted, still retried on the next flush). */
export class SyncQueue {
  private attempts = new Map<string, number>();
  private inFlight: Promise<void> | null = null;
  constructor(private readonly repo: AnchorRepository, private readonly transport: SyncTransport | null, private readonly roundId: string) {}
  enqueue(id: string) {
    const anchor = this.repo.get(id);
    if (anchor && anchor.syncState !== 'QUEUED') this.repo.upsert({ ...anchor, syncState: 'QUEUED' });
  }
  pending(): ShotAnchor[] { return this.repo.list(this.roundId).filter(a => a.syncState === 'QUEUED' || a.syncState === 'ERROR'); }
  backoffFor(id: string): number { return SYNC_BACKOFF_MS[Math.min(this.attempts.get(id) ?? 0, SYNC_BACKOFF_MS.length - 1)]!; }
  flush(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
  private async run() {
    const batch = this.pending();
    if (!batch.length || !this.transport) return;
    try {
      const { acceptedIds } = await this.transport.upsertAnchors(batch);
      for (const anchor of batch) {
        const current = this.repo.get(anchor.id);
        if (!current) continue;
        if (acceptedIds.includes(anchor.id)) { this.attempts.delete(anchor.id); this.repo.upsert({ ...current, syncState: 'SYNCED' }); }
        else this.fail(current);
      }
    } catch { for (const anchor of batch) { const current = this.repo.get(anchor.id); if (current) this.fail(current); } }
  }
  private fail(anchor: ShotAnchor) {
    const n = (this.attempts.get(anchor.id) ?? 0) + 1;
    this.attempts.set(anchor.id, n);
    this.repo.upsert({ ...anchor, syncState: n >= SYNC_BACKOFF_MS.length ? 'ERROR' : 'QUEUED' });
  }
}
