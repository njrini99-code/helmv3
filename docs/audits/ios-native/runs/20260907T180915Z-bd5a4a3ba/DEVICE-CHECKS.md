# Physical-device checks — NOT RUN

No physical iPhone was available to this run. Everything below is unperformed.
It is listed so the work is bounded, not to imply it was attempted.

Device identity to record when these are run: model, iOS version, build number
of the installed binary, and whether it is a TestFlight or development build —
a simulator `.app` is not a device build and its results do not transfer.

## The one check that changes the audit's verdict

1. **Attach Xcode's Accessibility Inspector to the running app and walk the
   dashboard.** F-A11Y-NATIVE-01 found zero accessibility targets from the
   automation harness while the Settings app returned fourteen. If the
   Inspector also sees nothing, VoiceOver cannot drive GolfHelm at all and that
   is the most severe finding in this audit. If the Inspector sees the web
   content, the finding shrinks to a testability problem. **Run this first.**

## Haptics — cannot be simulated at all

2. Tab taps fire `selection`; primary buttons fire `light`.
3. The round-submit success haptic fires only after the save is confirmed.
4. Turning the in-app haptics preference off silences every one of them.
5. Since the app-shell primitives changed on `agent/mobile-ui-audit` (bottom nav,
   top bar, sidebar chevron), confirm those three still buzz.

## Keyboard and inputs

6. Open each surface listed in F-KBD-AUTOFOCUS-01 and record whether the
   keyboard rises before the user asks. That finding is source-proven and
   device-unproven.
7. Email, password, numeric, multiline, search and date fields: correct keyboard
   type, working autofill, caret visible, return key sensible.
8. The composer and send control stay reachable with the keyboard up.

## VoiceOver and Dynamic Type

9. Complete login, tab navigation and one shot entry using VoiceOver only.
10. Largest OS text size: nothing essential clipped, no control unreachable.
11. Reduced motion on: state changes still legible.

## Lifecycle and performance

12. Background and foreground **without** killing the process; confirm the screen
    and any draft survive. `simctl launch` restarts the process and cannot model this.
13. Force-terminate and relaunch as a separate case.
14. Cold-launch timing on device, Release build, 30 trials before quoting a percentile.
15. Re-check the login flash: on the very first launch after install, the
    signed-out login screen appeared before the client-side session restore
    reached the dashboard. Observed once, accidentally, and not reproduced —
    treat as a hypothesis, not a finding.
