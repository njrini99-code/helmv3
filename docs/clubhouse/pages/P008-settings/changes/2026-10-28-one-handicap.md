# 2026-10-28 — Golf profile shows one handicap, as Home does

## 2026-10-28 — One "Handicap index" field with Home's number

```text
Design package: owner decision (Settings shows only Handicap index)
PR/commit:      fix/settings-handicap-only
Contract IDs:   none new; CH-8113 is the field's range check, CH-8112
                still guards the stored handicap a save writes back
Actions:        saveGolf (unchanged columns)
Data impact:    none; golf_players.handicap and handicap_index both stay
Held items:     none
```

### Changed

- Golf details, desktop and phone: the separate "Handicap" field is gone.
  One field, "Handicap index", holds the number Home shows:
  `handicap_index ?? handicap` (data/player-home.ts), in `formatHcp`
  ("4.3", "+1.2").
- The phone's Golf details rows and its identity line read the same number.
- Left as shown, a save writes both columns back as they were, so saving
  the phone never copies the handicap into the index.
- A new number is written to `handicap_index`. "+1.2" is stored as −1.2,
  as onboarding stores a plus handicap.
- Clearing the field clears both columns, so Home shows no handicap either.

### Why

- Settings showed two handicap numbers where Home shows one, and the two
  could disagree (onboarding writes only `handicap`).

### Verification

- settings.test: one handicap field on desktop and phone, and its value
  equals Home's Handicap figure for index, no-index, plus and whole cases.
- logic.test: parseHcp, shownHandicapIndex, golfDetailsToSave.
- settings-server.test: "+1.2" is written as −1.2.
