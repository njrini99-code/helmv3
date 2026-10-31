# 2026-10-24 — Three elevation levels, per-file shadow ratchets (row 40, partly)

## 2026-10-24 — reading, raised and overlay; floating folds into raised

```text
Design package: none (Clubhouse A+ handoff, row 40; lane B, logged by S1)
PR/commit:      4d69de28a (agent/clubhouse-aplus-phase2, #2361)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     the tinted drops were finished by S1 on 2026-10-24
                (2026-10-24-tinted-drops.md); the per-material named elevations
                (card, control, on-frame, mark, board, face, strip) stay
```

### Changed

- tokens.css names the three levels, light and dark; `--ch-elevation-floating`
  aliases raised and every sheet reads raised (26 uses, no visual change), as do
  `--ch-shadow-md` and the floating-focus stack.
- elevation-tokens.test.ts: the single total (352) becomes exact per-file
  ratchets for raw box-shadows and raw drops, plus the three-level pins.

### Why

- Row 40: three elevation levels, and a shadow can't move between files under
  one total.

### Verification

- elevation-tokens.test.ts. No visual change.
