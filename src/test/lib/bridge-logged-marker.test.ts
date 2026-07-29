import { describe, it, expect } from 'vitest';
import { markBridgeLogged, isAlreadyBridgeLogged } from '@/lib/bridge-logged-marker';

/**
 * The marker is what lets instrumentation-client.ts's beforeSend drop the
 * console-origin ECHO of an error the Bridge pipeline already captured,
 * without touching the deliberate capture. These assertions pin the exact
 * properties that dedup depends on.
 */
describe('bridge-logged-marker', () => {
  it('an unmarked error is not treated as already-logged — the default must be "report it"', () => {
    expect(isAlreadyBridgeLogged(new Error('boom'))).toBe(false);
  });

  it('marks and detects', () => {
    const err = new Error('boom');
    markBridgeLogged(err);
    expect(isAlreadyBridgeLogged(err)).toBe(true);
  });

  it('marks per-instance — a DIFFERENT error with the same message is still reported', () => {
    const a = new Error('boom');
    markBridgeLogged(a);
    expect(isAlreadyBridgeLogged(new Error('boom'))).toBe(false);
  });

  it('is non-enumerable, so it never leaks into a serialized error payload', () => {
    const err = new Error('boom');
    markBridgeLogged(err);
    expect(Object.keys(err)).not.toContain('__helmBridgeLogged');
    expect(JSON.stringify({ ...err })).not.toContain('__helmBridgeLogged');
  });

  it('tolerates non-error values without throwing or claiming they are logged', () => {
    for (const value of [null, undefined, 'a string', 42, {}, []]) {
      expect(isAlreadyBridgeLogged(value)).toBe(false);
    }
  });

  it('never throws on a frozen error — marking is best-effort by contract', () => {
    const frozen = Object.freeze(new Error('frozen'));
    expect(() => markBridgeLogged(frozen)).not.toThrow();
    // And a failed marking must fail SAFE: unmarked means it still gets reported.
    expect(isAlreadyBridgeLogged(frozen)).toBe(false);
  });

  it('is idempotent', () => {
    const err = new Error('boom');
    markBridgeLogged(err);
    markBridgeLogged(err);
    expect(isAlreadyBridgeLogged(err)).toBe(true);
  });
});
