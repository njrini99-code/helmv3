# 2026-10-27 — Polish pass: Messages

## 2026-10-27 — The seen line is 44px wide to press

```text
Design package: none (production polish pass;
                doctrine in .claude/rules/clubhouse.md)
PR/commit:      agent/clubhouse-polish
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The phone tap box behind "Sent" / "Seen" under the last message grew 8px each
  side, so a short word gave 42px. It grows 10px each side now: "Sent" is 46px
  (`styles/messages.css` `.ch-ms-seen.is-open::after`).

### Why

- 44px is the touch floor.

### Verification

- Before: 42px wide, measured in WebKit at 390 on the signed-in thread ("Sent"
  is 26px plus 8px each side). After: 26 + 10 + 10 = 46px from the rule; the
  preview's threads do not draw this state, so the after was not re-measured.
