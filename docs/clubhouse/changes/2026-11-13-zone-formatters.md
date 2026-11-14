# 2026-11-13 — date formatters are built once per zone

## 2026-11-13 — A shared cache for zone date formatters (F-0010)

```text
Design package: none (owner's browser audit, finding F-0010, S2 motion)
PR/commit:      agent/ch-look-speed
Contract IDs:   none changed (every label and figure reads as it did)
Actions:        none
Data impact:    none
Held items:     the frame-gap measurement on a device
```

### Changed

- `lib/zone-format.ts` (new): `zoneFormat(locale, zone, kind, options)` builds
  each kind of `Intl.DateTimeFormat` once per locale and zone and reuses it. An
  unknown zone still throws and is never stored. Messages' time helpers
  (`model-time.ts`) moved onto it first and still export it.
- `lib/dates.ts` `zonedWallTime`, `lib/sun.ts` (the zone's offset in `sunTimes`)
  and `lib/light.ts` (`zoneOffsetHours`) read through it, so a week grid asking
  for the light of seven days builds the formatters once, not fourteen or more
  times.

### Verification

- `screens/calendar/__tests__/zone-formatters.test.ts` and
  `screens/messages/__tests__/model-time-formatters.test.ts`: no formatter is
  built after the first call however many follow; values unchanged.

### Also (follow-up in the same PR)

- `lib/dates.ts` `zoneShortName` ("CT", drawn on a class line shown in a zone
  other than the team's, once a player on Roster and Classes) keeps its
  formatters per zone and style instead of building up to two a call. Same test
  file as the round kicker
  (`screens/rounds/__tests__/review-formatters.test.ts`).
