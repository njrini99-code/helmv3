# 2026-10-25 — Messages: poll actions (P-2 follow-up, slice 5)

## 2026-10-25 — See votes, Remind, Share result, one menu on every message

```text
Design package: P-2 build plan, 4.6 to 4.8, 4.10, D26, D29, D30;
                CHANGELOG-2026-10-25 P-02
PR/commit:      claude/clubhouse-polls (#2362)
Contract IDs:   none new (CH-7020 now names the desktop menu too)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Remind N (a coach, an open poll, votes in, someone left): fills the
  composer as a reply to the poll, "Ben and Cal, can you vote in the poll
  when you get a chance?", plus the end when there is one. The viewer is out
  of the condition and the count; a draft already typed asks "Replace your
  draft?" first. The coach presses Send: nothing sends by itself.
- Share result (final, a vote in, the sender or a coach): the result as a
  reply, "Van A has it with 2 of the 3 who voted. Van B had 1."
- See votes: 44 px rows with a face, "You" first then by name, "Left the
  group" for a voter who left, a Final pill, and the coach's Remind in the
  footer. No vote times in v1.
- One menu on every message (desktop "More message actions"): own messages
  keep Edit and Delete; a poll offers See votes, Remind, Close poll, Share
  result, Reply, Copy poll and Delete by role and state; anyone else's text
  offers Reply and Copy. The phone's long-press sheet gains the same poll
  rows. Right click still opens the reaction bar on every message.
- Voter faces on rows are gone (owner call open; default B, the count only;
  names live in See votes).

### Verification

- `message-polls.test.ts` (remind and result drafts), `messages-polls.test.tsx`
  (poll actions describe, See votes), `messages.test.tsx` (D30 Remind into
  the composer, D26 menu).
