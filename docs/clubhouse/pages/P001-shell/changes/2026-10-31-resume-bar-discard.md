# 2026-10-31 — Shell: discard from the Resume round bar

## 2026-10-31 — The Resume bar can discard the round (CH-1823, CH-1824)

```text
Design package: none (owner, 2026-10-31, on the phone: the bar kept showing a
                round started by mistake; "let me discard it")
PR/commit:      claude/round-bar-discard
Contract IDs:   CH-1823, CH-1824
Actions:        deleteInProgressRound (existing; no change)
Data impact:    deletes the player's own in-progress round on confirm, as
                the scorecard's discard does
Held items:     the desktop sidebar card (CH-1822) has no discard yet
```

### Changed

- Dock.tsx: the Resume pill holds the Resume link and an × that opens
  "Discard this round?" (the scorecard's CH-11515 wording). Confirmed, it
  runs discard-round.ts and refreshes the shell, so the bar goes.
- discard-round.ts: the scorecard's discard steps outside the scorecard:
  delete on the server, then clear the device copy, mark the round
  discarded, and drop its queued submit. A refusal clears nothing.
- data/shell.ts: roundInProgress carries the player id the device copy is
  keyed by.
- shell.css: .ch-resume is the pill; .ch-resume__link and .ch-resume__x
  sit inside it.

### Verification

- discard-round.test (3), shell-dock.test and phone-shell-gestures.test
  (38) pass.
