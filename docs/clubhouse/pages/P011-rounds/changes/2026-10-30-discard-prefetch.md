# 2026-10-30 — Rounds: Discard lands at once

## 2026-10-30 — Rounds is fetched when the discard question opens (F-0045)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0045; fix plan
                PR 7)
PR/commit:      claude/audit-fix-07-speed (#2418)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- round-sheets.tsx ExitSheet takes onConfirmOpen; RoundRuntime prefetches the
  Rounds library when the discard question opens, so the delete is the only
  wait. Discard stays asked-first and is not optimistic (it deletes every
  shot); shot data untouched.

### Verification

- exit-discard-prefetch.test (new): red before, green after; the rounds suites
  pass.
