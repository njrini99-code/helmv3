# 2026-11-05 — Coach desktop polish: shared pieces

## 2026-11-05 — The tight head on more pages, Helm key on the desktop bar

```text
Design package: none
PR/commit:      agent/clubhouse-parity-stats-calendar
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- ui/PageHero.tsx takes `tight`. Calendar, Stats, Team Hub, Rounds, Qualifiers,
  Tournaments and Settings move to the tight head, so no double rule sits above
  their titles. Home, CoachHelm and Classes keep the full head for now.
- quick-chat.css: on the desktop bar the Helm key is the ghost icon button of
  the bell and Settings beside it. The phone key is unchanged.

### Why

- Owner, 2026-11-05, on the coach desktop: "it looks sloppy". The 2026-10-07
  entry in CHANGELOG.md credits the rule to the owner's Coach Home handoff, but
  the handoff in `design/handoff/` draws none.

### Verification

- `coach-desktop-polish.test.ts`. Needs a look in WebKit at 1534: port 3100 was
  in use by another worker, so no browser check ran.
