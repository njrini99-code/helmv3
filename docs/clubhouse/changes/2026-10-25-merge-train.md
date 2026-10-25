# 2026-10-25 — A+ feature integration

## 2026-10-25 — Calendar, live rounds and class awareness together

```text
Design package: Existing A+ handoff, P-5, P-6, P-10 and Phase 3
PR/commit:      codex/finish-aplus-merge-train
Contract IDs:   Existing page contracts, regenerated from the catalog
Actions:        Existing tournament, live-share and class-status actions
Data impact:    All SQL remains held; no production changes
Held items:     Physical iPhone, native build and production rollout
```

### Changed

- Retained change marks while adding tournament-round controls and live
  indicators to Calendar. Qualifier old times use ink on paper, with ivory
  reserved for the filled tournament material.
- Scoped read receipts to the active thread and viewer. A failed new read
  cannot retain another chat’s receipts; late old-channel events are ignored.
- Combined Tournaments with the existing A+ primitives: honest empty states,
  accessible no-data marks, shared buttons, named avatar sizes, type roles,
  selected tokens, formatters and press-controller states.
- Reserved CH-16606 for the live card’s See all action; CH-16601 remains the
  tournament value-change motion contract. The live copy test covers its own
  deck within the shared catalog.
- Typed held tournament and live-round reads against their written schemas.
  The same request clients and RLS remain in use.
- Integrated Phase 3’s grabbable route push, parallel first-wave reads and
  native Reduce Transparency bridge. Device acceptance remains outstanding.
- Wrapped reference prose and corrected malformed catalog rows. No lint or
  test baseline was increased.

### Verification

- The first combined Clubhouse suite: 7,456 passed, 18 failed, one skipped.
  Focused reruns verify fixes for the reported failures.
- Type checks, registry and CSS checks are recorded in the integration PR.
- Browser evidence and CI results are recorded separately; production flags
  remain off and no migration is applied by this integration.
