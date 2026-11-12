# 2026-11-12 — auth

## 2026-11-12 — The sign-in family in WebKit: the spinner's ring, a notice's action, the password's needs

```text
Design package: none (a sweep of what is live: golf_clubhouse_front_door is on in production)
PR/commit:      agent/coachhelm-miss-compass
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Fixed

- The spinner had no ring on the sign-in family. `.ch-spinner` lived in controls.css, which the shell loads and AuthFrame
  does not, so "Signing in…" (AuthKey) and every "Checking…" line (GateChecking) drew a 0x0 span, and the checking lines
  sat 8px in from their heading for the gap beside it. Live on /golf/login as well as the preview. The ring now lives in
  spinner.css, which ui/Spinner.tsx loads itself, so any page that draws one has it; it is defined once (one-spinner test).
- A notice's action (Switch account, Go to sign in) goes under its words, lined up with them. Beside them it squeezed
  "This account already belongs to another program. Use a different email to join this one." into four short lines, at
  390 and on the desk panel.
- The password's four needs sit two by two. As a wrapped row they broke three and one, "A symbol" alone, on a phone and on
  the desk panel.

### Verification

- WebKit at 390 and 1440, light and dark: 54 states of signin, forgot, the six refusals, reset, join, joinconfirm, staff,
  pending and demo; the load, the change to the forgot view and back, and an empty Sign in and Send.
- `screens/auth/__tests__/auth-notice-rules-layout.test.ts`, `__tests__/one-spinner.test.ts`; the auth tests and the
  repo-wide style guards pass (24 files, 235 tests).
