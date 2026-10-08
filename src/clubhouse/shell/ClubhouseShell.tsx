"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import {
  GolfUserProvider,
  type GolfUserData,
} from "@/contexts/golf-user-context";
import { NotificationBadgeProvider } from "@/contexts/notification-badge-context";
import { SessionActivityProvider } from "@/components/providers/SessionActivityProvider";
import { NativeSwipeBackBridge } from "@/components/golf/NativeSwipeBackBridge";
import { ThemeApplier } from "@/components/golf/theme/ThemeApplier";
import type { ChShellData } from "../data/shell";
import { ClubhouseFrame } from "./ClubhouseFrame";
import { OfflineSync } from "./OfflineSync";
import { ChPhoneHintProvider } from "../lib/use-phone";

/**
 * The live Clubhouse shell: the non-UI providers pages rely on (golf user,
 * badges, session activity, and the iOS swipe-back guard that stops an edge
 * swipe while a sheet or dialog is open) around the Clubhouse frame. None of
 * Fairway's UI. ThemeApplier keeps the GolfHelm theme (light, dark or the
 * system's) live on <html>, which the Clubhouse dark tokens key off.
 */
export function ClubhouseShell({
  userData,
  shell,
  phone = false,
  children,
}: {
  userData: GolfUserData;
  shell: ChShellData;
  /** The device's last layout from the server's cookie, so a cold phone load draws the phone structure first (F-36). */
  phone?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/golf/dashboard";
  // The query decides a few phone bars (a Settings section, a coach's player on Stats; CH-1402). The dashboard is
  // rendered per request, so this reads the request's query on the server too.
  const search = useSearchParams()?.toString() ?? "";
  return (
    <ChPhoneHintProvider phone={phone}>
      <SessionActivityProvider>
        <NativeSwipeBackBridge />
        <ThemeApplier />
        <OfflineSync />
        <GolfUserProvider userData={userData}>
          <NotificationBadgeProvider>
            <ClubhouseFrame
              userData={userData}
              shell={shell}
              pathname={pathname}
              search={search}
            >
              {children}
            </ClubhouseFrame>
          </NotificationBadgeProvider>
        </GolfUserProvider>
      </SessionActivityProvider>
    </ChPhoneHintProvider>
  );
}
