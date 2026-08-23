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
