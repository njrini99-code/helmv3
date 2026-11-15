/**
 * Unit tests never reach a real network, and never a real Supabase project.
 *
 * WHY (launch readiness DATA-01, 2026-11-15): production's edge logs showed about 3,000 failed calls a day with a
 * `node` user agent on `golf_round_live`, `golf_round_live_prefs` and `golf_rounds?player_id=eq.player-1`. They were
 * unit runs. CI's workflow env hands every job the real `NEXT_PUBLIC_SUPABASE_URL` and anon key (ci.yml and
 * nightly.yml, top-level `env`), vitest passes the shell's environment through to tests, and seven round-entry suites
 * mounted `browserSharePorts` (src/clubhouse/live/share-ports.ts) on the real browser client. A canary run of those
 * suites against a local listener replays the production pattern request for request. They only failed because the
 * anon key has no session; one test with a valid session would have written. Vitest itself never reads `.env.local`
 * (checked 2026-11-15), so a run's Supabase target is whatever its shell exports.
 *
 * WHAT, in layers, each enough on its own for the case it covers:
 *  1. `TEST_SUPABASE_ENV` pins the public Supabase URL and keys to a local, keyless stand-in (vitest.config.ts `env`,
 *     and again before every file here, since a test that sets `process.env` directly leaks into the next file in its
 *     worker). `WITHHELD_ENV` removes the server-side Supabase secrets.
 *  2. `@/lib/supabase/client` is replaced for every test (src/test/setup.tsx) by `createOfflineSupabaseClient`: it
 *     builds without complaint, and the first query, RPC, channel, auth or storage call throws
 *     `NetworkCallInTestError` naming the call. A test that needs a client mocks the module itself, as 89 already do.
 *  3. `installNetworkGuard` makes `fetch`, `WebSocket` and `XMLHttpRequest` refuse any host but loopback, and any
 *     Supabase API path (`/rest/v1/`, `/auth/v1/`, ...) on any host, and backs them with a TCP guard
 *     (`net.Socket#connect`) for SDKs that open sockets themselves. Refusals behave as a failed request does: `fetch`
 *     rejects, a socket emits an error. Loopback stays open for tests that start a local server.
 *
 * A test that wants to exercise a network path stubs it (`vi.stubGlobal('fetch', ...)`, `vi.spyOn(globalThis,
 * 'fetch')`, or `vi.mock` of the client module); the guard sits underneath those and is restored with them.
 */
import net from 'node:net';

/** The Supabase URL every test sees: the local stack's address, which no test is allowed to call either. */
export const TEST_SUPABASE_URL = 'http://127.0.0.1:54321';

/** Pinned for every test: a local URL and a key that is not a key. */
export const TEST_SUPABASE_ENV: Readonly<Record<string, string>> = Object.freeze({
  NEXT_PUBLIC_SUPABASE_URL: TEST_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-not-a-real-key',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-anon-key-not-a-real-key',
});

/** Server-side Supabase credentials and targets no unit test may inherit from the shell. */
export const WITHHELD_ENV: readonly string[] = Object.freeze([
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_PROJECT_REF',
]);

/** Thrown, or carried by a rejected request, when test code tries to reach the network. */
export class NetworkCallInTestError extends Error {
  constructor(what: string, reason: string) {
    super(
      `Network call in a test: ${what} (${reason}). Unit tests never reach a real service: mock the module that makes ` +
        "the call (for Supabase, vi.mock('@/lib/supabase/client') or pass a fake client), or stub fetch " +
        "(vi.stubGlobal('fetch', ...)). See src/test/network-isolation.ts.",
    );
    this.name = 'NetworkCallInTestError';
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/** True for loopback: `localhost`, `*.localhost`, 127.0.0.0/8 and ::1. */
export function isLoopbackHost(host: string | undefined | null): boolean {
  if (!host) return true; // Node defaults an omitted host to localhost.
  const h = host.toLowerCase().replace(/\.$/, '');
  return LOOPBACK_HOSTS.has(h) || h.endsWith('.localhost') || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

/** Supabase's API surface. A request on one of these paths is a Supabase call, whichever host it names. */
const SUPABASE_API_PATH = /^\/(rest|auth|storage|realtime|functions|graphql|pg)\/v1(\/|$)/;

/**
 * Why a test may not open `url`, or `null` when it may. Only http(s) and ws(s) are judged: `data:`, `blob:` and
 * anything unparseable are left to the real implementation, which handles them as it always has.
 */
export function blockedReason(url: string | URL, base?: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(String(url), base);
  } catch {
    return null;
  }
  if (!/^(https?|wss?):$/.test(parsed.protocol)) return null;
  if (SUPABASE_API_PATH.test(parsed.pathname)) return `a Supabase API path on ${parsed.host}`;
  if (!isLoopbackHost(parsed.hostname)) return `${parsed.host} is not loopback`;
  return null;
}

/** Pins the Supabase env for one test file. Idempotent. */
export function pinTestEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  for (const [key, value] of Object.entries(TEST_SUPABASE_ENV)) env[key] = value;
  for (const key of WITHHELD_ENV) delete env[key];
}

function currentBase(): string | undefined {
  const href = (globalThis as { location?: { href?: string } }).location?.href;
  return typeof href === 'string' && /^https?:/.test(href) ? href : undefined;
}

function requestUrl(input: unknown): string | URL | null {
  if (typeof input === 'string' || input instanceof URL) return input;
  if (input && typeof input === 'object' && typeof (input as { url?: unknown }).url === 'string') {
    return (input as { url: string }).url;
  }
  return null;
}

const GUARDED = Symbol.for('helm.test.networkGuard');
type Marked = { [GUARDED]?: true };

function guardFetch(): void {
  const real = globalThis.fetch as typeof fetch & Marked;
  if (typeof real !== 'function' || real[GUARDED]) return;
  const guarded = function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = requestUrl(input);
    const reason = url === null ? null : blockedReason(url, currentBase());
    if (reason) return Promise.reject(new NetworkCallInTestError(`fetch ${String(url)}`, reason));
    return real(input, init);
  } as typeof fetch & Marked;
  guarded[GUARDED] = true;
  globalThis.fetch = guarded;
}

function guardWebSocket(): void {
  const Real = (globalThis as { WebSocket?: (new (...args: unknown[]) => object) & Marked }).WebSocket;
  if (typeof Real !== 'function' || Real[GUARDED]) return;
  const Guarded = new Proxy(Real, {
    construct(target, args, newTarget) {
      const reason = blockedReason(String(args[0]), currentBase());
      if (reason) throw new NetworkCallInTestError(`new WebSocket(${String(args[0])})`, reason);
      return Reflect.construct(target, args, newTarget);
    },
    get(target, prop, receiver) {
      return prop === GUARDED ? true : Reflect.get(target, prop, receiver);
    },
  });
  (globalThis as { WebSocket?: unknown }).WebSocket = Guarded;
}

function guardXhr(): void {
  const Xhr = (globalThis as { XMLHttpRequest?: (new () => XMLHttpRequest) & { prototype: XMLHttpRequest & Marked } })
    .XMLHttpRequest;
  if (typeof Xhr !== 'function' || Xhr.prototype[GUARDED]) return;
  const realOpen = Xhr.prototype.open as (...args: unknown[]) => void;
  Xhr.prototype.open = function open(this: XMLHttpRequest, ...args: unknown[]) {
    const reason = blockedReason(String(args[1]), currentBase());
    if (reason) throw new NetworkCallInTestError(`XMLHttpRequest ${String(args[0])} ${String(args[1])}`, reason);
    return realOpen.apply(this, args);
  } as XMLHttpRequest['open'];
  Xhr.prototype[GUARDED] = true;
}

/** The host a `Socket#connect` call names, or `undefined` for a Unix socket or pipe (never network). */
function connectTarget(args: unknown[]): { host?: string; port?: unknown; ipc: boolean } {
  let first = args[0];
  // Node's own callers (net.connect, tls.connect, http agents) pass a normalized [options, cb] array.
  if (Array.isArray(first)) first = first[0];
  if (first && typeof first === 'object') {
    const o = first as { host?: string; port?: unknown; path?: string };
    if (typeof o.path === 'string' && o.port === undefined) return { ipc: true };
    return { host: o.host, port: o.port, ipc: false };
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) return { ipc: true };
  return { host: typeof args[1] === 'string' ? args[1] : undefined, port: first, ipc: false };
}

function guardSockets(): void {
  const proto = net.Socket.prototype as net.Socket & Marked;
  if (proto[GUARDED]) return;
  const realConnect = proto.connect as (...args: unknown[]) => net.Socket;
  proto.connect = function connect(this: net.Socket, ...args: unknown[]) {
    const target = connectTarget(args);
    if (!target.ipc && !isLoopbackHost(target.host)) {
      const error = new NetworkCallInTestError(
        `a TCP connection to ${target.host}:${String(target.port)}`,
        `${target.host} is not loopback`,
      );
      // A refused connection fails the way a real one does: asynchronously, through the socket's 'error' event.
      process.nextTick(() => this.destroy(error));
      return this;
    }
    return realConnect.apply(this, args);
  } as net.Socket['connect'];
  proto[GUARDED] = true;
}

/** Installs every layer of the guard. Idempotent, so a second setup pass in the same worker changes nothing. */
export function installNetworkGuard(): void {
  guardFetch();
  guardWebSocket();
  guardXhr();
  guardSockets();
}

/**
 * The stand-in for `@/lib/supabase/client`'s `createClient()` in every test. Building it never throws, so a screen
 * that builds its client during render still renders; the first call into it (`from()`, `rpc()`, `channel()`,
 * `auth.getUser()`, `storage.from()`, ...) throws `NetworkCallInTestError` with the call's path, which the code under
 * test then handles exactly as it handles a failed request. Nothing about it is thenable, so `await client` is inert.
 */
export function createOfflineSupabaseClient(): unknown {
  const node = (path: string): unknown =>
    new Proxy(function offlineSupabase() {}, {
      get(_target, prop) {
        if (typeof prop === 'symbol' || prop === 'then') return undefined;
        return node(`${path}.${prop}`);
      },
      apply() {
        throw new NetworkCallInTestError(`${path}()`, 'the Supabase browser client is offline in tests');
      },
    });
  return node('supabase');
}

/**
 * True when a Supabase URL names a hosted project (`*.supabase.co` or `*.supabase.com`) rather than a local stand-in.
 * Used by setup to refuse a pin that was edited to point anywhere real.
 */
export function namesHostedSupabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith('.supabase.co') || host.endsWith('.supabase.com') || host.endsWith('.supabase.in');
  } catch {
    return false;
  }
}
