// =============================================================================
// public/sw.js — fetch routing contract.
//
// WHY THIS EXISTS NOW. On 2026-07-29 a user on full LTE bars was shown
// offline.html on helmsportslabs.com and could not get past it. The worker is
// registered with `scope: '/'` from the golf dashboard (OfflineProvider), so it
// controls the whole origin; every marketing navigation was intercepted, and
// handleDynamicRequest's catch turned ANY single fetch rejection into a
// full-page "No Connection". The "Try Again" button re-entered the same
// handler.
//
// The worker had no tests at all. It is also the single most dangerous file in
// the repo: a bad one pins every client permanently, and you cannot push a fix
// to a client that will not fetch. So the routing rules get pinned here.
//
// HOW THIS TESTS A SERVICE WORKER WITHOUT A BROWSER. sw.js is plain JS built
// around `self.addEventListener`. We evaluate it in a `vm` context with a
// synthetic `self`, capture the registered handlers, and drive the fetch
// handler with fabricated events — asserting on whether the worker chose to
// respond AT ALL (respondWith called or not), which is exactly the property
// that broke.
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const SW_SOURCE = readFileSync(join(__dirname, '../../..', 'public/sw.js'), 'utf8');

interface FakeEvent {
  request: {
    url: string;
    method: string;
    mode: string;
    headers: { get: () => string | null };
  };
  respondWith: (p: unknown) => void;
  waitUntil: (p: unknown) => void;
  /** Set by our fake respondWith so a test can assert interception. */
  responded: boolean;
}

type Handlers = Record<string, (e: unknown) => void>;

/** Load sw.js in an isolated context and return its registered handlers. */
function loadWorker(options: { onLine: boolean }): Handlers {
  const handlers: Handlers = {};

  const selfObj: Record<string, unknown> = {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      handlers[type] = fn;
    },
    location: { href: 'https://helmsportslabs.com/sw.js', origin: 'https://helmsportslabs.com' },
    navigator: { onLine: options.onLine },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
    registration: {},
  };

  const sandbox: Record<string, unknown> = {
    self: selfObj,
    caches: {
      open: async () => ({ match: async () => undefined, put: async () => undefined, add: async () => undefined }),
      keys: async () => [],
      delete: async () => true,
    },
    fetch: async () => {
      throw new Error('simulated network failure');
    },
    Response: class {},
    URL,
    console: { warn: () => {}, log: () => {}, error: () => {} },
    setTimeout,
    clearTimeout,
    Promise,
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(SW_SOURCE, sandbox);
  return handlers;
}

function makeEvent(url: string, mode: string, method = 'GET'): FakeEvent {
  const e: FakeEvent = {
    request: { url, method, mode, headers: { get: () => null } },
    respondWith: (p: unknown) => {
      e.responded = true;
      // Swallow here so a handler that legitimately rejects (the new
      // behaviour under test) does not surface as an unhandled rejection and
      // fail the run for the wrong reason. Tests that care about the
      // rejection override respondWith and assert on it directly.
      void Promise.resolve(p).catch(() => {});
    },
    waitUntil: () => {},
    responded: false,
  };
  return e;
}

let handlers: Handlers;

beforeEach(() => {
  handlers = loadWorker({ onLine: true });
});

describe('sw.js fetch routing — what the worker refuses to touch', () => {
  it('registers a fetch handler at all (guards against a load failure)', () => {
    // If sw.js failed to evaluate, every assertion below would vacuously pass
    // because `responded` would stay false for the wrong reason.
    expect(typeof handlers.fetch).toBe('function');
    expect(typeof handlers.install).toBe('function');
    expect(typeof handlers.activate).toBe('function');
  });

  it('does NOT intercept a marketing navigation — the bug that shipped', () => {
    // helmsportslabs.com/ and every other non-golf-dashboard page. This is the
    // exact request that was answered with "No Connection" on a live LTE
    // connection.
    for (const url of [
      'https://helmsportslabs.com/',
      'https://helmsportslabs.com/pricing',
      'https://helmsportslabs.com/golf/login',
      'https://helmsportslabs.com/baseball/login',
      'https://helmsportslabs.com/baseball/dashboard/roster',
    ]) {
      const e = makeEvent(url, 'navigate');
      handlers.fetch!(e);
      expect(e.responded, `${url} must not be intercepted`).toBe(false);
    }
  });

  it('DOES still intercept golf dashboard navigations (offline support preserved)', () => {
    // The non-vacuity counterpart: if the worker stopped handling everything,
    // the test above would pass while the feature it protects was deleted.
    const e = makeEvent('https://helmsportslabs.com/golf/dashboard', 'navigate');
    handlers.fetch!(e);
    expect(e.responded).toBe(true);

    const nested = makeEvent('https://helmsportslabs.com/golf/dashboard/rounds', 'navigate');
    handlers.fetch!(nested);
    expect(nested.responded).toBe(true);
  });

  it('does not touch cross-origin requests', () => {
    const e = makeEvent('https://qmnssrrolpinvwjjnufo.supabase.co/auth/v1/user', 'cors');
    handlers.fetch!(e);
    expect(e.responded).toBe(false);
  });

  it('does not touch non-GET requests', () => {
    const e = makeEvent('https://helmsportslabs.com/api/golf/rounds', 'cors', 'POST');
    handlers.fetch!(e);
    expect(e.responded).toBe(false);
  });

  it('still handles same-origin static assets and API reads', () => {
    const asset = makeEvent('https://helmsportslabs.com/_next/static/chunks/main-abc.js', 'no-cors');
    handlers.fetch!(asset);
    expect(asset.responded).toBe(true);

    const api = makeEvent('https://helmsportslabs.com/api/golf/rounds', 'cors');
    handlers.fetch!(api);
    expect(api.responded).toBe(true);
  });
});

describe('sw.js — the offline page is only for actually being offline', () => {
  it('never serves offline.html to a navigation while the device reports online', async () => {
    // Drives the golf-dashboard page handler (the only navigation still
    // intercepted) with a failing fetch and a cache miss, on a device that
    // says it IS online. It must reject rather than resolve to offline.html,
    // so the browser shows its own recoverable error.
    const online = loadWorker({ onLine: true });
    const e = makeEvent('https://helmsportslabs.com/golf/dashboard', 'navigate');
    let responded: Promise<unknown> | null = null;
    e.respondWith = (p) => {
      responded = p as Promise<unknown>;
    };
    online.fetch!(e);

    expect(responded).not.toBeNull();
    await expect(responded!).rejects.toThrow(/simulated network failure/);
  });

  it('DOES serve the offline page when the device reports offline', async () => {
    // The counterpart. Without this, "never serve offline.html" could be
    // satisfied by deleting offline support altogether.
    const offline = loadWorker({ onLine: false });
    const e = makeEvent('https://helmsportslabs.com/golf/dashboard', 'navigate');
    let responded: Promise<unknown> | null = null;
    e.respondWith = (p) => {
      responded = p as Promise<unknown>;
    };
    offline.fetch!(e);

    expect(responded).not.toBeNull();
    await expect(responded!).resolves.toBeDefined();
  });
});

describe('sw.js — no fabricated responses', () => {
  it('does not answer a failed static asset with a synthetic empty 404', async () => {
    // An empty body reads as a successful-but-empty script to the page, which
    // is a WEAKER signal than a network error and gives
    // StaleDeploymentRecoveryScript less to catch.
    const e = makeEvent('https://helmsportslabs.com/_next/static/chunks/main-abc.js', 'no-cors');
    let responded: Promise<unknown> | null = null;
    e.respondWith = (p) => {
      responded = p as Promise<unknown>;
    };
    handlers.fetch!(e);

    expect(responded).not.toBeNull();
    await expect(responded!).rejects.toThrow(/simulated network failure/);
  });

  it('source contains no synthetic empty-body Response for assets', () => {
    // Strip comments first. The previous version of this assertion matched the
    // comment in sw.js that NAMES the forbidden pattern in order to explain
    // why it was removed — a checker tripping over its own documentation.
    const code = SW_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(code).not.toMatch(/new Response\(''\s*,\s*\{\s*status:\s*404/);
    expect(code).not.toMatch(/new Response\(''\s*,\s*\{\s*status:\s*503/);

    // Non-vacuity: the stripper must not have eaten the whole file.
    expect(code).toContain('addEventListener');
    expect(code.length).toBeGreaterThan(2000);
  });
});
