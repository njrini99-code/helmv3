# 2026-10-24 — Calendar: the coach's More on the phone

## 2026-10-24 — The phone gets the coach's More menu

```text
Design package: none (Clubhouse A+ handoff, section 0.4 Calendar: "the coach's More menu is desktop only")
PR/commit:      agent/aplus-lane-d
Contract IDs:   61901
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- On the phone a coach has a More key (Ellipsis) after the Day / Month / List
  switch. It opens desktop's More items in a bottom sheet (ui/ContextMenu's
  sheet, now exported as `MenuSheet`): Add to calendar app, Add busy time, and
  Overlaps · n when there are any. Print stays desktop only. The top bar keeps
  its one action, New event (B10.1). A player's phone is unchanged.

### Why

- Add busy time and Overlaps could only be reached on desktop.
- The phone top bar takes one trailing action (ui/PhoneBar), so More sits on the
  title's line.

### Verification

- calendar.test › row 81 (the items without Print; Add busy time opens its sheet;
  none for a player). Wants an iPhone look at 390px: the switch and More share
  the month's line.
