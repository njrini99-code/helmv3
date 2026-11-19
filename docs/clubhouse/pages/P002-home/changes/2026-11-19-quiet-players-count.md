# P002 Home — Changelog

## 2026-11-19 — The quiet-players line counts the never-posted apart

```text
Design package: none
PR/commit: agent/clubhouse-native-polish
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `screens/home/model.ts` `manyFlagged`: with some players never posted, the first sentence counts only those who have, with their days ("7 players haven't posted a round in 53 days. Audit hasn't posted one this season."), and adds "+" only when their days differ (F-13).

### Why

- Audit 2026-11-19 F-13: "8 players … 53+ days. Audit hasn't posted one" read as 8 + 1.

### Verification

- `screens/home/__tests__/quiet-unposted.test.ts` and `data/__tests__/quiet-players-named.test.ts`, updated on purpose to the new sentence.
- `npm run clubhouse:check`. WebKit before and after numbers are in the PR body.
