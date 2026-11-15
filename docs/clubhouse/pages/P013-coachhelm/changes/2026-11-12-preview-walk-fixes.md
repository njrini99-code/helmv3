# 2026-11-12 — coachhelm

## 2026-11-12 — Fixes from the owner's walk of the preview: a player's Ask, and Upload a plan on a desk

```text
Design package: none (owner's preview walk, 11 Nov 2026; both pages keep their look)
PR/commit:      agent/preview-fixes-ui, 88216174a4 (Plan format) and this commit (Ask)
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- A player's Ask on a desk drew its whole page, the greeting, Your focus and the
  composer, in a 280px column at the left. The body's grid kept the coach's
  chats
  column, and a player has no chats list, so the conversation sat in that
  column.
  The body now has no chats column for a player (`.ch-ask-body.is-solo`), with
  or
  without the evidence panel, and on the tablet tier as well.
- A player's desk header shows New chat, as the phone does; Show chats is the
  coach's only.
- The new chat's "@" picker (Players) opened under the box, which now sits low
  on its
  page, so on a 990px window the list had 80px for 23 rows. It opens under the
  box only
  while there are 240px there; with less it opens above, on the roomier side
  (`.ch-ask-pick.is-up`, `PICK_MIN_BELOW` in Composer.tsx).
- Plan format's "Upload a plan" on a desk opens the file picker at once. The
  sheet with its three ways in (camera, photo library, file) is the phone's: its
  styles live in the phone query, so on a desk it drew as a bare box.

### Why

- The owner, 11 Nov: "not sure whats goig on with ask for player", "when I click
  players in the bottom bar I can't scroll, the box is so narrow", and the
  unstyled
  upload box on Plan format.

### Not done

- The capture lacks a player Ask still (`coachhelm-ask-v2?viewer=player`), which
  is how this slipped through. It is asked for in the next capture.

### Verification

- `src/clubhouse/__tests__/coachhelm-ask.test.tsx`: 57 passed, including the new
  player case. `plan-format-upload.test.tsx`: 2 passed.
- `coachhelm-ask-picker-room.test.tsx`: the hero picker below while it has room,
  above
  when short, and below when below is still the roomier side; 65 passed with the
  Ask suite.
- WebKit on the dev server, coach new chat, "@": at 1920x990 and 1440x900 the
  picker opens
  above the box with a 296px list (6 rows in view, 21 options).
- WebKit at 1440 and 1920 on
  `/clubhouse-preview/coachhelm-ask-v2?viewer=player&stage=home`:
  the conversation column measured 280px before and 1192px / 1672px with the
  fix.
