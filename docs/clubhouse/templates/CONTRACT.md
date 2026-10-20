# <PXXX> — Page Contract

<!--
Machine-checked by clubhouse:check (scripts/clubhouse/registry.mjs, D-69):
- all 25 "## NN — Name" headings, in this format;
- each has exactly one line "Status: DEFINED" or "Status: N/A — <reason>";
- 02, 04, 06, 07, 08 and 18 are never N/A;
- a DEFINED section names at least one Bridge ID (this page's, or the shell's P001 IDs it inherits);
- every Bridge ID of this page (config/clubhouse/bridge-contracts.json) is listed under its category.
A contract with no catalog row (success, observability, tests) is added to
bridge-contracts.json by hand with the next free item, without a chCode, and a
`tests` list naming its Bridge ID; without one it stays reserved.
Write the Status line and notes only: `node scripts/clubhouse/registry.mjs sync`
writes each section's table from the registry and keeps the notes.
-->

## 01 — Default / core UI
Status:
Contracts:

## 02 — Initial loading / skeleton
Status:
Contracts:

## 03 — Background loading / refresh
Status:
Contracts:

## 04 — Empty
Status:
Contracts:

## 05 — Validation
Status:
Contracts:

## 06 — Server / system error
Status:
Contracts:

## 07 — Network / offline
Status:
Contracts:

## 08 — Permission / authorization
Status:
Contracts:

## 09 — Success
Status:
Contracts:

## 10 — Warning
Status:
Contracts:

## 11 — Destructive
Status:
Contracts:

## 12 — State preservation
Status:
Contracts:

## 13 — Optimistic UI
Status:
Contracts:

## 14 — Retry / recovery
Status:
Contracts:

## 15 — Data freshness / sync
Status:
Contracts:

## 16 — Micro animation
Status:
Contracts:

## 17 — Haptic
Status:
Contracts:

## 18 — Accessibility
Status:
Contracts:

## 19 — Responsive
Status:
Contracts:

## 20 — Keyboard / input
Status:
Contracts:

## 21 — Performance
Status:
Contracts:

## 22 — Analytics
Status:
Contracts:

## 23 — Observability
Status:
Contracts:

## 24 — CI / automated tests
Status:
Contracts:

## 25 — Helm Bridge actions
Status:
Contracts:

---

## Contract entry template

```text
ID:
Name:
Meaning:
Trigger:
User-visible behavior:
State preserved:
Recovery:
Haptic:
Motion:
Accessibility:
Observability:
Related action:
Related test:
Notes:
```

Use `N/A — <reason>` when genuinely not applicable.
