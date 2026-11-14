# 2026-11-13 — qualifiers

## 2026-11-13 — The Qualifiers modules build no date formatter when they load (F-0010)

```text
Design package: none (owner's browser audit, finding F-0010, S2 motion; Qualifiers 150 ms with 3 gaps over 50 ms at 4x CPU)
PR/commit:      agent/ch-look-speed
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     the frame-gap measurement on a device; the route split (below)
```

### Changed

- `qualifiers/model.ts` (the day and day-and-year labels) and
  `QualifierSections.tsx` (the 12 and 24 hour clocks) built their
  `Intl.DateTimeFormat`s at module load, in the first frame after a switch,
  used or not. They are built on first use now, through the shared cache
  (`lib/zone-format.ts`). Labels are unchanged; the clocks still read the
  browser's own zone.

### Verification

- `screens/qualifiers/__tests__/first-render-formatters.test.ts` (new):
  importing either module builds no formatter; the labels are as they were;
  a hundred more labels build nothing. Fails on the previous sources.

### Not measured, and not done

- The list's chunk also carries the detail, form and selection screens
  (`routes/qualifiers.tsx` imports all four client screens), so a switch to
  the list evaluates their modules too. Loading them only where they are used
  (a dynamic import per screen) is the larger saving, but it changes how the
  route's client code is split and needs a trace to confirm; written up in the
  PR, not made here.
