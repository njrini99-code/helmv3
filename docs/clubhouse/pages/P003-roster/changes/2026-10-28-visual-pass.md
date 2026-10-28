# 2026-10-28 — Roster: visual pass (rows, status, targets, radii)

## 2026-10-28 — Pre-deploy visual and premium pass, area F

```text
Design package: visual-pass-2026-10-28 RUBRIC.md (P003 checklist, H6, H10,
                H13, H17), premium-research/team-tabs.md
PR/commit:      visual-pass-2026-10-28
Contract IDs:   none new (CH-3802, CH-3806 unchanged in meaning)
Actions:        none
Data impact:    none
Held items:     iPhone check of the phone row (36pt coin, 16pt name, chevron)
                at the largest Text Size; Safari check of the 44pt hit area
                on an email chip's remove key
```

### Changed

- Phone list rows (the coach's list and the player's read-only roster) follow
  the list checklist: a 36pt coin (was 40), the name at 16/600 (was 15), the
  tertiary meta and the tabular trailing figure as before, and, on the coach's
  rows, which open the player, the list chevron in quiet ink (ink-500). The
  phone skeleton draws the same coin, name height and chevron slot, so nothing
  shifts when the list arrives.
- Desktop player cards under All show the status as a word beside its dot
  ("Active", "Inactive"), never the colour alone (H13). Under Active or
  Inactive the dot stays hidden and the word is for VoiceOver, as before.
- The table's status pill reads on the 13 type role (it was raw `13px`), so it
  follows Text Size.
- "Needs a look" chips use the 28pt coin, so the initials stay at 11px or more.
- Invite sheet: the email chip's remove key keeps its 22px disc but takes a
  44pt hit area; on the phone, the team code's Copy and Send invite are 44pt.
  The email field's text input is 46 tall to the finger while it keeps its
  line, so tapping the box's padding still focuses it.
- Cards sit on the 16px card radius (player cards, the player panel, "Where
  the team sits"); the champagne accent rule across that plate's top edge is
  gone, its hairline ring alone frames it (no-rails revision).

### Verification

- Before: `/home/claude/vp/before/{light,dark}/{393,1280}/roster.png`,
  `/home/claude/vp/before-states-F/*/roster--*.png`. After:
  `/home/claude/vp/after-F/`.
- stylelint (clubhouse config) and eslint on the touched files; roster,
  roster-sort, native-nav and class-awareness-roster tests (the row test now
  allows the chevron's svg and checks it is hidden from VoiceOver).
