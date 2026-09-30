'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';
import { NotificationBadgeProvider } from '@/contexts/notification-badge-context';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { NativeSwipeBackBridge } from '@/components/golf/NativeSwipeBackBridge';
import type { ChShellData } from '../data/shell';
import { ClubhouseFrame } from './ClubhouseFrame';

/**
 * The live Clubhouse shell: the non-UI providers pages rely on (golf user,
 * badges, session activity, and the iOS swipe-back guard that stops an edge
 * swipe while a sheet or dialog is open) around the Clubhouse frame. None of
 * Fairway's UI.
 */
export function ClubhouseShell({ userData, shell, children }: { userData: GolfUserData; shell: ChShellData; children: ReactNode }) {
  const pathname = usePathname() ?? '/golf/dashboard';
  return (
    <SessionActivityProvider>
      <NativeSwipeBackBridge />
      <GolfUserProvider userData={userData}>
        <NotificationBadgeProvider>
          <ClubhouseFrame userData={userData} shell={shell} pathname={pathname}>
            {children}
          </ClubhouseFrame>
        </NotificationBadgeProvider>
      </GolfUserProvider>
    </SessionActivityProvider>
  );
}
