# 2026-10-30 — Stats (team): Game detail reads retry

## 2026-10-30 — A failed CoachHelm read says so with Try again (F-0061)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0061; fix plan
                PR 4)
PR/commit:      claude/audit-fix-04-rounds-live-shot (#2415)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- GameDetail.tsx: CH-5215 is an inline notice with Try again (useRefresh)
  instead of a plain line asking to try later.

### Verification

- game-detail-reads.test updated: the notice, its title and its Try again.
