# P015 — Auth: changelog

Newest first.

## 2026-09-30 — Sign up and onboarding, and a smooth hand-off

```text
Design package: design/handoff/auth (owner, Q-96)
PR/commit:      agent/clubhouse (draft PR #2102)
Contract IDs:   CH-15010 to CH-15014, CH-15110 (sign up)
Data impact:    none (today's actions; demo_requests gains the 'signup' source and interest types its CHECK allows)
```

| Issue | Fix | Checked |
| --- | --- | --- |
| Sign up and onboarding existed only in today's style | The design's intro, code, name, class year, account, your game, photo and done, the staff path and Request access, over the same server actions (Q-96: no role picker, no head-coach path) | onboard.test, screenshots at 1440 and 390 |
| The class year chosen at sign-up was never saved | It is sent with the rest of the profile at the end | onboard.test (finish sends gradYear) |
| A 2032 tile would put a player under 13 | Tiles are the six classes still to graduate, less any year under 13; the guardian line stays | onboard-logic.test |
| The design's password rules were looser than the server's | The rules drawn are the server's own | onboard.test, onboard-logic.test |
| The design took HEIC and 10 MB photos the bucket refuses | JPEG, PNG, GIF and WebP up to 2 MB, refused before upload | onboard.test |
| "Good evening" was hard to read over the sky | A stronger scrim, a darker green line with a soft halo by day, a brighter gold with a dark halo at night | looked at |
| The wrong-password text arrived raw with no field marked | Reads as the design's, both fields marked, the attempts left kept (Q-98, Clubhouse only) | auth.test, auth-credentials.test |
| The welcome to the dashboard showed an empty page and then snapped | The fold's last frame is held over the route change and fades away once the dashboard is drawn | handoff.test, video |
| The welcome's course blinked at the route change from sign in | It no longer fades in again when sign in already drew it | video |
| The fold landed 8px off the dashboard's canvas | It lands on the sidebar's edge, on the sidebar's own green | video |
