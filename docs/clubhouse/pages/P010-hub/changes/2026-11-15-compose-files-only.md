# 2026-11-15 — hub

## 2026-11-15 — New announcement attaches files only, never a practice plan

```text
Design package: none (release readiness: the N-10 reader shim, Clubhouse half)
PR/commit:      merge train 3 (agent/merge-train-3), carrying #2504
Contract IDs:   none new (CH-10311 and CH-10314 keep their wording)
Actions:        none (createEnrichedAnnouncement already refuses a plan row)
Data impact:    none (read path only)
Held items:     none; 20261026010400 and 010600 are applied in production
```

### Changed

- Team Hub reads practice-plan rows (`getDocuments(teamId, { plans: true })`),
  so a published plan now reaches New announcement's Attach from Documents.
  A plan is not a file: the picker leaves it out (`isAttachable`, by `planId`),
  it is not counted in the coach-only line (CH-10314), and a team whose
  Documents hold only plans reads "No documents yet" (CH-10311). A plan picked
  before a re-read is not sent.
- This replaces the Fairway announcement picker's `file_url IS NOT NULL`
  filter (#2504), which went with Fairway (#2527). Before it, a coach who
  picked a plan got "Some attached files aren't in your team's documents"
  from the server check.

### Verification

- `__tests__/hub.test.tsx` ("N-10 a practice plan filed in Documents is not
  a file"), which fails without the filter.
