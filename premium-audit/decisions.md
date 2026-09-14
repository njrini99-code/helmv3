# A00 decisions — mobile UI/UX audit run

- **D1 — Baseline re-pinned.** The plan pins `4674b38e`; that is 5 commits stale. A00 pins
  `3c90f9f174ac103af5fafc600aebecd98243decc` (current `origin/main`). All 30 entry-point paths
  named in the plan's Sections 6 and 19 were verified present at this SHA, so the Section 6 file
  maps are usable verbatim.
- **D2 — Scope: mobile UI/UX.** Lanes A01–A09, A11, A12 run. **A10 (database invariants, RLS,
  migrations) is not run** — it is not UI/UX and DB work is governed separately in this repo.
  A11 runs scoped to render/interaction responsiveness and recurring-work inventory, not
  server/query cost.
- **D3 — Messaging is excluded, not ignored.** A separate session and worktree own the Messages
  tab. Every lane routes messaging observations to a `## Messaging referrals` section of its own
  report; no lane proposes a messaging repair.
- **D4 — Audit phase is read-only.** No lane edits any source file. The only permitted writes are
  `premium-audit/lanes/<lane>/**`. This is the whole lease registry for the read phase.
- **D5 — Evidence labels are restricted this phase.** No device, no simulator, no screenshots, no
  authenticated fixtures. `OBSERVED` and `REPRODUCED` are unavailable; lanes use `SOURCE`, `RISK`,
  `PROPOSAL`, `NOT_RUN`/`BLOCKED` only.
- **D6 — Repair slots are not promised.** Six checkouts already exist against a default cap of
  three mutation workspaces. The read phase needs none; repair scheduling rechecks the budget.
