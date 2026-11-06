# 2026-11-06 — P002

## 2026-11-06 — An iPhone turned sideways stays on the phone layout

```text
Design package: design-refresh/redesign-ui-sweep-2026-11-06
PR/commit:      agent/ch-primitives
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

This page's phone and desk `@media` rules use the two tests in
`lib/phone-query.ts`, so a landscape iPhone keeps the phone layout (MOB-SHELL-8).

Under the lane's flag the Latest rounds and Today rows no longer pull out 12px
to the page's edge, which left them 4px from their card (CRH-1, CRH-2).

Screenshots: in the PR body.
