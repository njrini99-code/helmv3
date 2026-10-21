# Phone design: Push opt-in in the app (draft, no owner board)

Status: draft, 2026-10-16. Release blocker 12 (finding N2). No owner board draws
it; this note is the spec until one does. Built from it in the same change.

## The problem

In the iOS app (the Capacitor shell around production) push goes through Apple
(APNs), not web push. Fairway asks for it with a soft-ask sheet mounted in its
own shell (`PushPermissionSoftAsk`), which Clubhouse never renders, and
Clubhouse Settings › Notifications only knows web push, which does not exist in
the app's WebView, so its "Push on this device" row is hidden there. A new
Clubhouse user in the app is never asked and cannot turn push on.

Everything below works with the shipped binary: it uses the push plugin and the
APNs handshake the app already has (`src/lib/utils/push-registration.ts`:
`shouldShowPushSoftAsk`, `requestPushPermission`, the token flush on sign-in in
`CapacitorProvider`), and no new native code.

## The ask (shell, every page)

- **Who and when.** The iOS app only, and only while iOS has not been asked
  (`checkPermissions()` is `prompt`) and the person has not answered our ask in
  either UI (the soft ask's stored state, shared with Fairway's, so a "Not now"
  there counts here). At most once a launch.
- **A calm moment.** Never on first paint and never on sign-in or the welcome
  (the ask lives in the dashboard shell, which those screens do not render).
  It waits for the page to settle: 4 seconds on one page, restarted by every
  navigation. Then it shows only if nothing else has the person: no sheet or
  dialog open, the section strip closed, no field focused, the app in front,
  and not on round entry (`/rounds/new`, `/rounds/continue`), onboarding or
  Settings (Settings has its own row). If any of those holds, it waits for the
  next page.
- **The sheet.** The shell's `Modal` (a bottom sheet on the phone, drag to
  close), with the bell. Title "Turn on notifications". The line under it names
  what push brings for the role:
  - player: "Know when your coach messages you, the schedule changes or a round
    review is ready, even with GolfHelm closed."
  - coach: "Know when a player posts a round, messages you or answers an event,
    even with GolfHelm closed."
  - then "You can change this in Settings, under Notifications."
  Footer: "Not now" (ghost) and "Turn on" (primary).
- **Turn on.** The light tap of a primary button, then iOS's own prompt. Allowed:
  the success tap, the sheet closes and a toast says "Notifications are on";
  the device registers with APNs and its token reaches the server through the
  existing handshake. Don't Allow: the sheet closes quietly, with no toast and
  no second ask (iOS will not show its prompt again; Settings says how to turn
  it on).
- **Not now**, the close button, Esc or a drag down: the sheet closes, the
  answer is kept, and it never asks again (Fairway's rule: one ask, no nag).
  Silent, as every other tap (D-70).
- **Reduced motion and Animations off:** the sheet appears and leaves at once
  (the Modal's own rule).

## Settings › Notifications › This device (the app)

The "This device" group shows the app's own push in place of the web row:

| iOS says | The row | Under it |
| --- | --- | --- |
| Not asked yet | "Push on this device", switch off. Turning it on shows iOS's prompt (the switch is busy meanwhile); allowed, it stays on with the success tap and the toast "Push is on for this device" | |
| Allowed | The switch on and not changeable here ("On. Turn it off in iOS Settings.") | "Open iOS Settings" |
| Not allowed | The switch off and not changeable here ("Notifications are off for GolfHelm in iOS Settings. Turn them on there, then come back.") | "Open iOS Settings" |
| Not yet known | The switch off, busy | |

"Open iOS Settings" opens GolfHelm's page in the iPhone's Settings app
(`app-settings:`, which the app's WebView hands to iOS). Coming back to the app
reads the state again, so the row is right on return. "Send a test" stays a web
push action and is not shown in the app (the test route sends web push only).
While push is not on here, the "Email and push" group keeps its note that push
choices still apply to other devices. The same row appears on the wide layout
(the app in landscape on a large iPhone).

## Not in this draft

- A second ask later (iOS allows one system prompt; after a Don't Allow only
  Settings can turn push on, which the row covers).
- Android (no Play build is planned before the canary).
- A device check: both the ask and the row need the owner's device pass; the
  Simulator was not available when this was built.
