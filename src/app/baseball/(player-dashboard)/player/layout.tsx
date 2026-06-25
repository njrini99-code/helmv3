'use client';

import { BaseballShellLayout } from '@/components/baseball/BaseballShellLayout';

export default function PlayerDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/*
       * React 19 / Next.js 16 hoist <link> tags to <head> automatically when
       * rendered anywhere in the tree. This scopes the BaseballHelm PWA manifest
       * to the player dashboard route group so the browser install prompt
       * (start_url: /baseball/player/today) is available for player sessions.
       */}
      <link rel="manifest" href="/baseball-manifest.webmanifest" />
      <BaseballShellLayout requiredRole="player">{children}</BaseballShellLayout>
    </>
  );
}
