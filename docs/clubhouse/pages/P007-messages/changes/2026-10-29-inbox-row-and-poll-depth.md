# 2026-10-29 — Inbox row on one line, thread measure, poll depth and motion

## 2026-10-29 — Owner's Team Channel screenshot fixes and the poll redesign

```text
Design package: none (owner feedback on the Team Channel screenshot, then
                "make the polls look a lot better, add motion and depth")
PR/commit:      #2409
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     signed-in staging check as a player; the poll motion on a real
                iPhone (checked in Playwright WebKit only)
```

### Changed

- The inbox row's poll glyph (`.ch-ms-row__poll`) is `inline-block`; the
  global svg reset made it a block and split "Coach:", the glyph and the text
  onto three lines. A selected row tints it like the sender name.
- The thread's top fade is 40px (was 16), so a line cut by the scroll position
  dissolves instead of reading as clipped.
- The message column takes the composer's 816px measure; the bubble cap is
  `min(560px, 78%)` (was 520px).
- Poll card: a raised sheet with a lit rim and soft cast; options are keys that
  lift 1px on hover, sink on press and spring back (`--ch-dur-release`,
  `--ch-ease-spring`). Your pick gets a ring and glow and the check settles on
  a tap only (never on first paint, Q-153). A closed poll's rows go flat and
  the leader gets a ringed bar. Reduced Motion and Animations off drop the
  lift, sink and squeeze; the depth stays.
- Preview fixtures: the travel row's last message is its van poll, and the van
  poll has no end time so the preview has an open poll to vote on.

### Verification

- `messages-polls-css`, `messages-polls`, `messages`, `names`,
  `motion-durations-pinned`, `thread-anchor` and `screens/messages` pass;
  `npm run check:changed` exit 0.
- Safari (WebKit) at 1440px for the inbox row and alignment; Playwright WebKit,
  light and dark, for the poll card and the vote motion.
