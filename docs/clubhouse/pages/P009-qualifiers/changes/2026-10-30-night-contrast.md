# 2026-10-30 — Qualifiers: night contrast

## 2026-10-30 — List counts and meta lose their opacity (F-0040)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0040; fix plan
                PR 3)
PR/commit:      claude/audit-fix-03-night-contrast (#2414)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- qualifiers.css: the two opacity: 0.8 rules on list counts and meta are gone;
  the inks alone carry the hierarchy (3.7:1 before, 4.5:1+ after).

### Verification

- src/clubhouse/__tests__/contrast-tokens.test.ts (new APCA Lc and WCAG pairs,
  one per finding, plus an opacity-on-text ratchet): red on main, green after.
