# Settings › Preferences › Time format (12 or 24-hour)

## 2026-10-22 — Settings › Preferences › Time format (12 or 24-hour)

```text
Design package: none (coach and player parity; QUEUE doc-07)
PR/commit:      claude/project-thread-a106un (#2334)
Contract IDs:   none new (CH-8980 is Settings)
Actions:        none
Data impact:    none (display only; every stored time is unchanged)
Held items:     none
```

### Changed

- A "Time format" row (CH-8980) beside Distance units: a 12-hour / 24-hour
  Segmented on desktop and a picker row on the phone, with a line saying how
  times will read.
- It is a device preference (`useDevicePrefs` → `ChClockProvider`): the cookie
  `ch_clock` for the server's first frame, `localStorage` so other tabs follow,
  and state so every time on screen redraws at once with no request.
- `Row` takes a `code` prop for `data-ch-code`.

### Why

- QUEUE doc-07 (D-76): a coach or player who reads a 24-hour clock should see
  Clubhouse in it. The choice is a device preference like the distance unit, so
  nothing is stored on the account and no request is made.

### Verification

- `clock-format.test`, `clock-surfaces.test`, `settings-time-format.test`
  (CH-8980); `npm run typecheck:fast`; `clubhouse:check`. 12-hour output is
  byte-for-byte what it was (the default, and every existing test).
