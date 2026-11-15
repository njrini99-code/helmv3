# 2026-11-15 — four pages stop loading the whole Fairway barrel

## 2026-11-15 — What's new, Live, New round and Recover import `FeatureUnavailable` from its own file (MAC-11)

```text
Design package: none (production audit 2026-11-15, MAC-11 and N13-10, Batch 3 item 9)
PR/commit:      mot/load (d4d7ef6e8)
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     the after-build sizes (no build was run in this slice); CoachHelm's and Calendar's own large chunks
```

### Changed

- `app/golf/(dashboard)/dashboard/{whats-new,live,rounds/new,rounds/recover}/page.tsx`
  import `FeatureUnavailable` (the flag-off fallback) from
  `@/components/fairway/feedback/FeatureUnavailable` instead of the
  `@/components/fairway` barrel.

### Why

- An App Router page loads every client component its server modules import
  on first paint, whether or not it renders. Through the barrel, these four
  pages each loaded about 87 Fairway client modules: one chunk of about 240 KB
  gzipped that no other `/golf/dashboard` route loads. It was the largest part
  of the 512 KB chunk the audit found on What's new, Live and New round.

### Visible change

- None. The fallback renders the same component when a flag is off.

### Verification

- Before (build output of commit 1da9101b5, gzip level 9,
  `npm run clubhouse:js-budget -- --next <build>/.next --report-only`): rounds/new
  1269.6 KB, live 1178.0, rounds/recover 1174.1, whats-new 1160.6 total first-load
  JavaScript. The chunk that carries the barrel appears on these four routes only.
- After: not measured; expected about 240 KB less on each, to be read with the
  same command on the next build.
