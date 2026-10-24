# 2026-10-24 — Owner decisions 13 and 16: section keys and cold People

## 2026-10-24 — Cmd or Ctrl 1 to 9, and the palette's People before Roster opens

```text
Design package: none (Clubhouse A+ handoff, B11; owner decisions 13 and 16,
                2026-10-24)
PR/commit:      feat/decisions-keys
Contract IDs:   none
Actions:        none
Data impact:    reads only: for a coach, golf_team_members with golf_players
                (id, first_name, last_name) in the shell load
Held items:     a security review of the People list (decision 16 asks for one
                before it ships); Cmd 1 to 9 in a browser tab
```

### Changed

- Cmd or Ctrl and 1 to 9 go to the sidebar's sections in the order the
  sidebar draws them (`shortcuts.ts` `sidebarOrder`, `itemForDigit`). It works
  from a field, as Cmd K and Cmd comma do, and never over a dialog. Settings
  keeps Cmd comma. Both roles have ten sections, so the tenth (a coach's
  Recruiting, a player's Classes) keeps only its G letter.
- The shortcuts sheet draws each section's digit beside its G letter
  ("G then H or ⌘ 1").
- The palette's People works before Roster has been opened. The shell loads a
  coach's players as id and name only (`loadPalettePeople`); CommandLayer seeds
  the in-memory list from it, and Roster's fuller rows still take precedence.
  A player's list is never read or seeded.
- The People list is now scoped to the signed-in person and the team, so a
  team switch or another account on the same browser drops it.

### Why

- Owner decision 13 (OQ-63, B11): standard Mac section keys.
- Owner decision 16 (B11): People was empty until Roster had been opened. The
  owner approved names and ids only, coaches only, in memory, after a security
  review.

### Verification

- `shortcuts.test.ts`: the chord with either modifier, from a field, not over
  a dialog; 0, Shift, Alt and a held key do nothing; the order matches the
  sidebar's groups for both roles; the tenth section has no digit.
- `command-layer.test.tsx`: Cmd 2 opens CoachHelm and Ctrl 6 Roster; the
  sheet's caps; a coach finds a player cold from the shell's names; a player is
  never seeded; a page's list wins in either order; a team switch and another
  sign-in drop the old list.
- `shell-palette-people.test.ts`: a coach's rows are `{ id, name }` only, from
  the Roster's set on the team; a player never reads it; a failed read is
  logged and leaves the rest of the shell.
- Not verified: whether a desktop browser hands Cmd or Ctrl 1 to 9 to the page
  at all. Chrome keeps them for its tab switching. The keys are certain to
  work only where the app owns the window (the iOS app's WKWebView on iPad
  with a keyboard).
