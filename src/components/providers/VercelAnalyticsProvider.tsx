'use client';

import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/next';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export function VercelAnalyticsProvider() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(!LOCAL_HOSTNAMES.has(window.location.hostname));
  }, []);

  return enabled ? <Analytics /> : null;
}
