# 2026-11-16 — Home's top joins the frame

## 2026-11-16 — `--ch-page-top-home-player` is the frame's eyebrow top

```text
Design package: none
PR/commit:      fix/home-desk-top-bar
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

`--ch-page-top-home-player` was 38px, held as built for the full head's double
rule. With Home on the tight head (P002, same day) it is
`calc(var(--ch-page-head-top) + 2px)`, so the date line's 18px and 4px gap put
the greeting's top on every page title's line. Only Home's desktop mains
(loaded, loading and first run) read it.
