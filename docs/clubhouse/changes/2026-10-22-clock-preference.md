## 2026-10-22 — A 12 or 24-hour clock for every Clubhouse time

```text
Design package: none (coach and player parity; QUEUE doc-07)
PR/commit:      claude/project-thread-a106un (#2334)
Contract IDs:   CH-8980 (80780)
Actions:        none
Data impact:    none (display only)
Held items:     none
```

### Changed

- `lib/clock-cookie.ts` (the `ch_clock` cookie and `ChClock`), `lib/clock-format.ts` (pure: `clockFromMinutes`, `clockFromHour`, `clockHourLabel`, `restyleClock`), `lib/use-clock.tsx` (`ChClockProvider`, `useChClock`, `useChClockText`) and `phone-hint.ts` `clockHint()` for the server.
- `restyleClock` rewrites the clock times in a server-written 12-hour label ("Thu · 7:30 PM", "3:00–4:15 PM", "between 7 AM and 8 PM") and leaves every other word alone; in 12 hours it returns the text untouched. No lookbehind (the iOS 15 web view refuses one at parse time) and no dotted "p.m.".
- `ui/date-time.ts` `formatTime(value, clock)` and `ui/TimeField.tsx` write and read "15:30" as well as "3:30 PM"; the list of slots, the hint and typing follow the clock.


### Why

- QUEUE doc-07 (D-76): a coach or player who reads a 24-hour clock should see Clubhouse in it. The choice is a device preference like the distance unit, so nothing is stored on the account and no request is made.

### Verification

- `clock-format.test`, `clock-surfaces.test`, `settings-time-format.test` (CH-8980); `npm run typecheck:fast`; `clubhouse:check`. 12-hour output is byte-for-byte what it was (the default, and every existing test).
