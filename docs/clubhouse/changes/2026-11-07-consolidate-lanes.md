# 2026-11-07 — shared

## 2026-11-07 — The Nov 5-6 lanes join main

```text
Design package: none
PR/commit:      agent/ch-consolidate
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

The Ask, Practice, Messages, Stats, Root cause, Home/Classes/Roster and motion-token
lanes that were built on branches from 5 and 6 Nov are merged onto main as of
#2495. Shared pieces they changed: `lib/motion.ts` (motion on tokens), the new
`lib/type-k.ts`, `ui/sheet-keyboard.ts` (sheets fit Safari's keyboard) and the
styles for controls, base, tokens, messages, quick chat and Practice.

Where a lane met a decision already on main, main's wins: no CoachHelm Brief tab,
no sidebar next-event card, no coach desktop week list or Leaderboard, the Team
player sheet stays a peek, and `Swap` takes no `resize`. The Practice entry
joins the nav when `golf_practice_plans` is on, which the live layout reads.
