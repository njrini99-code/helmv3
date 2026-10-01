'use client';

import { createContext, createElement, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

/** The phone layout's width, the same breakpoint as `@media (max-width: 820px)` in the stylesheets. */
export const CH_PHONE_QUERY = '(max-width: 820px)';

/**
 * The cookie that tells the server which layout this device last drew, so a
 * cold load (sign-in landing, refresh, opening the app) renders the phone
 * structure from the first frame instead of a hidden desktop page until
 * hydration (swap audit F-36). Not personal data: "1" or "0".
 */
export const CH_PHONE_COOKIE = 'ch_phone';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(CH_PHONE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

const PhoneHint = createContext(false);

/**
 * Supplies the server's guess (from the cookie) as the hydration snapshot, and
 * keeps the cookie current with the real width. The guess and the hydration
 * frame agree, so there is no mismatch; a wrong guess (a resized window)
 * corrects itself right after hydration, as it did before.
 */
export function ChPhoneHintProvider({ phone, children }: { phone: boolean; children: ReactNode }) {
  useEffect(() => rememberLayout(), []);
  return createElement(PhoneHint.Provider, { value: phone }, children);
}

/** Records the current layout in the cookie; also refreshed when the width crosses the breakpoint. */
export function rememberLayout(): () => void {
  const mql = window.matchMedia(CH_PHONE_QUERY);
  const write = () => {
    document.cookie = `${CH_PHONE_COOKIE}=${mql.matches ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
  };
  write();
  mql.addEventListener('change', write);
  return () => mql.removeEventListener('change', write);
}

/**
 * True at phone width, for a page whose phone structure differs from desktop
 * (a sheet instead of a panel). Layout-only differences stay in CSS. The
 * server snapshot is the device's last layout (ChPhoneHintProvider), desktop
 * when unknown.
 */
export function useChPhone(): boolean {
  const hint = useContext(PhoneHint);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(CH_PHONE_QUERY).matches,
    () => hint,
  );
}
