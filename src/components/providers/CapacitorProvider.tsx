'use client';

import { useEffect } from 'react';
import { initCapacitor } from '@/lib/utils/capacitor';

export function CapacitorProvider() {
  useEffect(() => {
    initCapacitor();
  }, []);
  return null;
}
