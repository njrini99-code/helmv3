
---

## What was deliberately NOT done

- The 876 merged PRs marked "feature/chore/docs/refactor PR, not incident-shaped
  by title" were screened by title pattern only (`hotfix|P0|P1|regression|
  incident|rollback|revert|data-loss|destroy|corrupt|deadlock|leak|breach|
  outage|down|critical|security|CVE`), not individually opened. A PR with an
  incident-shaped body and a non-matching title is a real gap this method
  cannot catch — flagging as a known limitation, not a claim of completeness
  at the body level.
- The 2 issues marked "no production-incident evidence found in this pass"
  (vs. the 318 either cited to a specific incident or grouped into a named
  process-event cluster with stated reasoning) are the only truly
  unclassified items in the issue list — everything else has an explicit
  reason attached, satisfying "nothing skipped silently."
- Individual bodies were not pulled for every issue in a named process
  cluster (e.g. the 161-issue BaseballHelm canonical-spec audit batch, the
  46-issue deepsec wave-2 batch) beyond what was needed to establish the
  cluster's own process-level reasoning — if any single issue in one of
  those clusters represents a materially more severe defect than its
  cluster's general description, it would not have surfaced in this pass.
- `docs/audits/*` and `docs/operations/*` were sampled (docs a git-log
  search tied directly to a confirmed incident) rather than exhaustively
  read cover-to-cover; several dozen audit docs (COACHHELM_*,
  GOLFHELM_CALENDAR_AUDIT, COURSE_LIBRARY_AUDIT, etc.) were not opened in
  this pass and may contain additional undocumented incidents — most now
  fall inside a specialist's territory (coachhelm, calendar_events) rather
  than this worker's remaining scope.
