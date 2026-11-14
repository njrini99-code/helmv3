# 2026-11-13 — Ask keeps its own misses and self-talk out of the answer

## 2026-11-13 — Retried steps read as retries; no self-talk headline; the team's day on "computed"

```text
Design package: none (coach audit, 13 Nov 2026, §3c Ask)
PR/commit:      agent/coach-fix-shell
Contract IDs:   none new
Actions:        none (the rules text changes: instructions.ts rule 8)
Data impact:    none
Held items:     none
```

### Changed

- A failed step followed by another step of the same tool reads as a retry
  ("One drawing was retried"), while that try runs and once it lands. Only a
  miss with nothing after it shows as failed. The progress card had printed
  "Couldn't build the visual" twice before the visual came.
- The answer's lead never opens with the model talking to itself. Rule 8 now
  says never to mention a slip it fixed ("Oops"), within the rules' token
  budget, and `withoutSelfTalk` takes one off the first text when the turn is
  drawn and when a stored turn is restored.
  An answer had led with "Oops, I added a stray key." A bare "Sorry, there are
  no rounds this season." states a finding and stays.
- "computed <day>" is that day in the team's zone (`useLightPlace().timeZone`
  into `evidenceBlocks`, `sourceLine`, `readRows`). At 11 PM Eastern on
  12 Nov it had said "computed Nov 13". A stamp at exactly midnight UTC is a
  date stored as a moment and is read as written.
