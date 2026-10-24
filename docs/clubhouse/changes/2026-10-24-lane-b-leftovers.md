# 2026-10-24 — Lane B leftovers: pills, pressed tints, inbox seams, the swipe tap, coin tints

## 2026-10-24 — defects left after lane B's passes, fixed where they were plain

```text
Design package: none (Clubhouse A+ handoff; FINISH_DIRECTIONS S1 item 6)
PR/commit:      agent/aplus-s1 (seams in fe519fe36)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     other fixed-height boxes that lost a leading equal to their height (.ch-rv-lie, .ch-more__count,
                .ch-rsu-qual__cta, .ch-rd-more__go, .ch-df-cal__h, desktop .ch-ask-hist__row) need a browser look
                first: centring an inline one would also grow its fill. Pressed tints lost under a selected or "on"
                state (.is-sel, .is-on, aria-current/pressed/checked rows) and decision K are owner calls. Roster's
                coaches and join requests draw coins by name (their ids are not the user id the rule wants).
```

### Changed

- Rounds' type pill (`.ch-rd-pill`) and the Hub trip steps (`.ch-hb-steps li`) centre their one line in their 20px and
  24px boxes again (the type pass had replaced the leading that filled them).
- The Ledger row (`.ch-lgr__row.is-link`, ui.css) and the Hub's read count (`.ch-hb-reads--open`): the hover rule sits
  before the pressed one, so a row pressed under the pointer shows its press tint, not its hover.
- The phone inbox's seams survive a row's opened sheets (in fe519fe36), with conv-row-seams.test.tsx.
- ui/SwipeRow.tsx: a tap on a revealed action is a fresh tap. A touch that moved fires no click, so the drag that opened
  the row left its swallow armed and the first tap on Delete or Unread was eaten. New ui/__tests__/SwipeRow.test.tsx
  covers the component's promises (inert actions, claim, vertical scroll, full swipe, rest open, tap to shut, cancel).
- Messages: the people pickers, the group's "To" chips and the conversation's People and Members rows give each coin
  the person's id (player id, else user id), so a person has one tint everywhere (B19).

### Why

- Lane B's leftovers in FINISH_DIRECTIONS S1 item 6.

### Verification

- one-line-boxes.test.ts, pressed-sweep.test.ts, conv-row-seams.test.tsx, SwipeRow.test.tsx, the Messages suites.
  Needs a look: the two pills, a desktop press on a Ledger row, and the swipe's first tap on an iPhone.
