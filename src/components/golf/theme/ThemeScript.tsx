/**
 * ThemeScript — no-FOUC theme boot (GolfHelm).
 *
 * A tiny inline <script> rendered in the root document <head>. It runs BEFORE
 * first paint on a hard load of /golf/dashboard or /admin, reads the
 * device-local theme choice (the same `golf_theme` key `useGolfTheme` writes),
 * resolves `system` against the OS, and sets the `.dark` class + `data-fw-theme`
 * on <html> so the very first painted frame is already in the correct theme —
 * no flash of the light theme for dark-mode users.
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
//
// `/admin` (Helm Bridge) joins the guard for the same reason and at almost no
// cost: the console is already 629 `warm-*` token classes with zero `bg-white`,
// zero hardcoded hex and zero `dark:` overrides, and the `.dark` block in
// design-tokens.css already inverts that whole ramp. Note it was ALREADY
// reachable in dark — soft-navigating from a dark dashboard into /admin leaves
// the `.dark` class on <html> (nothing removes it), so the Bridge rendered dark
// on that path and light on a hard load. This makes the two agree. The prefix
// test is `p.indexOf('/admin/')!==0` plus an exact `/admin`, so a future
// `/administration`-style route is NOT swept in.
// `/golf/login` and `/golf/forgot-password` (exact paths) joined in the 2026-09
// sign-in redesign. Both now paint only on Fairway tokens (AuthCanvas), so they
// follow the device's GolfHelm/OS theme instead of always painting light
// before a dark dashboard. `/golf/reset-password` joined once it moved onto
// the same AuthCanvas (AUTH-02 / OD-07).
// Before the theme guard, every `/golf` path gets `data-helm-sport="golf"` on
// <html>. The golf-only touch rules (hover only on a real pointer, no tap
// highlight, page rubber-band) key off it, so BaseballHelm and Lift Lab keep
// rendering exactly as before (owner OD-17b).
// On iOS it also reads the Dynamic Type body size (`font: -apple-system-body`,
// 17px at the default setting). Above default it stamps `data-fw-dynamic-type`
// and `--fw-type-scale` (capped at XXL, 23/17), and globals.css scales reading
// text inside <main> by it (OD-06, TYPE-02). Shell chrome sits outside <main>
// and stays fixed; other platforms and the default size change nothing.
// It also stamps `<meta name="theme-color">` so the mobile browser/status bar
// is already the right colour on the first frame instead of framing a dark page
// in the UA-default white. Values mirror THEME_COLOR in src/lib/golf/theme.ts
// (= --fw-color-canvas per theme); `applyTheme` rewrites this same tag — matched
// on `data-fw-theme-color` — on every runtime theme change.
const BOOT = `(function(){try{var p=location.pathname,h=document.documentElement;if(p=='/golf'||p.indexOf('/golf/')===0){h.setAttribute('data-helm-sport','golf');try{var q=document.createElement('span');q.style.font='-apple-system-body';if(q.style.font){h.appendChild(q);var z=parseFloat(getComputedStyle(q).fontSize);h.removeChild(q);if(z>17){h.setAttribute('data-fw-dynamic-type','');h.style.setProperty('--fw-type-scale',String(Math.min(23/17,z/17)));}}}catch(e){}}else h.removeAttribute('data-helm-sport');if(p!='/golf/dashboard'&&p.indexOf('/golf/dashboard/')!==0&&p!='/golf/welcome'&&p!='/golf/login'&&p!='/golf/forgot-password'&&p!='/golf/reset-password'&&p!='/admin'&&p.indexOf('/admin/')!==0)return;var k='golf_theme',t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'&&t!=='system')t='system';var d=t==='dark'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d){r.classList.add('dark');r.setAttribute('data-fw-theme','dark');}else{r.classList.remove('dark');r.setAttribute('data-fw-theme','light');}var m=document.head.querySelector('meta[data-fw-theme-color]');if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');m.setAttribute('data-fw-theme-color','');document.head.appendChild(m);}m.setAttribute('content',d?'#0d0f0d':'#f2e6d2');}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: BOOT }} suppressHydrationWarning />;
}
