/**
 * onboarding-storage.test.ts
 *
 * jsdom in this workspace does not expose window.localStorage (see
 * src/lib/baseball/lifting/__tests__/live-set-offline-buffer.test.ts), so we
 * install a minimal in-memory Storage the same way that suite does — this
 * gives the module a real persistence surface to assert against, while the
 * module itself stays guarded (typeof window === 'undefined' / try-catch) so
 * it never depends on this shim existing in production.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readLiftOnboardingFlag, writeLiftOnboardingFlag } from './onboarding-storage';

function installMemoryStorage(): void {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    clear: () => store.clear(),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  };
  Object.defineProperty(window, 'localStorage', { value: mock, configurable: true, writable: true });
}

beforeEach(() => {
  installMemoryStorage();
});

describe('onboarding-storage — Lift Lab tour localStorage fallback', () => {
  it('reads false for an athlete that has never been written', () => {
    expect(readLiftOnboardingFlag('athlete-1')).toBe(false);
  });

  it('reads false for a null athleteId (never touches storage)', () => {
    expect(readLiftOnboardingFlag(null)).toBe(false);
  });

  it('round-trips: write then read returns true for that athlete', () => {
    writeLiftOnboardingFlag('athlete-1');
    expect(readLiftOnboardingFlag('athlete-1')).toBe(true);
  });

  it('is scoped per-athlete-id — writing one athlete never flags another', () => {
    writeLiftOnboardingFlag('athlete-1');
    expect(readLiftOnboardingFlag('athlete-2')).toBe(false);
  });

  it('writeLiftOnboardingFlag is a no-op for a null athleteId', () => {
    writeLiftOnboardingFlag(null);
    expect(readLiftOnboardingFlag(null)).toBe(false);
  });

  it('degrades to false when localStorage.getItem throws (private browsing)', () => {
    const original = window.localStorage.getItem;
    window.localStorage.getItem = () => {
      throw new Error('storage disabled');
    };
    try {
      expect(readLiftOnboardingFlag('athlete-1')).toBe(false);
    } finally {
      window.localStorage.getItem = original;
    }
  });

  it('degrades silently when localStorage.setItem throws (storage full/disabled)', () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('quota exceeded');
    };
    try {
      expect(() => writeLiftOnboardingFlag('athlete-1')).not.toThrow();
    } finally {
      window.localStorage.setItem = original;
    }
  });
});
