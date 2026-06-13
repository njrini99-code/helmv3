'use client';

import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export function VercelAnalyticsProvider() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(!LOCAL_HOSTNAMES.has(window.location.hostname));
  }, []);

  // Both no-op until the matching product is enabled in the Vercel dashboard
  // (Web Analytics + Speed Insights); gated off localhost to avoid dev noise.
  return enabled ? (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  ) : null;
}
