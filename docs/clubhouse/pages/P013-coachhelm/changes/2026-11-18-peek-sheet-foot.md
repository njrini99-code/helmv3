# P013 CoachHelm — Changelog

## 2026-11-18 — The player peek sheet ends under its link

```text
Design package: none
PR/commit: agent/clubhouse-motion-fixes
Contract IDs: TEAM-17, FID-TEAM-10 (foot unchanged in intent)
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/coachhelm-team.css` `.ch-htb-sheet .ins`: the foot is one 20px gutter.
  It was `40px + env(safe-area-inset-bottom)` inside a Modal panel that already
  pads the safe-area inset on the phone, so on an iPhone a one-link peek ("Open
  Mason's page") stood over about 110px of empty sheet.

### Why

- Clubhouse audit 2026-11-18 (P2): the peek sheet had empty space below its one
  action.

### Verification

- WebKit, iPhone 17 Pro preset, pre-fix build: `.ins` padding-bottom 40px plus the
  panel's inset, 40px empty under the link with Playwright's zero inset (about
  108px on a device with the 34px home-indicator inset).
- The scrim does cover the top bar: with the sheet open, `elementFromPoint(200, 30)`
  is the dialog (native top layer, `::backdrop` 24% warm black). On the green bar
  that dim barely shows, which is what read as "not covered". The bell's drop keeps
  the bar above its veil by design (shell.css); neither is changed here.
