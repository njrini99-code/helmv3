'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNativeApp } from '@/lib/utils/capacitor';

export function NativeRedirect({ to }: { to: string }) {
  const router = useRouter();

  useEffect(() => {
    if (isNativeApp()) {
      router.replace(to);
    }
  }, [router, to]);

  return null;
}
