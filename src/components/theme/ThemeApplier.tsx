'use client';

/**
 * ThemeApplier — render-null. Mounted once in the golf dashboard shell so the
 * theme preference is hydrated + kept live on EVERY dashboard page, not only
 * when the settings screen (which also reads the hook) is open.
 *
 * Calling `useGolfTheme()` triggers its mount effect, which reads the stored
 * choice, re-applies the `.dark` class, and wires the OS `prefers-color-scheme`
 * + cross-tab listeners once — so a `system` choice follows the OS live and a
 * change in another tab mirrors here. The no-FOUC first paint is handled
 * separately by `ThemeScript`; this keeps runtime in sync.
 */

import { useGolfTheme } from '@/lib/golf/theme';

export function ThemeApplier() {
  useGolfTheme();
  return null;
}
