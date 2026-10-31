# 2026-10-29 — Initials use letters only

## 2026-10-29 — `initials()` skips punctuation

```text
Design package: none (owner's Team Channel screenshot: the coach read "C(")
PR/commit:      #2409
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `lib/format.ts` `initials()` keeps letters only (`\p{L}`) in each word, so
  "Coach (Demo)" reads CD, not C(, and a word with no letters is skipped. This
  reaches every Clubhouse avatar.

### Verification

- `lib/__tests__/names.test.ts` covers punctuation, accents, a lone name, an
  empty name and a name with no letters.
