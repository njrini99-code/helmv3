# 2026-10-24 — Classes: the top bar's plus (B10.1)

## 2026-10-24 — Add class is the phone top bar's plus

```text
Design package: none (Clubhouse A+ handoff, B10.1)
PR/commit:      agent/aplus-lane-d
Contract IDs:   121901, CH-12201
Actions:        none
Data impact:    none
Held items:     the Add class / Add a class / Add classes wording stays with the
                owner (CONS-38)
```

### Changed

- On the phone, Add class is the top bar's trailing plus (in the bell's place,
  as on Calendar) and the head keeps only Import schedule. The plus shows when
  the head's button would: not on a first run, whose empty state carries the
  add, and still on a failed read (CH-12201). Desktop is unchanged.

### Why

- B10.1: one rule for the phone's create action, the top bar's plus, so it is in
  the same place on every section.

### Verification

- classes.test › 121901 (the plus opens Add a class; none on a first run; kept
  on a failed read). Wants an iPhone look: the plus in the bell's place.
