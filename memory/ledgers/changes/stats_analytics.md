# Stats And Analytics change ledger

## 2026-08-25 — completed-round SG lifecycle capability

- Status: uncommitted local reliability repair; not deployed.
- Change: `recalculate_round_strokes_gained` now declares the existing
  narrowly-scoped `stats_cache` lifecycle capability before updating only its
  five derived strokes-gained columns on a completed round.
- Why: the database correctly rejected general edits to completed history, but
  the intended SG recalculation path had not identified itself as the allowed
  derived write and produced false post-submit failure alerts.
