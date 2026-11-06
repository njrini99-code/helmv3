# 2026-11-06 — shared

## 2026-11-06 — Redesign sweep: shared primitives, phone shell, motion floor

```text
Design package: design-refresh/redesign-ui-sweep-2026-11-06
PR/commit:      agent/ch-primitives
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

New: `lib/phone-query.ts`, `lib/chart-geometry.ts` (`clampRadius`, `scaleToBox`,
`placeLabels`), `ui/charts/ChartText.tsx`, and a development warning for a Surface
inside a Surface.

Reduce Motion: every transition narrows to a 180ms opacity fade. A keyframe opts
in with `--ch-rm-animation` (MOT-01). Sheets leave at the release duration
(MOT-37), and a toast's exit is a transform (MOT-38).

Phone shell: the MOB-SHELL findings. The keyboard height reads `clientHeight`,
back labels shorten, toasts and the new-version notice clear the Resume pill,
Text Size is set before paint and is read again later, the status area and the
bar's pull are the frame's green, and the app icons are opaque.

Screenshots: in the PR body.
