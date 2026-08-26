# Qualifiers change ledger

## 2026-08-23 — make qualifier round caps explicit and non-regressive

- App/UX SHA: pending commit on PR #1605; not deployed.
- `createGolfQualifier()` now includes `num_rounds` in its initial
  `golf_qualifiers` INSERT instead of creating a one-round qualifier and then
  attempting a best-effort follow-up update.
- The server rejects a missing round cap, and the coach creation screen requires
  a deliberate acknowledgement before a one-round qualifier can be created.
- Why: a failed second write could return a successful creation response while
  silently capping all entered players at one completed round.
- Production database: `guard_golf_qualifier_round_caps` is applied. It enforces
  the valid 1–50 range and refuses to lower a cap below a submitted or
  in-progress qualifier round. It does not change status, scores, or entries.

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
