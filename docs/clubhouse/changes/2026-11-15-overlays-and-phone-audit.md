# 2026-11-15 — one motion for every overlay, and the phone audit's shared fixes

## 2026-11-15 — sheets, menus, palette, alerts and toasts move one way; shared controls are named by what they show

```text
Design package: none (production audit 2026-11-15, CLUBHOUSE-PROD-AUDIT-FINAL.md, Batch 7 and the cross-app rows)
PR/commit:      claude/project-thread-7ygzj3 (QUEUE pa-ovl-01 to pa-ovl-12)
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- Sheets (`ui/Modal.tsx`, `ui/FormSheet.tsx`, `lib/dialog-lifetime.ts`, `lib/sheet-drag.ts`): rise over 520ms and
  leave over 280ms on the sheet curve; the dim comes up over 260ms, linear; a drag closes past a quarter of the sheet
  or a 0.4 px/ms flick. The account sheet is the shared Modal. On the keyboard the panel rides up by `translate` on the
  keyboard's beat and curve instead of jumping by a margin (OVL-02). A form sheet on a desktop is a centred card that
  pops and fades, with no drag (OVL-04). A picker sheet opened from inside another sheet dims at half strength (OVL-05).
- Menus, popovers, pickers, tooltips and hover cards (`lib/menu-motion.ts`, `ui/Menu.tsx`, `ui/Tooltip.tsx`,
  `ui/Peek.tsx`): open over 180ms from .96 at the anchor corner, leave over 110ms to .98; a menu opened by its key
  focuses the list (MENU-01); `aria-controls` only while the menu is mounted (PMAC-13). A long press opens the shared
  context menu under the row it pressed, not a sheet (`ui/ContextMenu.tsx`, OVL-06).
- Menu rows, action-sheet buttons, the Messages menu and attach rows and the peek actions take the press wash
  (`--ch-sel`, motion 3.8) on a press; a menu row reached by the keys shows the wash and a 2px focus ring (MENU-04).
  Until the motion branch lands `--ch-sel`, the wash is today's press well.
- The palette and alerts come in over 180ms and leave over 110ms through the one `ch-pop` keyframe (`--ch-pop-from`).
- Toasts (`ui/Toast.tsx`): rise 8px over 260ms, leave over 180ms, stay 2.4s; an Undo or Retry 10s; an error until
  closed (NP-06).
- Names (WCAG 2.5.3): `ui/SearchField.tsx` puts its label's words in the label (MAC-20); `ui/ScoreMark.tsx` draws only
  (no image role) inside a named button or link (MAC-20); `shell/section-switch.tsx` moves the "something new" badge
  to the button's description, out of the heading (PMAC-13).
- Shell: the skip link sits in a landmark of its own and the phone dock is a labelled region (MAC-20).
  `lib/document-title.ts` names the tab for a pushed phone screen.
- Tap targets: small keys reach 44 by 44 on the phone without changing how they are drawn (calendar, class status,
  onboarding, CoachHelm plan and file, rounds, roster, standing).
- `styles/shell.css`: the desktop canvas keeps a stable scrollbar gutter; `src/app/layout.tsx` asks browsers that honour
  it to resize content for the keyboard (SYS-09).

### Why

- The 15 Nov production audit (S3.2 to S3.9): four overlay families moved on four timings, sheets jumped on the
  keyboard, a desktop form sheet was a bare browser dialog, and screen readers met names that disagreed with the screen.

### Verification

- Unit (jsdom): `__tests__/motion-physics.test.tsx` (sheet drag, keyboard ride), `__tests__/toast-timers.test.tsx`,
  `ui/__tests__/context-menu.test.tsx` (touch hold anchors), `ui/__tests__/hovercard-exit.test.tsx`, the screens' name
  tests. A real-iPhone pass (tier D) is still owed for the keyboard ride and the sheet feel.
