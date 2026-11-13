# 2026-11-12 — messages

## 2026-11-12 — New poll: an "Add a choice" key under the choices (#12)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md #12)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        Add a choice (New poll sheet)
Data impact:    none
Held items:     none
```

### Changed

- The New poll sheet shows a ghost "Add a choice" key (Plus icon, the shared
  Button) under the choice rows while there
  are fewer than six and no empty spare waits at the end. It adds a row and
  moves the cursor into it.
- The automatic spare row (it appears as the last row fills) is unchanged.

### Why

- Nick, as a player: "Should be the ability to add more than one poll". With two
  empty rows nothing said a third was
  possible; the spare only appeared once both were typed in.

### Verification

- `screens/messages/__tests__/poll-add-choice.test.tsx`: the key on an empty
  sheet, a press adds and focuses row 3, it hides
  while a spare is empty, and it stops at six.
- Not yet seen in WebKit; for the coordinator's check on :3100
  (`/clubhouse-preview/messages`, + then Poll).
