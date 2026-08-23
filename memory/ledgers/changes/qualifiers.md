# Qualifiers change ledger

## 2026-08-22 — require manual qualifier completion

- Removed all automatic qualifier completion and the page-view lifecycle
  reconciliation. Qualifier dates and player progress are schedule/reporting
  metadata only.
- A submitted round can start an `upcoming` qualifier; only the coach's
  explicit completion action can close it.

## 2026-08-22 — superseded date-based lifecycle guard

- The earlier inclusive-date guard did not meet the product rule and was
  superseded by manual-only completion.
- Restored the affected production qualifiers from erroneous `completed`
  status after confirming entrants had rounds remaining.

## 2026-08-23 — enforce started-round identity at terminal submit

- SHA: pending commit on PR #1604; not deployed.
- Change: `submit_round_atomic` preserves `round_type`, `qualifier_id`, and a
  non-null round number instead of accepting stale client metadata. Its direct
  RPC guard rejects a manually closed qualifier, duplicate result number, and
  malformed/oversized legacy number; the database index is the final unique
  result backstop. Continue Round gives an old missing-number parent an
  explicit list of unused, server-derived numbers, so the safeguard does not
  leave the saved scorecard unfinishable.
- Why: the client action guard could not protect direct RPC calls or an older
  recovery payload.
