import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  assertSafeTarget,
  resolveProjectRef,
  KNOWN_PROD_PROJECT_REF,
  PROTECTED_TABLES,
} from '../../../scripts/lib/prod-target-guard.mjs';

/**
 * The guard four demo/debug scripts rely on to not delete production rounds.
 *
 * This test exists because an untested guard is worse than no guard: it reads
 * as protection in review, and nobody discovers it never fired until the run
 * that needed it. Every branch below is a way the guard can fail OPEN, which is
 * the only failure direction that matters here — a false refusal costs a flag,
 * a false permit costs a season of a player's shot history with no recovery
 * path (golf_rounds cascades to holes, shots, reviews and stats_cache).
 */

const PROD = `https://${KNOWN_PROD_PROJECT_REF}.supabase.co`;
const LOCAL = 'http://127.0.0.1:54321';

let exitSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // process.exit must actually stop execution, or the code after the guard
  // runs anyway and the test passes while the real script would still delete.
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`__EXIT_${code}__`);
  }) as never);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  exitSpy.mockRestore();
  errSpy.mockRestore();
  warnSpy.mockRestore();
});

const call = (o: Record<string, unknown>) =>
  assertSafeTarget({ scriptName: 'test', deletes: ['golf_rounds'], ...o } as never);

describe('assertSafeTarget — refuses', () => {
  it('production without --allow-prod', () => {
    expect(() => call({ url: PROD, allowProd: false })).toThrow('__EXIT_1__');
    expect(errSpy.mock.calls[0]?.[0]).toContain('REFUSING TO RUN against PRODUCTION');
  });

  it('an unset URL — an unknown target is not a safe target', () => {
    expect(() => call({ url: '', allowProd: true })).toThrow('__EXIT_1__');
  });

  it('an unparseable URL, even with --allow-prod', () => {
    // Fails closed regardless of the flag: the flag authorizes production, not
    // an unidentifiable target.
    expect(() => call({ url: 'not-a-url', allowProd: true })).toThrow('__EXIT_1__');
  });

  it('names the protected tables at stake in the refusal', () => {
    expect(() =>
      call({ url: PROD, allowProd: false, deletes: ['golf_shots', 'golf_holes'] }),
    ).toThrow('__EXIT_1__');
    const msg = String(errSpy.mock.calls[0]?.[0]);
    expect(msg).toContain('golf_shots');
    expect(msg).toContain('cascades');
  });
});

describe('assertSafeTarget — proceeds', () => {
  it('production WITH --allow-prod, loudly', () => {
    const r = call({ url: PROD, allowProd: true });
    expect(r).toEqual({ projectRef: KNOWN_PROD_PROJECT_REF, isProd: true });
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('PRODUCTION');
  });

  it('a DRY RUN against production without the flag', () => {
    // Deliberate: refusing a dry run trains people to pass --allow-prod
    // reflexively, which defeats the guard on the runs that do write.
    const r = call({ url: PROD, allowProd: false, dryRun: true });
    expect(r.isProd).toBe(true);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('DRY RUN');
  });

  it('a non-production target with no flags at all', () => {
    expect(call({ url: LOCAL, allowProd: false })).toEqual({
      projectRef: '127',
      isProd: false,
    });
  });
});

describe('resolveProjectRef', () => {
  it('extracts the ref from a Supabase URL', () => {
    expect(resolveProjectRef(PROD)).toBe(KNOWN_PROD_PROJECT_REF);
  });

  it('returns empty — never a plausible-looking ref — for junk', () => {
    // Callers treat '' as UNKNOWN and refuse. If this ever returned a
    // non-empty string for garbage, every caller would read it as "not prod".
    expect(resolveProjectRef('')).toBe('');
    expect(resolveProjectRef('not-a-url')).toBe('');
    expect(resolveProjectRef(undefined as never)).toBe('');
  });
});

describe('PROTECTED_TABLES', () => {
  it('covers the full cascade beneath a round, not just the round', () => {
    // Deleting golf_rounds destroys everything below it. Listing only the
    // parent would understate the loss in the refusal message.
    for (const t of ['golf_rounds', 'golf_shots', 'golf_holes', 'golf_round_reviews', 'golf_players']) {
      expect(PROTECTED_TABLES).toContain(t);
    }
  });
});
