# 2026-10-30 — Rounds: Live, setup and the shot screen

## 2026-10-30 — Failure states say so with Try again; the shot card holds still (F-0011, F-0012, F-0013, F-0019, F-0020, F-0030, F-0049, F-0060, F-0067)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0011, F-0012,
                F-0013, F-0019, F-0020, F-0030, F-0049, F-0060, F-0067; fix
                plan PR 4)
PR/commit:      claude/audit-fix-04-rounds-live-shot (#2415)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Live (phone): a failed first read shows the CH-16604 notice with Try again
  instead of an empty list, and the chip says Connecting (use-live-view.ts
  gains failed; LiveViewPhone.tsx, LiveView.tsx) (F-0012).
- Round setup: a qualifier list that failed is said up front (CH-11211) with
  Try again, before a qualifier round can be started as practice (F-0013). The
  dock height is a variable (--ch-rsu-dock-h) and fields scroll clear of it
  (scroll-margin, rounds-setup.css) (F-0049).
- Round tracking: the offline banner hides on the immersive shot screen, and
  the save line says offline in its own words (useOffline, SAVE_WORDS.offline)
  (F-0011). The distance block is reserved (inert, aria-hidden) while no
  result is picked, and the shot log "Last:" line swaps in place, so the card
  no longer jumps on a result or Next shot (F-0019, F-0020). Shot-tracking
  data, fields and payloads are untouched.
- Team rounds: the empty states lead on, Invite players (no players) and Open
  roster (no rounds) (F-0030). Round review: the coach note read failure is an
  inline notice with Try again (CH-11222, F-0061).
- The Round review skeleton draws the feature hero tone (Skeleton
  shape="feature") so the page lands without a tone flash (F-0060). F-0067 is
  pinned by a test only.

### Why

- The audit found a Live view that stayed empty after a failed read, a setup
  that hid a failed qualifier read until too late, a shot card that moved
  under the thumb, and empty states with no next step.

### Verification

- New tests red on main and green after: live-phone-failed,
  setup-qualifiers-failed, dock-scroll-margin, shot-entry-reserve,
  track-offline, team-rounds-empty, review-skeleton-hero, sg-change-pin
  (F-0067 pin); rounds-coach-note updated.
