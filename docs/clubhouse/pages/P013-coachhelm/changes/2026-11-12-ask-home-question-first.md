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
- The Players picker on the desk's new chat opens down when the whole list fits below the box and up when it does not
  (`pickerSide`, `usePickerRoom`): the box now sits mid-page, so a short window would have squeezed a list opened down.
  A thread's box and the phone's still open up.
- The skeleton (`AskSkeleton.tsx`) waits in the new home's shape and classes (ball, greeting, box, four chips, the foot)
  so nothing moves when the page lands; a player's skeleton has no chats column (`is-solo`), as the loaded page.
- The phone is unchanged: its new chat keeps the opener and its rows over the box the screen pins (the cardless pass),
  which A's centred box does not apply to.

### Verification

- `screens/coachhelm/chat/__tests__/ask-home-question-first.test.tsx`: the order (coach, player, no rounds, phone), the
  chips, the fold's rules (fill the pane, the two auto margins and no others, the 44 targets, the box's text not fixed
  in height, the resting fill), `pickerSide`, the skeleton's shape for a coach and a player. 15 of its 17 cases fail on
  the previous code; the two phone cases pass on both, as they should.
- `coachhelm-ask-picker-room.test.tsx`: the desk's new-chat picker opens down with room for the list and up when the
  box sits low.
