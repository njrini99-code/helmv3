'use client';

import { useEffect } from 'react';
import { initDatadog } from '@/lib/datadog';

export function DatadogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initDatadog();
  }, []);

  return <>{children}</>;
}
