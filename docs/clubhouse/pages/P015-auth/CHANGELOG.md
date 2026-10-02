# P015 — Auth: changelog

Newest first.

## 2026-10-02 — Clear welcome text over the hole

The owner’s Safari screenshot showed tree silhouettes competing with the
greeting. A stronger reading veil protects the heading and date; greeting blur
and glow are removed. The updates card uses an opaque floating surface and
translation without scale or backdrop blur. Credential behavior is unchanged.

## 2026-10-02 — A repeated submit sends one sign-in

Frontend Design Premium's interaction pass reproduced two requests from form
submissions dispatched before the busy button committed. Sign-in now sets a
synchronous gate before sending credentials. A failed attempt releases it for
Retry; a successful handoff keeps the existing pending state. CH-15402 remains
the contract. Auth, credentials and scene suites pass: 64 tests. The new
regression failed before the guard and passes after it.

## 2026-10-01 — Safari sign-in loads coherently and animates the hole

Branch: `codex/clubhouse-design-fidelity`. The current owner feedback asks for
the golf hole after Sign in. The phone crop and camera pivot now frame the pin,
cup and ball landing instead of locking onto the clubhouse. Its 2.6s gentle push
completes before automatic navigation. Reduced motion keeps the camera at rest.

Sign-in's fixed 352px art reservation now scales down with the small viewport;
the same scrollable sheet holds the form. The compact brand starts below the
actual safe area. A 213KB still of the existing course artwork ships with server
HTML and remains behind the independently loaded animation, so a slow or failed
chunk leaves an actual hole instead of the placeholder gradient. It is an
application artwork asset, not a verification screenshot. The poster uses the
same wide/tall SVG crop as the animation. Credential/session/invite behavior is
unchanged.

Verified local WebKit: form and course with JavaScript disabled; 375x568,
390x664 and 430x900 with the submit button inside the viewport; the full preview
Sign in → welcome with visible hole/ball → player Home sequence. Auth tests
cover server artwork, scene failure isolation, camera framing and existing
credential behavior. Physical Safari performance and a real account round-trip
remain unverified.

## 2026-10-01 — Phone: the welcome carries on by itself (Q-137)

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (owner answer, iPhone brief)
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

- Below 820px the welcome proceeds 3.6s after it arms, once the greeting and
  the card have landed (`WELCOME_PHONE_AUTO_MS`). The fold into the dashboard
  still plays. Continue still goes sooner. The "or press Return" hint is not
  drawn on a phone. The desktop still waits for Continue.

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
