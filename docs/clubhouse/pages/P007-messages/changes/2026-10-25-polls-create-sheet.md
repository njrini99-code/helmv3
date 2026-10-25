# 2026-10-25 — Messages: the poll create sheet (P-2 follow-up, slice 4)

## 2026-10-25 — Quick start, a Custom end on the team clock, a kept draft

```text
Design package: P-2 build plan, 4.4, D18 to D20; CHANGELOG-2026-10-25 P-02
PR/commit:      claude/clubhouse-polls (#2362)
Contract IDs:   CH-7031
Actions:        sendGolfPoll takes priorClientId and may answer earlierCopy
Data impact:    one more read on an edited retry (the earlier id, by key)
Held items:     none
```

### Changed

- Quick start: four static polls fill the empty form (Which van?, Can you
  make it?, Which days work?, Pick a time) and hide once anything is typed.
- Voting ends gains Custom: a date and a time on the team's clock
  (`zonedWallTimeToInstant`, `api.timeZone`), defaulting to today at 9:00 PM
  before 8:00 PM there, else tomorrow. A spring-forward gap moves forward and
  says so; a repeated fall-back time takes the first. The resolved line reads
  "Voting ends today at 9:00 PM" and re-reads once a minute. Past 30 days the
  sheet says "Pick an end time within 30 days."
- At a large Text Size, when the five segments stop fitting, the field draws
  one 44 px Menu row "Voting ends · No end".
- Cancel keeps the draft for the conversation for the session; Clear (in
  the sheet head, only when anything is filled) throws it away.
- Question counter from 20 characters left; Return moves to the next field;
  Cmd or Ctrl Enter sends; fields are read-only while sending; a problem marks
  its field `aria-invalid`.
- D19: no payload compare. An unedited retry keeps its id. An edited retry
  after a send that threw passes that send's id as `priorClientId`; if that
  copy landed, nothing posts and the sheet asks (CH-7031): Send this version
  (a new id) or Done.

### Verification

- `message-polls.test.ts` (wall time, gap, repeat, default end, quick start),
  action `message-polls.test.ts` (earlier copy), `messages-polls.test.tsx`
  (create sheet describe).
