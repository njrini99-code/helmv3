/**
 * Unsent message drafts by conversation id. A Map that also writes through to
 * sessionStorage, keyed by the signed-in user, so a reload keeps what was
 * typed (F-12) while closing the tab, or another account on the same device,
 * does not. Storage can be absent or refuse writes (private mode, quota):
 * every access is guarded, and the in-memory Map still works.
 */
export class DraftStore extends Map<string, string> {
  private readonly key: string;

  constructor(userId: string) {
    super();
    this.key = `ch.msg.drafts.${userId}`;
    try {
      const raw = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(this.key);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        for (const [id, text] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof text === 'string' && text) super.set(id, text);
        }
      }
    } catch {
      // Unreadable or malformed storage: start empty.
    }
  }

  override set(id: string, text: string): this {
    super.set(id, text);
    this.persist();
    return this;
  }

  override delete(id: string): boolean {
    const had = super.delete(id);
    if (had) this.persist();
    return had;
  }

  override clear(): void {
    super.clear();
    this.persist();
  }

  private persist(): void {
    try {
      if (typeof sessionStorage === 'undefined') return;
      if (this.size === 0) sessionStorage.removeItem(this.key);
      else sessionStorage.setItem(this.key, JSON.stringify(Object.fromEntries(this)));
    } catch {
      // A refused write keeps the draft in memory only.
    }
  }
}
