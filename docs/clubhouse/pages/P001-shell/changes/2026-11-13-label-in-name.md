# 2026-11-13 — shell

## 2026-11-13 — The sidebar identity, the search pill and the CoachHelm key are named by their words

```text
Design package: none (audit 2026-11-13, F-0011, F-0015; no visible change)
PR/commit:      agent/ch-look-a11y
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The sidebar identity (`.ch-identity`, every desktop page, both roles) is named
  "Maya Reyes, Head coach · Varsity", its own hidden copy of what it draws, in place
  of the aria-label "Maya Reyes. Account" that its initials and role line disagreed
  with. The drawn block is `aria-hidden`; the copy stays when the folded rail hides it.
- The top bar search (`.ch-topbar__search`) is named by its word, "Search", then
  "Clubhouse" for a screen reader; its ⌘K caps stay out of the name
  (`aria-keyshortcuts` carries them).
- The CoachHelm key (`.hkey`) is named by its word through a hidden copy, not an
  aria-label the ⌘J caps beside it disagreed with.
- F-0015: the key sets `aria-controls="ch-qc-panel"` only while the quick chat is
  open, since the panel is in the page only then.

### Why

- Audit 2026-11-13 F-0011 (S2, axe `label-content-name-mismatch`, WCAG 2.5.3 Label in
  Name): the name a screen reader and Voice Control use did not hold the words on the
  control, so a voice-control user who said what they saw could not reach it.
- F-0015 (S3, IBM `aria_id_unique`): `aria-controls` pointed at an id that was not
  in the page while the panel was closed.

### Verification

- `shell/__tests__/identity-menu.test.tsx`, `shell/command/__tests__/search-pill.test.tsx`,
  `shell/quick-chat/__tests__/quick-chat-key.test.tsx` (name opens with the words shown,
  no aria-label; aria-controls only while open, and the id resolves).
- Not checked in a browser in this change (the lead verifies on a preview).
