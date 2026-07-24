/**
 * ThemeScript — no-FOUC theme boot (GolfHelm).
 *
 * A tiny inline <script> rendered in the golf dashboard layout's SSR HTML. It
 * runs BEFORE first paint, reads the device-local theme choice (the same
 * `golf_theme` key `useGolfTheme` writes), resolves `system` against the OS,
 * and sets the `.dark` class + `data-fw-theme` on <html> so the very first
 * painted frame is already in the correct theme — no flash of the light theme
 * for dark-mode users.
 *
 * Server component (no 'use client'): it only emits markup. Keep the key here
 * in sync with THEME_STORAGE_KEY in src/lib/golf/theme.ts.
 */

// Minified-ish IIFE; wrapped in try/catch so a storage exception never blocks
// paint. Mirrors resolveIsDark(): dark when choice==='dark', or 'system' + OS dark.
const BOOT = `(function(){try{var k='golf_theme',t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'&&t!=='system')t='system';var d=t==='dark'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d){r.classList.add('dark');r.setAttribute('data-fw-theme','dark');}else{r.classList.remove('dark');r.setAttribute('data-fw-theme','light');}}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: BOOT }} suppressHydrationWarning />;
}
