# 2026-11-12 — coachhelm

## 2026-11-12 — Ask's new chat on a desk puts the question first (Q2, direction A)

```text
Design package: Q2 pictures, direction A, the owner's pick (12 Nov 2026); handoff shots/q2/ (sheet.png, a.css)
PR/commit:      agent/preview-fixes
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The owner on the desk's new chat: "Cramped, basic, not airy or premium … We are the best app because we have this",
  and on its box: "I hate the chat box so much". Of two directions shown as pictures he picked A, the question first.
- Desk, coach and player (`Home.tsx`, `coachhelm-ask-v2.css`): the home fills the pane. The ball, a larger greeting
  (34) and its line are centred, the question box under them, the starters under the box as chips (the question alone,
  no arrow or tag, 44 tall), and what moved since Monday (a player's focus and their meter) at the foot as a quiet
  ruled list in the page's ink instead of the dark feature panel. Auto margins above the greeting and above the foot
  share the free height, so the greeting and box sit in the pane's middle; on a short window they fall to zero and the
  box stays under the greeting. The page is drawn in this order, so a keyboard reaches the box before the starters.
- The box (`coachhelm-ask.css`, the desk's new chat only): larger and rounder (the panel radius, the sheet elevation),
  its text two lines tall before it grows, the send 40, and its own +, Players and Any dates as quiet chips on the
  chip's resting fill (`--ch-chip-flat-bg`) with no ring; a set date range keeps its green ring.
- The Players picker keeps the rule from the 11 Nov preview (34697bd723): under the new-chat box while 240px are free
  there, else on the roomier side. With the box now mid-page it opens under it on a desk window, and still above when
  the room under it is short. A thread's box and the phone's open up.
- The skeleton (`AskSkeleton.tsx`) waits in the new home's shape and classes (ball, greeting, box, four chips, the foot)
  so nothing moves when the page lands; a player's skeleton has no chats column (`is-solo`), as the loaded page.
- The phone is unchanged: its new chat keeps the opener and its rows over the box the screen pins (the cardless pass),
  which A's centred box does not apply to.

- Repo-wide guards (12 Nov): a desk starter's pressed look reads `:active` only under a hover query, with the press
  controller's `[data-ch-pressed]` twin before it (B6); the home's width is `--ch-measure-reading`, not 760px (row 39);
  the picker opening above is `data-side="up"`, not `is-up`, a word the tone vocabulary keeps for verdicts (CONS-20).

### Verification

- `screens/coachhelm/chat/__tests__/ask-home-question-first.test.tsx`: the order (coach, player, no rounds, phone), the
  chips, the fold's rules (fill the pane, the two auto margins and no others, the 44 targets, the box's text not fixed
  in height, the resting fill, the picker's down rule), the skeleton's shape for a coach and a player. Nine of its 12
  cases fail on the previous code; the two phone cases and the picker's rule (kept as it was) pass on both.
- `coachhelm-ask-picker-room.test.tsx` (unchanged): under the box with room, above it at 80px for 23 rows.
- WebKit on the preview (agent/preview-fixes-ui with this change, c38559e7a8), light and dark, the question box's top and
  bottom edge against the window's height:

  | | 1440 x 900 | 1920 x 990 |
  |---|---|---|
  | Coach, chats open | 340 to 546 | 385 to 591 |
  | Coach, chats closed | 340 to 546 | 385 to 591 |
  | Player | 364 to 570 | 409 to 615 |
  | Skeleton (coach) | 340 to 546 | 385 to 591 |
  | Before this change (coach) | 775 to 947, below the fold | 775 to 947 |

  The page does not scroll in any of them (scroll height equals the pane), the safety line ends at 884 and 974, the
  skeleton's box lands on the loaded box to the pixel, and the Players picker opens under the box (554 to 850 at 1440).
  The phone is as it was. Shots: handoff shots/q2/built/.
