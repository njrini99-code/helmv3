'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

let initialized = false;

function initPostHog(): boolean {
  if (initialized) return true;
  if (typeof window === 'undefined') return false;
  if (LOCAL_HOSTNAMES.has(window.location.hostname)) return false;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return false;

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
  posthog.init(key, {
    api_host: host,
    capture_pageview: false, // we emit pageviews manually on route change
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
  });
  initialized = true;
  return true;
}

/**
 * Inner component that uses useSearchParams — must live inside a <Suspense>
 * boundary (Next.js App Router requirement for root-layout usage).
 */
function PostHogPageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ready = useRef(false);

  useEffect(() => {
    // Initialise once on mount (no-op if key absent or on localhost)
    ready.current = initPostHog();
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    // Capture pageview on every route change (App Router does not auto-fire it)
    const qs = searchParams.toString();
    const url = pathname + (qs ? `?${qs}` : '');
    posthog.capture('$pageview', { $current_url: window.location.origin + url });
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
