# 2026-10-30 — Messages: inbox craft and silent opens

## 2026-10-30 — Preview on one line, Announcements on the edge, opening is silent (F-0051, F-0052, F-0071)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0051, F-0052,
                F-0071; fix plan PR 9)
PR/commit:      claude/audit-fix-09-messages-calendar-craft (#2420)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- MessagesView.tsx: the preview’s sender, poll glyph and text sit in one
  inline child (.ch-ms-row__prev), so the phone’s two-line clamp no longer
  stacks them (F-0052).
- messages.css (phone): .ch-msp .ch-ms-sec.is-ann { margin-inline: 0 }, so the
  Announcements card sits on the page edge (F-0051).
- Opening a conversation or a search hit is a plain navigation tap and is
  silent (owner decision 5 default, D-70). Catalog CH-7703 now reads "a
  reaction or a filter" (F-0071).

### Verification

- conv-row-seams.test gains F-0052, F-0071 and F-0051 cases: red on main,
  green after.
