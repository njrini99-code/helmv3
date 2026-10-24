# 2026-10-24 — Screen gaps (Clubhouse A+ lane D)

## 2026-10-24 — Calm failure copy: templates, no guessed causes (B10.3, CONS-6)

```text
Design package: none (Clubhouse A+ handoff, B10.3 and CONS-6)
PR/commit:      agent/aplus-lane-d
Contract IDs:   CH-1204, CH-1206, CH-1209, CH-1210, CH-12002, CH-12006, CH-12203
Actions:        none
Data impact:    none
Held items:     "Retry sync" and "Retry send" stay: they name a different action
                than the read's Try again
```

### Changed

- `ui/Notices.tsx` has the failure templates, `FAILURE_COPY`: a read that
  failed ("… didn’t load. Nothing you saved is lost. Try again."), a part that
  couldn’t be drawn ("The rest of the page is fine. Try again."), a whole page
  ("Nothing you saved is lost. Try again.") and offline (the CH-1905 line).
- The page notice (CH-1209), the section and section-group notices (CH-1210 and
  every SectionBoundary), the route error's unknown and busy bodies (CH-1206,
  CH-1204) and ClubhouseRouteError's message use them. None says "reported
  automatically" or guesses at a cause any more.
- Classes' failure hints beside a Try again button say "Try again", not
  "Retry to…" (CONS-6 leftovers from the #2361 audit).

### Why

- B10.3: a failure says what didn’t happen and what to do. Nobody on the page
  can act on "it was reported", and a guess ("usually clears on its own") is
  often wrong.

### Verification

- error-copy.test.ts now scans every folder (shell and ui included) for
  "reported automatically" and "usually clears", bans a "Retry to" hint, and
  pins the templates. shell, states, classes and coachhelm-ask tests updated to
  the new words.
