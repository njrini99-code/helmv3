# 2026-10-24 — Coach Home (desktop): the week comes first

## 2026-10-24 — Today's events sit above the two cards of figures

```text
Design package: Coach Home v3 (decided) and coach-parity spec B; this changes
                v3's order, owner to confirm from WebKit shots
PR/commit:      agent/aplus-lane-d
Contract IDs:   20105 (kept: the team's game stays under the team's form)
Actions:        none
Data impact:    none
Held items:     owner confirmation of the order (Coach Home v3 is a decided
                design)
```

### Changed

- On desktop the sheet with This week (today's events and their replies) and
  the latest round now comes right after Waiting on you, before the team's form
  and the team's game. The latest round moves up with it, since the two share
  one sheet. The form opens with the page's 32px rhythm after the sheet. The
  phone is unchanged.

### Why

- A coach opening Home in the morning had to scroll past two cards of figures
  to see what was on today (A+ handoff, section 0.4 Home).

### Verification

- home.test › 20105 (the parts under the form; the week before both). Wants
  WebKit shots at 1280 and 1440 for the owner.
