# 2026-10-30 — PageIntro large

## 2026-10-30 — PageIntro takes large (F-0054)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0054; fix plan
                PR 9)
PR/commit:      claude/audit-fix-09-messages-calendar-craft (#2420)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- ui/Ledger.tsx PageIntro: large adds ch-large-title and data-ch-large-title
  to its heading, the same contract as ui/LargeTitle.tsx.

### Verification

- tournaments-eventform.test F-0054 and the large-title tests green.
