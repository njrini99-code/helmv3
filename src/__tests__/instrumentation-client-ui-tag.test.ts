// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The browser's `ui` tag on Sentry events. The Bridge's Clubhouse-only Sentry views search `ui:clubhouse`
 * (src/lib/admin/bridge-scope.ts). The Clubhouse frame tags the session once it mounts (chTagSession), so beforeSend
 * fills the tag from the page address for an error raised before that, or one that takes the frame down.
 */
const initMock = vi.fn();
// This file runs in jsdom, so instrumentation-client builds its browser integrations list (`typeof window !==
// 'undefined'`). Every factory that list calls needs a stub here; the node-environment privacy sentinel test never
// reaches that branch, which is why its mock is shorter.
vi.mock('@sentry/nextjs', () => ({
  init: initMock,
  dedupeIntegration: () => ({ name: 'Dedupe' }),
  replayIntegration: () => ({ name: 'Replay' }),
  browserTracingIntegration: () => ({ name: 'BrowserTracing' }),
  browserProfilingIntegration: () => ({ name: 'BrowserProfiling' }),
  browserSessionIntegration: () => ({ name: 'BrowserSession' }),
  httpClientIntegration: () => ({ name: 'HttpClient' }),
  reportingObserverIntegration: () => ({ name: 'ReportingObserver' }),
  consoleLoggingIntegration: () => ({ name: 'ConsoleLogging' }),
  captureConsoleIntegration: () => ({ name: 'CaptureConsole' }),
  thirdPartyErrorFilterIntegration: () => ({ name: 'ThirdPartyErrorsFilter' }),
  feedbackIntegration: () => ({ name: 'Feedback' }),
  captureRouterTransitionStart: vi.fn(),
}));
vi.mock('@supabase/supabase-js/tracing', () => ({}));

type BeforeSend = (event: Record<string, unknown>, hint?: unknown) => { tags?: Record<string, unknown> } | null;

async function loadBeforeSend(): Promise<BeforeSend> {
  vi.resetModules();
  initMock.mockClear();
  await import('@/instrumentation-client');
  const options = (initMock.mock.calls.at(-1)?.[0] ?? {}) as { beforeSend?: BeforeSend };
  return options.beforeSend!;
}

function errorEvent(tags?: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(tags ? { tags } : {}),
    exception: {
      values: [{ type: 'Error', value: 'boom', stacktrace: { frames: [{ filename: '../src/clubhouse/x.tsx', function: 'f' }] } }],
    },
  };
}

describe('instrumentation-client beforeSend: ui tag', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.pushState({}, '', '/');
  });

  it('tags an untagged error on a Clubhouse page ui=clubhouse', async () => {
    window.history.pushState({}, '', '/golf/dashboard/rounds');
    const beforeSend = await loadBeforeSend();
    expect(beforeSend(errorEvent(), {})?.tags?.ui).toBe('clubhouse');
  });

  it('leaves the golf admin pages untagged, as /api/log-error does', async () => {
    window.history.pushState({}, '', '/golf/admin/teams');
    const beforeSend = await loadBeforeSend();
    expect(beforeSend(errorEvent(), {})?.tags?.ui).toBeUndefined();
  });

  it('leaves pages outside Clubhouse untagged', async () => {
    window.history.pushState({}, '', '/baseball/dashboard');
    const beforeSend = await loadBeforeSend();
    expect(beforeSend(errorEvent(), {})?.tags?.ui).toBeUndefined();
  });

  it('keeps a ui tag the event already carries', async () => {
    window.history.pushState({}, '', '/golf/dashboard');
    const beforeSend = await loadBeforeSend();
    expect(beforeSend(errorEvent({ ui: 'other' }), {})?.tags?.ui).toBe('other');
  });
});
