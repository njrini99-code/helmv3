# Fix packet 09 · speed

5 findings, 0 block the flag flip.

## F-0029 · S2 · after · P006
**Publishing an event takes 2.4 s, and the first of a session 5 to 14 s**

- Observed: W-001: 'Still saving…', listed between 5.2 and 13.7 s. W-002: 2368 ms to the Published toast. The button does show Publishing… at once.
- Expected: Optimistic placement within 150 ms.
- Fix: Place the event optimistically and close the sheet; move the cold-path work (likely notification fan-out) after the response.
- Files: src/clubhouse/screens/calendar/*
- Evidence: ev/P006/write-ev-after.png, writes.jsonl#W-001, writes.jsonl#W-002
- Acceptance: rerun the instrument named in the evidence; it must pass (SP write -> confirmed > 500 ms (D/F); 01 §3 cap).

## F-0032 · S2 · after · P002
**Coach Home takes 5.7 s to paint its main content on a cold open**

- Observed: LCP median 5748 ms (worst 5860), TBT 373; player Home 2368 ms.
- Expected: ≤ 2.5 s.
- Fix: Stream the slow coach-only Home section behind a SectionBoundary.
- Files: n/a
- Evidence: p7-perf/lean-speed/summary.json
- Acceptance: rerun the instrument named in the evidence; it must pass (SP LCP cold).

## F-0033 · S2 · after · P010
**Team Hub takes 6.4 s to paint on a cold open**

- Observed: LCP median 6432 ms; one warm run held a skeleton 3.2 s.
- Expected: ≤ 2.5 s.
- Fix: Stream the announcement list; defer read-receipt aggregates.
- Files: n/a
- Evidence: p7-perf/lean-speed/summary.json
- Acceptance: rerun the instrument named in the evidence; it must pass (SP LCP cold).

## F-0034 · S2 · after · P005
**Opening a player's stats from Home takes 2.3 s even when warm**

- Observed: Shell 135 ms, skeleton ~2 s, content 2317 ms median; My stats warm 239 ms.
- Expected: ≤ 700 ms.
- Fix: Prefetch the player read from Home rows or render the hero from row data.
- Files: n/a
- Evidence: p7-perf/lean-speed/summary.json
- Acceptance: rerun the instrument named in the evidence; it must pass (SP warm content; R5 1350 ms).

## F-0055 · S3 · after · P001
**Old addresses show a blank 'Opening…' canvas for up to 3.3 s**

- Observed: Blank-to-NotRebuilt 2176 / 2195 / 3280 ms (min / median / max, 7 landings).
- Expected: At most 2 s.
- Fix: Start the AliasWait timer once per address (src/clubhouse/shell/NotRebuilt.tsx:49-56).
- Files: src/clubhouse/shell/NotRebuilt.tsx
- Evidence: p1-crawl/p1-player/rows/courses--pro.json
- Acceptance: rerun the instrument named in the evidence; it must pass (CO-04 expected alias wait 2 s).
