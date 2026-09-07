import { describe, it, expect, vi } from 'vitest';

import {
  BOOT_RECOVERY_SOURCE,
  LEDGER_KEY,
  MAX_ATTEMPTS,
  RELOAD_PARAM,
} from '@/lib/recovery/boot-recovery-source';

/**
 * These run the ACTUAL shipped coordinator source, not a pattern over it.
 *
 * The old guard for this file was a regex asserting the deployment poll read
 * the right JSON field — which is worth keeping, but it could not have caught
 * any of what follows: a budget that reset on hydration, two handlers both
 * recovering from one error, or a document replaced over unsaved hole entry.
 * The script is a string injected by next/script, so it is evaluated here
 * against a hand-built window whose navigations are observable.
 */

type Listener = (event: unknown) => void;

interface HarnessOptions {
  href?: string;
  /** `false` installs a sessionStorage that throws on every access. */
  storage?: boolean | { seed?: string };
  /** Present when the environment exposes a CacheStorage. */
  withCaches?: boolean;
  /** Share a session store across harnesses to model successive documents. */
  store?: Map<string, string>;
}

function createHarness(options: HarnessOptions = {}) {
  const {
    href: initialHref = 'https://app.example/golf/dashboard/rounds/new',
    storage = true,
    withCaches = false,
    store = new Map<string, string>(),
  } = options;

  let href = initialHref;
  const navigations: Array<{ type: 'replace' | 'reload'; url?: string }> = [];
  const listeners = new Map<string, Listener[]>();
  const timers: Array<{ fn: () => void; delay: number }> = [];

  if (typeof storage === 'object' && storage.seed !== undefined) {
    store.set(LEDGER_KEY, storage.seed);
  }
  const deniedStorage = {
    getItem() {
      throw new DOMException('denied');
    },
    setItem() {
      throw new DOMException('denied');
    },
  };
  const workingStorage = {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };

  const cacheKeys = vi.fn(async () => ['golfhelm-static']);
  const cacheDelete = vi.fn(async () => true);

  const win: Record<string, unknown> = {
    location: {
      get href() {
        return href;
      },
      replace: (url: string) => {
        navigations.push({ type: 'replace', url });
        href = url;
      },
      reload: () => {
        navigations.push({ type: 'reload' });
      },
    },
    sessionStorage: storage === false ? deniedStorage : workingStorage,
    history: {
      state: null,
      replaceState: (_state: unknown, _title: string, url: string) => {
        href = url;
      },
    },
    addEventListener: (type: string, fn: Listener) => {
      const existing = listeners.get(type) ?? [];
      existing.push(fn);
      listeners.set(type, existing);
    },
    setTimeout: (fn: () => void, delay: number) => {
      timers.push({ fn, delay });
      return timers.length;
    },
  };
  if (withCaches) {
    win.caches = { keys: cacheKeys, delete: cacheDelete };
  }

  const doc = { title: 'GolfHelm' };
  // No `serviceWorker` key, so the coordinator's teardown branch skips it.
  const nav = {};

  // Executing the shipped inline source is the point of this file.
  const run = new Function('window', 'document', 'navigator', 'caches', BOOT_RECOVERY_SOURCE);
  run(win, doc, nav, win.caches);

  const emit = (type: string, event: Record<string, unknown>) => {
    const preventDefault = vi.fn();
    for (const fn of listeners.get(type) ?? []) {
      fn({ preventDefault, ...event });
    }
    return preventDefault;
  };

  /** Drain queued microtasks, then fire every scheduled navigation timer. */
  const settle = async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    const pending = timers.splice(0, timers.length);
    for (const timer of pending) timer.fn();
  };

  return {
    win,
    navigations,
    cacheKeys,
    timers,
    settle,
    recovery: () => win.__helmRecovery as {
      requestRecovery: (message: unknown) => string;
      workState: () => string;
      attempts: () => number;
      registerWork: (id: string, state: string) => void;
      releaseWork: (id: string) => void;
      markProviderMounted: () => void;
      absorbUrlMarker: () => boolean;
    },
    errorEvent: (message: string) => emit('error', { message, error: { message } }),
    interact: (type: string) => emit(type, {}),
    rejectionEvent: (message: string) => emit('unhandledrejection', { reason: { message } }),
    store,
    storedLedger: () => store.get(LEDGER_KEY) ?? null,
    currentHref: () => href,
  };
}

const CHUNK = 'Loading chunk 4821 failed. (missing: /_next/static/chunks/4821.js)';

describe('boot recovery coordinator — eligibility', () => {
  it('recovers from a stale asset reference', async () => {
    const h = createHarness();
    h.errorEvent(CHUNK);
    await h.settle();
    expect(h.navigations).toHaveLength(1);
    expect(h.navigations[0]?.url).toContain(`${RELOAD_PARAM}=1`);
  });

  it('does not treat a bare transport failure as a stale deployment', async () => {
    const h = createHarness();
    // iOS Safari's wording for any aborted or timed-out request. The old
    // script matched this exactly, so a flaky cell connection could replace
    // the document mid-round.
    h.errorEvent('Load failed');
    h.rejectionEvent('Load failed');
    h.errorEvent('An unexpected response was received from the server.');
    h.rejectionEvent('TypeError: Failed to fetch');
    await h.settle();
    expect(h.navigations).toEqual([]);
  });

  it('still recognizes a server action the new build no longer has', async () => {
    const h = createHarness();
    h.rejectionEvent('Failed to find Server Action "7f2c". This request might be from an older deployment.');
    await h.settle();
    expect(h.navigations).toHaveLength(1);
  });
});

describe('boot recovery coordinator — one decision owner', () => {
  it('claims the attempt once when two handlers see the same error', async () => {
    const h = createHarness();
    // The window listener runs, and then a hydrated caller asks as well —
    // exactly what error-logging and RouteErrorBoundary used to do while the
    // inline script was already recovering.
    h.errorEvent(CHUNK);
    expect(h.recovery().requestRecovery(CHUNK)).toBe('in-flight');
    await h.settle();
    expect(h.navigations).toHaveLength(1);
  });

  it('keeps the budget spent across hydration, and reaches the cap', async () => {
    // The regression this exists for: hydration used to delete both markers,
    // so a genuinely broken bundle got a fresh budget on every reload and the
    // "hard cap" capped nothing. Each iteration below is a separate document
    // — a new coordinator, one shared session store.
    const store = new Map<string, string>();
    let href = 'https://app.example/golf/dashboard';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const doc = createHarness({ href, store });

      // The hydrated half absorbs the marker rather than clearing it.
      expect(doc.recovery().absorbUrlMarker()).toBe(true);
      doc.recovery().markProviderMounted();
      doc.recovery().registerWork('app', 'clean');
      expect(doc.currentHref()).not.toContain(RELOAD_PARAM);
      expect(doc.recovery().attempts()).toBe(attempt - 1);

      doc.errorEvent(CHUNK);
      await doc.settle();

      expect(doc.navigations).toHaveLength(1);
      expect(doc.recovery().attempts()).toBe(attempt);
      href = doc.navigations[0]?.url as string;
    }

    const exhausted = createHarness({ href, store });
    exhausted.recovery().absorbUrlMarker();
    exhausted.recovery().markProviderMounted();
    exhausted.recovery().registerWork('app', 'clean');
    exhausted.errorEvent(CHUNK);
    await exhausted.settle();
    expect(exhausted.navigations).toEqual([]);
  });

  it('stops at the hard cap', async () => {
    const h = createHarness({ href: `https://app.example/x?${RELOAD_PARAM}=${MAX_ATTEMPTS}` });
    h.errorEvent(CHUNK);
    await h.settle();
    expect(h.navigations).toEqual([]);
    expect(h.recovery().requestRecovery(CHUNK)).toBe('budget-spent');
  });
});

describe('boot recovery coordinator — work state gates the document', () => {
  it('refuses while a screen reports unsaved work', async () => {
    const h = createHarness();
    h.recovery().markProviderMounted();
    h.recovery().registerWork('golf-round-continue', 'dirty');

    h.errorEvent(CHUNK);
    await h.settle();

    expect(h.navigations).toEqual([]);
    expect(h.recovery().requestRecovery(CHUNK)).toBe('unsafe-work');
  });

  it('treats a mounted app with no registered owner as unknown, not safe', async () => {
    const h = createHarness();
    h.recovery().markProviderMounted();
    expect(h.recovery().workState()).toBe('unknown');
    h.errorEvent(CHUNK);
    await h.settle();
    expect(h.navigations).toEqual([]);
  });

  it('recovers once the screen releases its work', async () => {
    const h = createHarness();
    h.recovery().markProviderMounted();
    h.recovery().registerWork('golf-round-continue', 'dirty');
    expect(h.recovery().requestRecovery(CHUNK)).toBe('unsafe-work');

    h.recovery().registerWork('golf-round-continue', 'clean');
    h.errorEvent(CHUNK);
    await h.settle();
    expect(h.navigations).toHaveLength(1);
  });

  it('still recovers during the pristine pre-hydration window', async () => {
    // The cold-boot stale-chunk case the mechanism exists for: nothing has
    // mounted, nothing has been typed, so there is provably nothing to lose.
    const h = createHarness();
    expect(h.recovery().workState()).toBe('clean');
    h.errorEvent(CHUNK);
    await h.settle();
    expect(h.navigations).toHaveLength(1);
  });

  it('stops trusting the pristine window once the user has interacted', async () => {
    const h = createHarness();
    // A tap deep inside the app after a client-side navigation: no owner has
    // registered yet, but this is no longer an untouched document, so the
    // "provably nothing to lose" reasoning no longer applies.
    h.interact('pointerdown');
    expect(h.recovery().workState()).toBe('unknown');
    h.errorEvent(CHUNK);
    await h.settle();
    expect(h.navigations).toEqual([]);
  });
});

describe('boot recovery coordinator — hostile storage', () => {
  it('stays bounded by the URL when sessionStorage is denied', async () => {
    const h = createHarness({ storage: false });
    h.errorEvent(CHUNK);
    await h.settle();
    expect(h.navigations).toHaveLength(1);
    expect(h.navigations[0]?.url).toContain(`${RELOAD_PARAM}=1`);
  });

  it('does not clear the URL marker it could not persist', () => {
    const h = createHarness({
      storage: false,
      href: `https://app.example/x?${RELOAD_PARAM}=2`,
    });
    expect(h.recovery().absorbUrlMarker()).toBe(false);
    expect(h.currentHref()).toContain(`${RELOAD_PARAM}=2`);
    expect(h.recovery().attempts()).toBe(2);
  });

  it('reads a malformed ledger as no stored attempts rather than throwing', async () => {
    const h = createHarness({ storage: { seed: '{not json' } });
    expect(h.recovery().attempts()).toBe(0);
    h.errorEvent(CHUNK);
    await h.settle();
    expect(h.navigations).toHaveLength(1);
  });
});

describe('boot recovery coordinator — escalation order', () => {
  it('does not tear down caches on the first attempt', async () => {
    const h = createHarness({ withCaches: true });
    h.errorEvent(CHUNK);
    await h.settle();
    expect(h.navigations).toHaveLength(1);
    expect(h.cacheKeys).not.toHaveBeenCalled();
  });

  it('escalates to a cache teardown only on a later attempt', async () => {
    const h = createHarness({
      withCaches: true,
      href: `https://app.example/x?${RELOAD_PARAM}=1`,
    });
    h.errorEvent(CHUNK);
    await h.settle();
    expect(h.cacheKeys).toHaveBeenCalled();
    expect(h.navigations).toHaveLength(1);
  });
});
