# 2026-11-12 — coachhelm

## 2026-11-12 — Ask answers from the 12 Nov preview and the staging check

```text
Design package: none (bug fixes from the owner's preview and a staging real-answer check)
PR/commit:      agent/preview-fixes, 567719cc25, 0f2913da35, f43dda9c77 and the show_visual ref fix
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Fixed

- A visual with one bad block draws the rest; what was not drawn is reported, not dropped silently.
- The step line counts this season's rounds and names last season's after ("against 76 earlier").
- Sources are named for what they read ("Team stats, this season", "This season against last"), never "Read".
- A list read (the calendar) beside a visual stays in Sources, not as a card under it.
- A team beside one player is not drawn as a one-column comparison.
- show_visual takes a read by the name it was cited with (`read:e1`) as well as `e1`; on staging two of four
  chart questions failed on that and answered in words.
- #16: an answer's lead is its first two sentences, not the whole first paragraph. The model writes one paragraph, so
  every answer was set at headline size. The cut is made as the words arrive (`splitLead`, Prose.tsx), so no drawn
  word changes size; a decimal point and "vs." are never a sentence end.
- W48: figures are given to one decimal (the rule said "as the read gave them", and reads carry two), and an
  answer never ends on a question. The four-sentence rule stands; not yet re-measured on live answers.
- W49: a team read that lists every player on one measure draws the players as a ranking and the team's figures as
  their own card, not a one-column comparison table. The comparison's hidden caption no longer repeats the card's
  title ("…rounds.: 7 players"), and the open arrow sits beside the player's name.
- #17: a two-player comparison names both players in the scope line; its card shows the measures the question is
  about (tee, approach, putting, short game, scoring; the headline measures when it names none), with the whole read
  kept in Sources; and the next steps are the server's suggestions for the answer, not putting work for the first
  player read.
- #6: opening a saved chat (`?c=`) waits in the thread's shape (the question, the answer's leaf, the docked composer),
  not as the new chat's home that the thread then replaced.
- A player marked as a test account (`golf_players.is_test`) is not on the roster Ask reads, so answers and the
  home's "Since Monday" do not name them. Staging's and production's test-named accounts are not marked yet.
