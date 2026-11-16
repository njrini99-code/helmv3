# P011 Rounds — Changelog

## 2026-11-15 — New round: the form in the first paint

```text
Design package: none (production audit 2026-11-15, PMAC-03, H393-154)
PR/commit: claude/project-thread-10vtd2 (worker F, load)
Contract IDs: CH-11211, CH-11407 (unchanged meaning)
Actions: getPlayerQualifiers and getNextQualifierRoundNumber are called by the route on the server instead of from the browser
Data impact: none (the same two reads, now on the server and all at once; no write)
Held items: the device-day frame (below); the phone measurement (below)
```

### Changed

- `routes/round-new.tsx`: the route reads the player's open qualifiers and each
  one's next round (`data/setup-qualifiers.ts`, new) beside CoachHelm's two
  data-prompt reads, all three at once, and hands the list to the screen. Every
  open qualifier's next round is asked at once on the server; a read that does
  not answer in 6 s (`QUALIFIER_READ_MS`, as before) counts as not loaded
  (CH-11211) and is logged.
- `screens/rounds/entry/NewRound.tsx`: takes `qualifiers` from the route and no
  longer reads them after hydration. The four skeleton slabs (CH-11407) stood
  until both browser reads had answered, about 3 s on a direct load (two server
  actions, which the browser runs one after another). Now the skeleton covers
  only the device's day, which is known after hydration: one frame on a push
  from Home.
- `screens/rounds/entry/setup-qualifiers.ts` (new): the list's rules
  (`readSetupQualifiers`, `qualifierBlockedReason`, `QUALIFIER_READ_MS`), moved
  out of `setup-reads.ts` unchanged so the server loader uses them;
  `setup-reads.ts` re-exports the two the old callers read. Every setup and
  shot-tracking field is as it was.
- Try again on "Your qualifiers didn’t load" (CH-11211) refreshes the page,
  which now reads the list again; before, the list was read once at mount, so a
  refresh did not read it again.

### Why

- PMAC-03: New round is the player's most important action and drew 3 s of slabs
  before its form (three direct loads: 2.9, 3.2 and 3.2 s, Chromium emulation of
  iPhone 15 Pro, production).

### Verification

- Unit (vitest): `data/__tests__/setup-qualifiers.test.ts` (new: next rounds
  asked at once, a list that never answers is null after the wait, failures
  logged), `routes/__tests__/round-prompts-routes.test.tsx` (the three route
  reads start together; null handed down), `round-entry-wiring.test.tsx` (110103
  now pins the form at once with the engine's own read hanging, and a null list
  showing CH-11211; the CH-11907, CH-11014, CH-11015 and `?qualifier=` cases
  read the list as the route does), `round-entry-routes.test.tsx` (CH-11211
  rules through the server loader), `round-lifecycle-parity.test.tsx`,
  `round-type-review.test.tsx`.
- Not measured here (no build or browser in this container): a direct load of
  `/golf/dashboard/rounds/new` as a player should show the step row and Browse
  courses at hydration, not 3 s later (W tier on the phone preset; the 2.5 s
  largest paint check is D or S). The server reads add their time to the page's
  first byte: check time to first byte stays near the other player pages.
