# 2026-10-25 — Ask thread: Messages look, the wheel, a live working state

## 2026-10-25 — Ask looks like Messages; the chat reads the team

```text
Design package: design/handoff v3 (unchanged); no owner board
                (owner direction in chat, 2026-10-25)
PR/commit:      branch agent/coachhelm-ask
Contract IDs:   none new (CH-13850, CH-13252 unchanged)
Actions:        none
Data impact:    none (read tools only)
Held items:     none
```

### Changed

- The coach's line is Messages' own green bubble with its lower-right tail;
  CoachHelm's answer is a raised card under its name with the Messages bubble's
  upper-left tail. Figures nest in the card on a subtle fill.
- The avatar is the GolfHelm wheel and ball (the sidebar mark, without the
  dimples and highlights that turn to mud at 28px) on a white disc, replacing
  the green Sparkles tile. While CoachHelm works the disc breathes on the live
  pulse.
- Working state: the live step's words carry the shared shimmer, with a pulsing
  dot; before any step arrives the line reads "Thinking" rather than a bare
  label. New steps fade in on the quick duration. No new durations, and streamed
  text still does not animate (both are pinned; changing either is the owner's
  call).
- The composer draws one focus ring, not two (the field inside the box no longer
  draws its own).
- New chat: four capability cards (chart, rank and compare, set a focus, plan
  practice), each starting a real conversation.
- The chat gains `get_team_rounds`, `get_tournaments` (while
  `golf_tournaments_v1` is on) and `get_qualifiers`; team rounds draw as a
  ranking and a weekly trend.
