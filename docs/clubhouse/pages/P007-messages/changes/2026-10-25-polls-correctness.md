# 2026-10-25 — Messages: polls, correctness pass (P-2 follow-up, slice 1)

## 2026-10-25 — Votes that never get lost, and a card that tells the time

```text
Design package: P-2 build plan, 0.2 (D11, D13 to D17, D23, D24, D28)
PR/commit:      claude/clubhouse-polls (#2362)
Contract IDs:   CH-7030
Actions:        sendGolfPoll refuses an end more than 30 days out
Data impact:    none
Held items:     none new
```

### Changed

- Votes (`use-message-responses.ts`): pending is per poll, and a tap while
  that poll's vote is saving is written when the first one lands (latest
  wins). A refused write puts back only the viewer's own row, then reads again,
  so a vote someone else cast meanwhile stays. Realtime bursts re-read once,
  250 ms after the last change, and never twice at once. `vote` says why it
  failed (`closed`, `member`, `session`, `failed`); a closed poll is CH-7030.
- The card counts anyone who voted and has since left the group, so it never
  reads "9 of 8", and reads "Everyone voted" when nobody is waiting.
- The last hour counts down ("Ends in 42 min", "Ends in under a minute"), and
  each card sets a timer to its exact end, so it turns final on time.
- Single-answer keyboard: one tab stop, arrows move focus and never vote, Space
  or Enter votes.
- A long press that opened a message's actions on the phone is not also a vote.
- The inbox row and search read a poll's copy strictly (first line "Poll: ",
  numbered choices, last line "Vote in GolfHelm."); a typed message that only
  starts "Poll: " keeps its lines. A poll hit reads "Poll: Q · A, B", and a hit
  only in the footer is dropped.
- An end more than 30 days out is refused.

### Verification

- `use-message-responses.test.tsx`, `messages-polls.test.tsx`,
  `message-polls.test.ts`, `messages.test.tsx` › CH-7030.
