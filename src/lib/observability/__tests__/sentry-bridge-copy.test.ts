import { describe, expect, it } from 'vitest';
import type { ErrorEvent, EventHint } from '@sentry/nextjs';
import { bridgeCopyOf } from '@/lib/observability/sentry-bridge-copy';
import { markBridgeLogged } from '@/lib/bridge-logged-marker';

const ORIGIN = 'https://helmsportslabs.com';

const FRAMES = [
  { filename: 'app:///_next/static/chunks/main.js', function: 'boot', lineno: 1, colno: 10 },
  { filename: 'app:///_next/static/chunks/page.js', function: 'loadRounds', lineno: 42, colno: 7 },
];

function consoleEvent(message: string, overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    type: undefined,
    event_id: 'evt-console-1',
    environment: 'production',
    level: 'error',
    logger: 'console',
    exception: {
      values: [{ type: 'Error', value: message, stacktrace: { frames: FRAMES }, mechanism: { type: 'auto.core.capture_console', handled: true } }],
    },
    ...overrides,
  };
}

function failedRequestEvent(url: string, status: number, method = 'GET'): ErrorEvent {
  return {
    type: undefined,
    event_id: 'evt-http-1',
    environment: 'production',
    message: `HTTP Client Error with status code: ${status}`,
    exception: {
      values: [{ type: 'Error', value: `HTTP Client Error with status code: ${status}`, mechanism: { type: 'auto.http.client.fetch', handled: false } }],
    },
    request: { url, method },
    contexts: { response: { status_code: status } },
  };
}

function uncaughtEvent(type: string): ErrorEvent {
  return {
    type: undefined,
    environment: 'production',
    level: 'error',
    exception: { values: [{ type: 'TypeError', value: 'x is undefined', mechanism: { type, handled: false } }] },
  };
}

describe('bridgeCopyOf: what Sentry caught by itself and the Bridge did not', () => {
  it('copies a production console.error, named by its message, with the frames as a stack', () => {
    const copy = bridgeCopyOf(consoleEvent('Could not load the rounds'), { originalException: 'Could not load the rounds' }, ORIGIN);
    expect(copy).not.toBeNull();
    expect(copy!.error.message).toBe('Could not load the rounds');
    expect(copy!.error.stack).toBe(
      [
        'Error: Could not load the rounds',
        '    at loadRounds (app:///_next/static/chunks/page.js:42:7)',
        '    at boot (app:///_next/static/chunks/main.js:1:10)',
      ].join('\n'),
    );
    expect(copy!.severity).toBe('medium');
    expect(copy!.context).toEqual({ component: 'SentryCapture', action: 'console', capturedBy: 'console', sentryEventId: 'evt-console-1' });
  });

  it('copies the Error itself when console.error was given one, so its own stack is kept', () => {
    const original = new Error('Hydration failed');
    const copy = bridgeCopyOf(consoleEvent('Hydration failed'), { originalException: original }, ORIGIN);
    expect(copy!.error).toBe(original);
  });

  it('names a failed request by its status, method and path on this site, without its query', () => {
    const copy = bridgeCopyOf(failedRequestEvent(`${ORIGIN}/api/golf/rounds?token=secret#x`, 503, 'POST'), {}, ORIGIN);
    expect(copy!.error.message).toBe('Request failed (503): POST /api/golf/rounds');
    expect(copy!.context.capturedBy).toBe('failed-request');
    expect(copy!.context.request).toEqual({ method: 'POST', status: 503, target: '/api/golf/rounds' });
    expect(JSON.stringify(copy)).not.toContain('secret');
  });

  it('names a failed request to another service by its host and path', () => {
    const copy = bridgeCopyOf(failedRequestEvent('https://abc.supabase.co/rest/v1/rounds?select=*', 500), {}, ORIGIN);
    expect(copy!.error.message).toBe('Request failed (500): GET abc.supabase.co/rest/v1/rounds');
  });

  it('writes ids in a request path as :id, so one endpoint is one incident however many records failed', () => {
    const first = bridgeCopyOf(failedRequestEvent(`${ORIGIN}/api/golf/rounds/123/shots`, 500), {}, ORIGIN);
    const second = bridgeCopyOf(failedRequestEvent(`${ORIGIN}/api/golf/rounds/456/shots`, 500), {}, ORIGIN);
    const storage = bridgeCopyOf(
      failedRequestEvent('https://abc.supabase.co/storage/v1/object/avatars/3f2b8c1e-9d4a-4b6e-8f10-2a7c5e9b1d03/face.png', 404),
      {},
      ORIGIN,
    );
    expect(first!.error.message).toBe('Request failed (500): GET /api/golf/rounds/:id/shots');
    expect(second!.error.message).toBe(first!.error.message);
    expect(storage!.context.request?.target).toBe('abc.supabase.co/storage/v1/object/avatars/:id/face.png');
  });

  it('copies an SDK capture that is neither console nor request as an sdk capture', () => {
    const original = new Error('JWT expired');
    const event: ErrorEvent = {
      type: undefined,
      environment: 'production',
      exception: { values: [{ type: 'Error', value: 'JWT expired', mechanism: { type: 'generic', handled: true } }] },
    };
    const copy = bridgeCopyOf(event, { originalException: original }, ORIGIN);
    expect(copy!.error).toBe(original);
    expect(copy!.context.capturedBy).toBe('sdk');
  });

  it('copies a fatal event as critical', () => {
    expect(bridgeCopyOf(consoleEvent('boom', { level: 'fatal' }), {}, ORIGIN)!.severity).toBe('critical');
  });
});

describe('bridgeCopyOf: what it leaves alone', () => {
  it('outside production, where the Bridge stores nothing', () => {
    expect(bridgeCopyOf(consoleEvent('x', { environment: 'preview' }), {}, ORIGIN)).toBeNull();
    expect(bridgeCopyOf(consoleEvent('x', { environment: 'development' }), {}, ORIGIN)).toBeNull();
    expect(bridgeCopyOf(consoleEvent('x', { environment: undefined }), {}, ORIGIN)).toBeNull();
  });

  it('a warning or a notice, such as a browser deprecation report', () => {
    expect(bridgeCopyOf(consoleEvent('x', { level: 'warning' }), {}, ORIGIN)).toBeNull();
    const deprecation: ErrorEvent = { type: undefined, environment: 'production', level: 'info', message: 'Deprecation: unload is deprecated' };
    expect(bridgeCopyOf(deprecation, {}, ORIGIN)).toBeNull();
  });

  it('an error logError already wrote', () => {
    const original = new Error('already written');
    markBridgeLogged(original);
    expect(bridgeCopyOf(consoleEvent('already written'), { originalException: original }, ORIGIN)).toBeNull();
  });

  it("an error the page did not catch, which the Bridge's window handlers write", () => {
    for (const type of ['auto.browser.global_handlers.onerror', 'auto.browser.global_handlers.onunhandledrejection', 'onerror', 'onunhandledrejection']) {
      expect(bridgeCopyOf(uncaughtEvent(type), {}, ORIGIN)).toBeNull();
    }
  });

  it("the Bridge's own reporting failing, which would loop", () => {
    expect(bridgeCopyOf(failedRequestEvent(`${ORIGIN}/api/log-error`, 500, 'POST'), {}, ORIGIN)).toBeNull();
    expect(bridgeCopyOf(failedRequestEvent('/api/log-error', 429, 'POST'), {}, ORIGIN)).toBeNull();
    const deliveryFailure = consoleEvent('[error-logging] failed to deliver error report to /api/log-error');
    expect(bridgeCopyOf(deliveryFailure, {}, ORIGIN)).toBeNull();
  });

  it('never throws on an event with nothing in it', () => {
    const bare: ErrorEvent = { type: undefined, environment: 'production' };
    const hint: EventHint = {};
    expect(bridgeCopyOf(bare, hint, ORIGIN)!.error.message).toBe('Unknown error');
  });
});
