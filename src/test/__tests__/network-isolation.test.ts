// @vitest-environment jsdom
/**
 * The unit suite's network isolation (src/test/network-isolation.ts, wired in src/test/setup.tsx and vitest.config.ts)
 * actually isolates. Launch readiness DATA-01, 2026-11-15: unit runs sent about 3,000 failed calls a day to production
 * Supabase, the round-entry suites' `golf_round_live`, `golf_round_live_prefs` and `golf_rounds` reads among them.
 *
 * jsdom on purpose: it is the environment the component suites run in, and the only one with XMLHttpRequest.
 */
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const reports = vi.hoisted(() => [] as unknown[]);
vi.mock('@/clubhouse/lib/track', async (orig) => ({
  ...(await orig<typeof import('@/clubhouse/lib/track')>()),
  chReport: (error: unknown) => {
    reports.push(error);
  },
}));

import { createClient } from '@/lib/supabase/client';
import { browserSharePorts } from '@/clubhouse/live/share-ports';
import {
  NetworkCallInTestError,
  TEST_SUPABASE_URL,
  WITHHELD_ENV,
  blockedReason,
  createOfflineSupabaseClient,
  namesHostedSupabase,
} from '../network-isolation';

const PROD = 'https://qmnssrrolpinvwjjnufo.supabase.co';
const STAGING = 'https://ybmwektreyrwjscxlogv.supabase.co';

/** The error a socket reports, or 'connected' if it gets that far. */
function socketOutcome(socket: net.Socket): Promise<unknown> {
  return new Promise((resolve) => {
    socket.once('error', resolve);
    socket.once('connect', () => {
      socket.destroy();
      resolve('connected');
    });
  });
}

describe('the environment a test sees', () => {
  it('names the local stand-in, never a hosted project, and no server-side Supabase secret', () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(TEST_SUPABASE_URL);
    expect(namesHostedSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL)).toBe(false);
    expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toMatch(/^test-/);
    for (const key of WITHHELD_ENV) expect(process.env[key], key).toBeUndefined();
  });
});

describe('blockedReason', () => {
  it('blocks production, staging and any other host that is not loopback', () => {
    expect(blockedReason(`${PROD}/rest/v1/golf_round_live?select=share`)).toMatch(/Supabase API path/);
    expect(blockedReason(`${STAGING}/auth/v1/user`)).toMatch(/Supabase API path/);
    expect(blockedReason('https://api.anthropic.com/v1/messages')).toMatch(/not loopback/);
    expect(blockedReason('wss://qmnssrrolpinvwjjnufo.supabase.co/realtime/v1/websocket')).toMatch(/Supabase API path/);
  });

  it('blocks a Supabase API path on loopback too: the local stack is not a unit-test dependency', () => {
    expect(blockedReason(`${TEST_SUPABASE_URL}/rest/v1/golf_rounds`)).toMatch(/Supabase API path/);
    expect(blockedReason('http://localhost:54321/storage/v1/object/avatars/a.png')).toMatch(/Supabase API path/);
  });

  it('leaves loopback servers, relative URLs on a loopback page and non-network schemes alone', () => {
    expect(blockedReason('http://127.0.0.1:4010/health')).toBeNull();
    expect(blockedReason('http://localhost:3000/api/x')).toBeNull();
    expect(blockedReason('/api/golf/rounds', 'http://localhost:3000/')).toBeNull();
    expect(blockedReason('data:text/plain,hello')).toBeNull();
    expect(blockedReason('not a url')).toBeNull();
  });
});

describe('fetch, WebSocket and XMLHttpRequest', () => {
  it('refuse production with an error that says how to fix the test', async () => {
    const call = fetch(`${PROD}/rest/v1/golf_rounds?player_id=eq.player-1`);
    await expect(call).rejects.toBeInstanceOf(NetworkCallInTestError);
    await expect(fetch(`${PROD}/rest/v1/golf_round_live_prefs`)).rejects.toThrow(/vi\.mock\('@\/lib\/supabase\/client'\)/);
    await expect(fetch(new Request('https://example.com/'))).rejects.toBeInstanceOf(NetworkCallInTestError);
  });

  it('refuse a realtime socket and an XHR to a hosted project', () => {
    expect(() => new WebSocket('wss://qmnssrrolpinvwjjnufo.supabase.co/realtime/v1/websocket')).toThrow(
      NetworkCallInTestError,
    );
    const xhr = new XMLHttpRequest();
    expect(() => xhr.open('GET', `${PROD}/rest/v1/golf_round_live`)).toThrow(NetworkCallInTestError);
  });

  it('sit under a test stub and come back when it is removed', async () => {
    const stub = vi.fn(async () => new Response('stubbed'));
    vi.stubGlobal('fetch', stub);
    await expect((await fetch(`${PROD}/rest/v1/x`)).text()).resolves.toBe('stubbed');
    vi.unstubAllGlobals();
    await expect(fetch(`${PROD}/rest/v1/x`)).rejects.toBeInstanceOf(NetworkCallInTestError);
  });
});

describe('raw sockets, for SDKs that skip fetch', () => {
  let server: http.Server;
  let port = 0;
  beforeAll(async () => {
    server = http.createServer((_req, res) => res.end('local'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('refuse a TCP or TLS connection to a host that is not loopback', async () => {
    await expect(socketOutcome(net.connect({ host: '203.0.113.7', port: 443 }))).resolves.toBeInstanceOf(
      NetworkCallInTestError,
    );
    const viaHttps = await new Promise((resolve) => {
      https.get('https://qmnssrrolpinvwjjnufo.supabase.co/rest/v1/golf_rounds', () => resolve('answered')).on(
        'error',
        resolve,
      );
    });
    expect(viaHttps).toBeInstanceOf(NetworkCallInTestError);
  });

  it('still reach a server the test started on loopback', async () => {
    await expect(socketOutcome(net.connect({ host: '127.0.0.1', port }))).resolves.toBe('connected');
    const body = await new Promise<string>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/`, (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => resolve(text));
      }).on('error', reject);
    });
    expect(body).toBe('local');
    await expect((await fetch(`http://127.0.0.1:${port}/`)).text()).resolves.toBe('local');
  });
});

describe('the browser Supabase client every test gets', () => {
  it('builds, and throws on the first call with the call named', () => {
    const client = createClient() as unknown as {
      from: (t: string) => unknown;
      auth: { getUser: () => unknown };
      channel: (n: string) => unknown;
    };
    expect(() => client.from('golf_round_live')).toThrow(/supabase\.from\(\)/);
    expect(() => client.auth.getUser()).toThrow(/supabase\.auth\.getUser\(\)/);
    expect(() => client.channel('live')).toThrow(NetworkCallInTestError);
  });

  it('is not a thenable, so awaiting it or passing it around is inert', async () => {
    const client = createOfflineSupabaseClient();
    await expect(Promise.resolve(client)).resolves.toBe(client);
  });

  it('lets the share ports fail the way a failed read does: no value, one report, nothing sent', async () => {
    reports.length = 0;
    await expect(browserSharePorts.loadPrefs()).resolves.toBeNull();
    await expect(browserSharePorts.loadRoundShare('round-1', 'practice')).resolves.toBeNull();
    expect(reports).toHaveLength(2);
    for (const error of reports) expect(error).toBeInstanceOf(NetworkCallInTestError);
  });

  it('keeps the real module around it (timeoutForRequest is not mocked)', async () => {
    const { timeoutForRequest } = await import('@/lib/supabase/client');
    expect(timeoutForRequest(`${PROD}/storage/v1/object/a.png`)).toBeGreaterThan(10_000);
  });
});
