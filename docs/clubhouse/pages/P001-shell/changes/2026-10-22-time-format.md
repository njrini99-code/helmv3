# Times follow the device clock (24-hour option)

## 2026-10-22 — Times follow the device clock (24-hour option)

```text
Design package: none (coach and player parity; QUEUE doc-07)
PR/commit:      claude/project-thread-a106un (#2334)
Contract IDs:   none new (CH-8980 is Settings)
Actions:        none
Data impact:    none (display only; every stored time is unchanged)
Held items:     none
```

### Changed

- The shell's server layout reads the `ch_clock` cookie (`clockHint`) and `ClubhouseShell` wraps the app in `ChClockProvider`, so a 24-hour device's first frame is already in 24 hours and nothing flips after hydration.
- The sidebar's Next event card reads its "Thu, Oct 16 · 8:42 AM · place" line through `useChClockText`.

### Why

- QUEUE doc-07 (D-76): a coach or player who reads a 24-hour clock should see Clubhouse in it. The choice is a device preference like the distance unit, so nothing is stored on the account and no request is made.

### Verification

- `clock-format.test`, `clock-surfaces.test`, `settings-time-format.test` (CH-8980); `npm run typecheck:fast`; `clubhouse:check`. 12-hour output is byte-for-byte what it was (the default, and every existing test).
