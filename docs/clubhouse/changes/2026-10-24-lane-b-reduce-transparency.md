# 2026-10-24 — Reduce Transparency turns the hard-coded frosted surfaces solid (row 50)

## 2026-10-24 — solid fills under both the query and the attribute

```text
Design package: none (Clubhouse A+ handoff, row 50; lane B, logged by S1)
PR/commit:      208f8981c (agent/clubhouse-aplus-phase2, #2361)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     six tinted shadows on the green stage went back to their base text until their drops had a token
```

### Changed

- The setup dock, Track's frosted bar, the course view's two glass controls, onboarding's lock and rail, and Home's today tile get a solid fill under `prefers-reduced-transparency` and `html[data-reduce-transparency]` (the iOS app's bridge sets the attribute, wave 2).
- Five neutral outer shadows take the elevation levels. New reduce-transparency.test.ts.

### Why

- Row 50: with Reduce Transparency, frosted surfaces turn solid, not just unblurred.

### Verification

- reduce-transparency.test.ts; clubhouse:css 0 findings. Needs a look in light and dark; the in-app half needs the native bridge.
