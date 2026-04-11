'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNativeApp } from '@/lib/utils/capacitor';

/**
 * Client-side guard that redirects away from the admin panel when the app
 * is running inside the native iOS Capacitor shell.
 *
 * Rationale:
 *   The admin CRM is a desktop-first tool with web-style interactions
 *   (window.open to Gmail, external sales links, dense tables). Apple
 *   reviewers should never see it inside the native app, since it could
 *   trigger a Guideline 4.2.2 "repackaged website" flag.
 *
 * Usage: mount this at the top of any admin layout. It renders nothing
 * on web. On native, it redirects to the golf dashboard on mount.
 */
export function AdminNativeGuard() {
  const router = useRouter();

  useEffect(() => {
    if (isNativeApp()) {
      router.replace('/golf/dashboard');
    }
  }, [router]);

  return null;
}
