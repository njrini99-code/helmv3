# 2026-10-27 — Polish pass: Messages

## 2026-10-27 — The seen line is 44px wide to press

```text
Design package: none (production polish pass before launch; doctrine in .claude/rules/clubhouse.md)
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

- Measured in WebKit at 390 on the signed-in thread (42px before).
