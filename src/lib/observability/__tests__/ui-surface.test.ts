import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  scopeData: {} as Record<string, unknown>,
  throwOnRead: false,
}));

vi.mock('@sentry/nextjs', () => ({
  getIsolationScope: () => ({
    getScopeData: () => {
      if (mocks.throwOnRead) throw new Error('no scope');
      return mocks.scopeData;
    },
  }),
}));

import { ambientIsBackgroundWork, ambientUiSurface, isClubhousePath, uiSurfaceForPath, uiSurfaceForRequest } from '@/lib/observability/ui-surface';

describe('isClubhousePath', () => {
  it.each([
    '/golf',
    '/golf/dashboard',
    '/golf/dashboard/rounds/abc',
    '/golf/login',
    '/golf/coach',
    '/golf/join/XYZ',
    '/golf/staff/join/abc',
    'https://helm.example/golf/dashboard/coachhelm?x=1',
  ])('answers yes for a Clubhouse address: %s', (path) => {
    expect(isClubhousePath(path)).toBe(true);
  });

  it.each([
    '/golf/admin',
    '/golf/admin/crm',
    '/golfer',
    '/admin/errors',
    '/baseball/dashboard',
    '/lifting',
    '/api/cron/event-reminders',
    '/clubhouse-preview',
    '',
    null,
    undefined,
  ])('answers no for anything else: %s', (path) => {
    expect(isClubhousePath(path as string | null | undefined)).toBe(false);
  });

  it('maps to the tag value', () => {
    expect(uiSurfaceForPath('/golf/dashboard')).toBe('clubhouse');
    expect(uiSurfaceForPath('/admin')).toBeNull();
  });
});

describe('uiSurfaceForRequest', () => {
  it('tags a server action by the page it posted to', () => {
    expect(uiSurfaceForRequest({ url: 'https://helm.example/golf/dashboard/rounds/new' })).toBe('clubhouse');
  });

  it('tags an API route by the Clubhouse page that called it', () => {
    expect(
      uiSurfaceForRequest({ url: '/api/coachhelm/v3/chat/stream', referer: 'https://helm.example/golf/dashboard/coachhelm' }),
    ).toBe('clubhouse');
    expect(uiSurfaceForRequest({ url: '/api/x', referer: ['https://helm.example/golf/login'] })).toBe('clubhouse');
  });

  it('leaves a cron, a webhook or an API call from elsewhere untagged', () => {
    expect(uiSurfaceForRequest({ url: '/api/cron/admin-digest' })).toBeNull();
    expect(uiSurfaceForRequest({ url: '/api/x', referer: 'https://helm.example/baseball/dashboard' })).toBeNull();
  });

  it('never reads the Referer of a page request, so an admin page opened from Clubhouse stays untagged', () => {
    expect(uiSurfaceForRequest({ url: '/admin/errors', referer: 'https://helm.example/golf/dashboard' })).toBeNull();
  });
});

describe('ambientUiSurface', () => {
  beforeEach(() => {
    mocks.scopeData = {};
    mocks.throwOnRead = false;
  });

  it('reads the ui tag gate.ts sets on a Clubhouse render', () => {
    mocks.scopeData = { tags: { ui: 'clubhouse' } };
    expect(ambientUiSurface()).toBe('clubhouse');
  });

  it("falls back to the request Sentry recorded for the isolation scope", () => {
    mocks.scopeData = {
      tags: {},
      sdkProcessingMetadata: {
        normalizedRequest: { url: 'https://helm.example/api/upload', headers: { referer: 'https://helm.example/golf/dashboard/messages' } },
      },
    };
    expect(ambientUiSurface()).toBe('clubhouse');
  });

  it('answers null with no request and never throws', () => {
    expect(ambientUiSurface()).toBeNull();
    mocks.throwOnRead = true;
    expect(ambientUiSurface()).toBeNull();
  });
});

describe('ambientIsBackgroundWork', () => {
  const at = (url: string) => ({ tags: {}, sdkProcessingMetadata: { normalizedRequest: { url, headers: {} } } });
  beforeEach(() => {
    mocks.scopeData = {};
    mocks.throwOnRead = false;
  });

  it.each(['https://helm.example/api/cron/admin-digest', 'https://helm.example/api/jobs/consume', 'https://helm.example/api/webhooks/stripe?x=1', 'https://helm.example/api/cron'])(
    'answers yes for a cron, the job queue or a webhook: %s',
    (url) => {
      mocks.scopeData = at(url);
      expect(ambientIsBackgroundWork()).toBe(true);
    },
  );

  it('answers yes when no request was recorded (work outside a request)', () => {
    expect(ambientIsBackgroundWork()).toBe(true);
  });

  it.each(['https://helm.example/golf/dashboard', 'https://helm.example/admin/golf', 'https://helm.example/api/upload', 'https://helm.example/api/cronjobs'])(
    'answers no for a page or any other route: %s',
    (url) => {
      mocks.scopeData = at(url);
      expect(ambientIsBackgroundWork()).toBe(false);
    },
  );

  it('answers no when the scope cannot be read', () => {
    mocks.throwOnRead = true;
    expect(ambientIsBackgroundWork()).toBe(false);
  });
});
