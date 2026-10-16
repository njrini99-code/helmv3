'use client';

import { useEffect } from 'react';
import { isNativeApp, pinKeyboardAccessoryBar } from '@/lib/utils/capacitor';

/**
 * A Done key over every keyboard while a round is being entered (setup, the shot screen and their sheets; release
 * blocker 19). The iOS number pad has no return key, and the app's WebView hides the keyboard's accessory bar, so a
 * player on a distance, yardage, rating or slope field had no way to put the pad away. In the app this holds the
 * native accessory bar (‹ › Done) up from mount to unmount (`pinKeyboardAccessoryBar`), before any field is focused,
 * so it never races the keyboard; it is the system's own bar, so it sits over the sheets too. Mobile Safari draws
 * that bar itself, so on the web this does nothing.
 */
export function useRoundDoneKey(): void {
  useEffect(() => (isNativeApp() ? pinKeyboardAccessoryBar() : undefined), []);
}
