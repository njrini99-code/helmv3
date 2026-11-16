import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { PostHog } from 'posthog-js';
import { createPostHogLoader } from '../PostHogProvider';

/**
 * MAC-11 (production audit 2026-11-15): posthog-js was a static import in the root layout's PostHogProvider and in the
 * dashboard's DemoEnterTracker, so its ~105 KB gzipped chunk was in every route's first-load JavaScript. It now loads on
 * first use. These pin that nothing imports it statically and that the loader keeps the old guards and event order.
 */

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function fakePostHog() {
  const events: string[] = [];
  const posthog = {
    init: vi.fn(),
    capture: vi.fn((name: string) => {
      events.push(name);
    }),
  };
  return { posthog: posthog as unknown as PostHog & typeof posthog, events };
}

describe('posthog-js is never in the first-load JavaScript', () => {
  it.each(['src/components/providers/PostHogProvider.tsx', 'src/components/demo/DemoEnterTracker.tsx'])('%s has no static import of posthog-js', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+['"]posthog-js['"]/m);
  });

  it('the provider fetches it with a dynamic import', () => {
    expect(read('src/components/providers/PostHogProvider.tsx')).toContain("import('posthog-js')");
  });
});

describe('createPostHogLoader', () => {
  it('on localhost it resolves null and never fetches posthog-js', async () => {
    const importer = vi.fn();
    const load = createPostHogLoader({ hostname: 'localhost', key: 'phc_x', host: 'https://us.i.posthog.com' }, importer);
    await expect(load()).resolves.toBeNull();
    expect(importer).not.toHaveBeenCalled();
  });

  it('without a key it resolves null and never fetches posthog-js', async () => {
    const importer = vi.fn();
    const load = createPostHogLoader({ hostname: 'app.example.test', key: undefined, host: 'https://us.i.posthog.com' }, importer);
    await expect(load()).resolves.toBeNull();
    expect(importer).not.toHaveBeenCalled();
  });

  it('fetches and initialises once, with the same options as before, however many events ask', async () => {
    const { posthog } = fakePostHog();
    const importer = vi.fn(async () => ({ default: posthog }));
    const load = createPostHogLoader({ hostname: 'app.example.test', key: 'phc_x', host: 'https://us.i.posthog.com' }, importer);
    const [a, b] = await Promise.all([load(), load()]);
    expect(a).toBe(posthog);
    expect(b).toBe(posthog);
    expect(importer).toHaveBeenCalledTimes(1);
    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.init).toHaveBeenCalledWith('phc_x', {
      api_host: 'https://us.i.posthog.com',
      capture_pageview: false,
      capture_pageleave: true,
      persistence: 'localStorage+cookie',
    });
  });

  it('events captured before the library has arrived keep their order', async () => {
    const { posthog, events } = fakePostHog();
    let arrive: (m: { default: PostHog }) => void = () => {};
    const load = createPostHogLoader({ hostname: 'app.example.test', key: 'phc_x', host: 'https://us.i.posthog.com' }, () => new Promise((r) => (arrive = r)));
    const first = load().then((p) => p?.capture('demo_enter'));
    const second = load().then((p) => p?.capture('$pageview'));
    arrive({ default: posthog });
    await Promise.all([first, second]);
    expect(events).toEqual(['demo_enter', '$pageview']);
  });

  it('a chunk that fails to load is analytics lost, not an error', async () => {
    const load = createPostHogLoader({ hostname: 'app.example.test', key: 'phc_x', host: 'https://us.i.posthog.com' }, () => Promise.reject(new Error('ChunkLoadError')));
    await expect(load()).resolves.toBeNull();
  });
});
