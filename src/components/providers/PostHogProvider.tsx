'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { PostHog } from 'posthog-js';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/** What the loader needs to know about where it runs. */
export interface PostHogLoaderEnv {
  hostname: string;
  key: string | undefined;
  host: string;
}

/**
 * A loader for posthog-js that fetches the library on first use and initialises it once.
 *
 * posthog-js used to be a static import here and in DemoEnterTracker. That put about 105 KB gzipped
 * in the JavaScript every route loads before its first paint (production audit 2026-11-15, MAC-11;
 * the largest chunk of the 846 KB every Clubhouse route shared). Nothing on screen needs it, so it now
 * loads after hydration, the first time an event is captured. Every capture waits on the same promise,
 * so events keep their order.
 *
 * Resolves to null when PostHog is off: on localhost (no analytics from local development) or with no
 * key (previews and CI). In those cases posthog-js is never fetched.
 */
export function createPostHogLoader(
  env: PostHogLoaderEnv,
  importer: () => Promise<{ default: PostHog }> = () => import('posthog-js'),
): () => Promise<PostHog | null> {
  let loading: Promise<PostHog | null> | null = null;
  return () => {
    if (loading) return loading;
    const key = env.key;
    if (LOCAL_HOSTNAMES.has(env.hostname) || !key) {
      loading = Promise.resolve(null);
      return loading;
    }
    loading = importer().then(
      ({ default: posthog }) => {
        posthog.init(key, {
          api_host: env.host,
          capture_pageview: false, // we emit pageviews manually on route change
          capture_pageleave: true,
          persistence: 'localStorage+cookie',
        });
        return posthog;
      },
      // A chunk that failed to load is analytics lost, never an error on the page.
      () => null,
    );
    return loading;
  };
}

let browserLoader: (() => Promise<PostHog | null>) | null = null;

/** PostHog for this browser tab, loaded and initialised on first use; null when it is off or on the server. */
export function loadPostHog(): Promise<PostHog | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  browserLoader ??= createPostHogLoader({
    hostname: window.location.hostname,
    key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  });
  return browserLoader();
}

/**
 * Inner component that uses useSearchParams — must live inside a <Suspense>
 * boundary (Next.js App Router requirement for root-layout usage).
 */
function PostHogPageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Capture pageview on every route change (App Router does not auto-fire it).
    // The first call loads and initialises PostHog (nothing on localhost or without a key).
    const qs = searchParams.toString();
    const url = window.location.origin + pathname + (qs ? `?${qs}` : '');
    void loadPostHog().then((posthog) => posthog?.capture('$pageview', { $current_url: url }));
  }, [pathname, searchParams]);

  return null;
}

/**
 * Mounts PostHog and captures App Router pageview events on every route change.
 *
 * Guard rules (mirrors VercelAnalyticsProvider / DatadogProvider pattern):
 *   - No-ops entirely when NEXT_PUBLIC_POSTHOG_KEY is absent.
 *   - No-ops on localhost / 127.0.0.1 / ::1 to avoid polluting analytics
 *     during local development.
 *   - Safe to render even before the key is set (preview / CI environments).
 *
 * Wraps the inner tracker in Suspense because useSearchParams() requires it
 * when used outside of a page's own Suspense boundary (Next.js App Router rule).
 */
export function PostHogProvider() {
  return (
    <Suspense fallback={null}>
      <PostHogPageviewTracker />
    </Suspense>
  );
}
