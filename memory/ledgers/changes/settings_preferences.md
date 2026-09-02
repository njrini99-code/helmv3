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
