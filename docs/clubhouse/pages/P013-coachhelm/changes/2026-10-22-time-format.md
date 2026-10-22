## 2026-10-22 — Ask's "as of" time follows the device clock (24-hour option)

```text
Design package: none (coach and player parity; QUEUE doc-07)
PR/commit:      claude/project-thread-a106un (#2334)
Contract IDs:   none new (CH-8980 is Settings)
Actions:        none
Data impact:    none (display only; every stored time is unchanged)
Held items:     none
```

### Changed

- The coverage line's "As of 3:05 PM" reads "As of 15:05" on a 24-hour device (`AskHome` restyles the server's label).

### Why

- QUEUE doc-07 (D-76): a coach or player who reads a 24-hour clock should see Clubhouse in it. The choice is a device preference like the distance unit, so nothing is stored on the account and no request is made.

### Verification

- `clock-format.test`, `clock-surfaces.test`, `settings-time-format.test` (CH-8980); `npm run typecheck:fast`; `clubhouse:check`. 12-hour output is byte-for-byte what it was (the default, and every existing test).
