# 2026-11-12 — calendar

## 2026-11-12 — Month chips lead with the time; names in primary ink (W44)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md W44)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new (P-4 4.4 type key unchanged)
Actions:        none
Data impact:    none
Held items:     type-coloured fills for every month chip (see Why)
```

### Changed

- Desktop Month: a timed event's chip leads with its start, without the meridiem
  ("3:30 Range and wedges"), quieter than
  the name. All-day events and the tournament and qualifier chips are unchanged.
- The name of a minor event is primary ink (was secondary), so the month no
  longer reads as grey lines.

### Why

- Nick's walk (W44): events were grey dot lines cut after a few words.
- Not changed: W44 also asks for a type-coloured chip for every event. The
  month's type key (P-4 4.4) draws practice,
  meetings, travel and classes as dots and only tournaments and qualifiers as
  chips; filling every event is a change to
  that key, which is the owner's call. On staging every event drew the same grey
  dot because they are meetings or
  "other", the types that share the ink dot.

### Verification

- `screens/calendar/__tests__/month-time-first.test.tsx`; month, calendar and
  type-role tests pass.
