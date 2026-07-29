/**
 * ThemeScript — no-FOUC theme boot (GolfHelm).
 *
 * A tiny inline <script> rendered in the root document <head>. It runs BEFORE
 * first paint on a hard load of /golf/dashboard, reads the device-local theme
 * choice (the same `golf_theme` key `useGolfTheme` writes), resolves `system`
 * against the OS, and sets the `.dark` class + `data-fw-theme` on <html> so the
 * very first painted frame is already in the correct theme — no flash of the
 * light theme for dark-mode users.
 *
 * Keeping this in the root document head is important: a raw script in a
 * nested layout is rendered by React during soft navigation, where it does not
 * execute and produces a warning. The path guard keeps a GolfHelm preference
 * from changing the theme of BaseballHelm or public pages. Soft navigation
 * into the dashboard is handled by ThemeApplier.
 *
 * Server component (no 'use client'): it only emits markup. Keep the key here
 * in sync with THEME_STORAGE_KEY in src/lib/golf/theme.ts.
 */

// Minified-ish IIFE; wrapped in try/catch so a storage exception never blocks
// paint. Mirrors resolveIsDark(): dark when choice==='dark', or 'system' + OS dark.
// `/golf/welcome` is in the guard alongside the dashboard because it is the
// post-sign-in interstitial and it now paints on the SAME `bg-canvas` /
// `bg-canvas-gradient` tokens the dashboard does. Without the boot script those
// tokens resolve to their LIGHT values regardless of preference, so a dark-mode
// user got a full-screen light page for the length of the hold and then a flip
// to espresso on arrival — the light flash simply moved rather than going away.
const BOOT = `(function(){try{var p=location.pathname;if(p!='/golf/dashboard'&&p.indexOf('/golf/dashboard/')!==0&&p!='/golf/welcome')return;var k='golf_theme',t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'&&t!=='system')t='system';var d=t==='dark'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d){r.classList.add('dark');r.setAttribute('data-fw-theme','dark');}else{r.classList.remove('dark');r.setAttribute('data-fw-theme','light');}}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: BOOT }} suppressHydrationWarning />;
}
