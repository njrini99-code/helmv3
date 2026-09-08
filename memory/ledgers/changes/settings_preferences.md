# Change ledger — settings_preferences

## 2026-08-27 — Haptics panel gains the feel-lab entry point

- SHA: 1a57943e6.
- Change: `HapticsPanel` in `FairwaySettingsGeneral` renders a "Feel lab" row
  linking to `/golf/dashboard/dev/haptics`, below the haptics toggle. Native
  only, via the panel's existing `if (!native) return null`.
- Why: the §72 feel lab had no in-app entry point and a Capacitor WebView has
  no address bar, so it could not be opened on the device it exists to tune.
- Watch: no role check — every installed-build user sees the row. Gate on
  coach/owner before any public App Store release.

## 2026-09-07 — route `loading.tsx` fallbacks reshaped to the real first paint

- SHA: 6eccdf03d.
- Change: this feature's route Suspense fallbacks (`dashboard/settings`, `dashboard/settings/notifications`) were reshaped.
  No route, table, server action, data flow or business rule changed — the
  edits are confined to `loading.tsx` skeleton geometry and its ARIA
  wrapper.
- Why: the fallbacks were shape-matched to each page's SETTLED layout
  rather than the markup that paints at t=0. For a `'use client'` page
  holding its own `loading` state, the Suspense fallback is replaced by
  that component's loading branch, so reserving the populated geometry
  caused the layout shift the fallback exists to prevent. A route whose
  `page.tsx` is a pure `permanentRedirect` shim now renders `bg-canvas`
  only — no geometry, no `<h1>` for a screen that never mounts.
- Verification: every edited file was adversarially re-verified against
  its page's source, twice for the files that failed the first pass.
  typecheck 0, lint 0, build 0.
