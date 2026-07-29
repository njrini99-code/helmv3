import { describe, it, expect } from 'vitest';
import {
  runWithRequestContext,
  getRequestId,
  getRequestAction,
  newRequestId,
  __runWithRequestContextForTests,
} from '@/lib/admin/request-context';

describe('request-context', () => {
  it('returns null outside any scope — behaviour is unchanged for unwrapped code', () => {
    expect(getRequestId()).toBeNull();
    expect(getRequestAction()).toBeNull();
  });

  it('exposes an id and action inside a scope', () => {
    runWithRequestContext({ action: 'savePartialRound' }, () => {
      expect(getRequestId()).toBeTruthy();
      expect(getRequestAction()).toBe('savePartialRound');
    });
  });

  it('gives the SAME id to every read within one scope — this is the whole point', () => {
    runWithRequestContext({ action: 'a' }, () => {
      expect(getRequestId()).toBe(getRequestId());
    });
  });

  it('gives DIFFERENT ids to sibling scopes', () => {
    let a: string | null = null;
    let b: string | null = null;
    runWithRequestContext({ action: 'a' }, () => {
      a = getRequestId();
    });
    runWithRequestContext({ action: 'b' }, () => {
      b = getRequestId();
    });
    expect(a).not.toBe(b);
  });

  it('REUSES the outer scope when nested — a wrapped action calling another wrapped action must not fragment the correlation', () => {
    runWithRequestContext({ action: 'outer' }, () => {
      const outer = getRequestId();
      runWithRequestContext({ action: 'inner' }, () => {
        expect(getRequestId()).toBe(outer);
        // The action stays the OUTER one: the scope was not replaced.
        expect(getRequestAction()).toBe('outer');
      });
    });
  });

  it('propagates across await boundaries', async () => {
    await runWithRequestContext({ action: 'async' }, async () => {
      const before = getRequestId();
      await new Promise((r) => setTimeout(r, 1));
      expect(getRequestId()).toBe(before);
    });
  });

  it('returns the callback value through', () => {
    expect(runWithRequestContext({ action: 'x' }, () => 42)).toBe(42);
  });

  it('propagates a throw rather than swallowing it', () => {
    expect(() =>
      runWithRequestContext({ action: 'x' }, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
  });

  it('closes the scope after the body completes', () => {
    runWithRequestContext({ action: 'x' }, () => getRequestId());
    expect(getRequestId()).toBeNull();
  });

  it('newRequestId produces distinct non-empty ids', () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('supports a deterministic test scope', () => {
    __runWithRequestContextForTests({ requestId: 'fixed-id', action: 'fixed' }, () => {
      expect(getRequestId()).toBe('fixed-id');
    });
  });
});
