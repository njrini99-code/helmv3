# 2026-10-30 — Calendar: night contrast

## 2026-10-30 — Inspector meta reads at 4.5:1 at night (F-0039)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0039; fix plan
                PR 3)
PR/commit:      claude/audit-fix-03-night-contrast (#2414)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- calendar.css: the inspector head meta on the green plate uses
  --ch-on-green-ink-meta instead of #bfd5c6; the Next chip is recessed (black
  at 0.18) instead of a third white wash, which took its meta under 4.5:1.

### Verification

- src/clubhouse/__tests__/contrast-tokens.test.ts (new APCA Lc and WCAG pairs,
  one per finding, plus an opacity-on-text ratchet): red on main, green after.
- calendar.css raw-shadow ratchet unchanged.
