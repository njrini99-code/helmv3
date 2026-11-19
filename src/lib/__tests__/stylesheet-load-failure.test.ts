// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stylesheetLoadFailureHref } from '@/lib/stylesheet-load-failure';

function errorFrom(el: Element): Event {
  const e = new Event('error');
  el.addEventListener('error', () => undefined);
  el.dispatchEvent(e);
  return e;
}

function sheetLink(href = '/_next/static/chunks/a.css'): HTMLLinkElement {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.setAttribute('href', href);
  document.head.appendChild(link);
  return link;
}

describe('stylesheetLoadFailureHref', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('names the sheet when a stylesheet link rejects with its error Event', () => {
    const href = stylesheetLoadFailureHref(errorFrom(sheetLink()));
    expect(href).toMatch(/\/_next\/static\/chunks\/a\.css$/);
  });

  it('leaves every other rejection alone', () => {
    const img = document.createElement('img');
    const script = document.createElement('script');
    const preload = document.createElement('link');
    preload.rel = 'preload';
    expect(stylesheetLoadFailureHref(errorFrom(img))).toBeNull();
    expect(stylesheetLoadFailureHref(errorFrom(script))).toBeNull();
    expect(stylesheetLoadFailureHref(errorFrom(preload))).toBeNull();
    expect(stylesheetLoadFailureHref(new Error('boom'))).toBeNull();
    expect(stylesheetLoadFailureHref('[object Event]')).toBeNull();
    expect(stylesheetLoadFailureHref(undefined)).toBeNull();
    // A stylesheet's load event is not a failure.
    const load = new Event('load');
    sheetLink().dispatchEvent(load);
    expect(stylesheetLoadFailureHref(load)).toBeNull();
  });
});

describe('setupGlobalErrorHandlers: a stylesheet rejection', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.head.innerHTML = '';
  });

  function reject(reason: unknown): Event {
    const event = new Event('unhandledrejection', { cancelable: true });
    Object.defineProperty(event, 'reason', { value: reason });
    window.dispatchEvent(event);
    return event;
  }

  it('is handled, so the browser reports no opaque "[object Event]"', async () => {
    const logging = await import('@/lib/error-logging');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logging.setupGlobalErrorHandlers();
    const event = reject(errorFrom(sheetLink('/_next/static/chunks/hub.css')));
    expect(event.defaultPrevented).toBe(true);
    spy.mockRestore();
  });

  it('does not take any other rejection', async () => {
    const logging = await import('@/lib/error-logging');
    logging.setupGlobalErrorHandlers();
    const img = document.createElement('img');
    expect(reject(errorFrom(img)).defaultPrevented).toBe(false);
    expect(reject(new Error('real failure')).defaultPrevented).toBe(false);
  });
});
