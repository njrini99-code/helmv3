# 2026-10-23 — Week grid overlaps (Clubhouse A+ WP-7)

## 2026-10-23 — A busy block lies under the events it overlaps (A26)

```text
Design package: none (Clubhouse A+ handoff, section 5, A26)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: side-by-side lanes instead of the cascade (owner call)
```

### Changed

- Within the owner's cascade (2026-10-06): a busy block that shares a slot
  lies under the events it overlaps, whatever its lane, and comes forward on
  hover. A team round's title is no longer covered by a staff meeting.
- A block is at least 22px tall (was 20), one line of title.
- A cascaded block under about 72px wide drops its time and keeps its title
  with an ellipsis; the peek and its name carry the rest.
- Left alone: the cascade itself. Side-by-side lanes are an option for the
  owner, not taken.

### Why

- On Monday the staff meeting stepped in over the team round and hid it.

### Verification

- New `screens/calendar/__tests__/model.test.ts` (three overlapping events,
  three lanes) and a calendar render test (the busy block is under the round,
  with a lower z-index). WebKit at 1280 on `calendar?view=week`, before and
  after (screenshots in the store).
