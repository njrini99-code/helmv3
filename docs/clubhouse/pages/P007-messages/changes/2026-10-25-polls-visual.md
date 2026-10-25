# 2026-10-25 — Messages: polls, the card's visual spec (P-2 follow-up, slice 2)

## 2026-10-25 — A card at 16, marks at 3:1, and words for every state

```text
Design package: P-2 build plan, 4.1 to 4.3 (D1 to D10, D12, D25)
PR/commit:      claude/clubhouse-polls (#2362)
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The card is radius 16 (sheets stay 20) and up to 360 wide, and on a phone a
  poll's column takes that width rather than a bubble's 82%. Its edge is a full
  hairline.
- A 3 px level line at each row's foot carries the share at 3:1 (the soft fill
  alone is 1.1:1). The empty mark ring, the filled mark, its check and the
  picked row's ring all reach 3:1, light and dark.
- While open, only the viewer's own pick is stronger. Once final, the leader is
  filled and tagged "Most votes" (each "Tied" when several share it) and the
  rest recede. The fill moves on a curve, not a CSS spring, because votes
  retarget it mid-flight.
- A row deepens its tint on press instead of shrinking. Footer links are 28 px
  to see and 44 px to a finger. The check settles on the release duration.
- Words for each state: "Poll closed · Final" (the sender) and "Voting ended ·
  Final" (time ran out); "Choose any that work" under a multi-answer question;
  counts blank at zero while open and "0" once final; "No votes yet", "No one
  voted", "Votes didn’t load". The last hour's countdown is in the warning
  colour. Faces drop first in a narrow card or at large Text Size.
- A poll reads as its glyph and question in a reply quote and the inbox row.

### Verification

- `messages-polls.test.tsx` (states); `clubhouse:css`.
