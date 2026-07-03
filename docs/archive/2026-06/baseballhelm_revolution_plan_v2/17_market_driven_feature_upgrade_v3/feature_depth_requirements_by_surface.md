# Feature Depth Requirements By Surface

This file defines what "enhanced enough" means. The product is not complete if these surfaces are just cards with vague copy.

## Command Center

Must include:

- Signal Inbox with source-backed items
- Today schedule and event acknowledgement status
- practice publish status
- availability/readiness board
- import warnings
- postgame review status
- upcoming travel/class conflict highlights
- AI Daily Brief with source drawer

Must not include:

- vanity charts with no action
- generic "team health" without sources
- recruiting lead widgets in Phase 1 default view

Enhanced behavior:

- Each signal has owner, urgency, source, and next action.
- Coach can convert signal to task, practice block, note, or meeting topic.
- Dismissed signals stay dismissed and record who dismissed them.

## Player Today

Must include:

- next event
- required acknowledgements
- check-in action
- lift/practice assignment
- player-visible development focus
- travel/class reminders

Enhanced behavior:

- player sees exact action, due time, and status
- no staff-only wording
- player can acknowledge, complete, or ask for help

## Player Profile

Must include:

- identity and status
- source-labeled stats
- development goals-lite
- timeline
- availability/performance summary
- meeting mode
- notes with visibility

Enhanced behavior:

- every timeline item has source and visibility
- staff can filter by game/practice/performance/academic/travel/note/AI
- meeting mode turns timeline into action recommendations

## Import Center

Must include:

- import dossier page
- source trust badge
- field mapping
- player matching
- row validation
- warnings/errors split
- affected objects
- rollback

Enhanced behavior:

- same file warning via hash
- low-confidence match queue
- jersey mismatch detection
- inactive player warning
- import history by source/type

## Practice Planner

Must include:

- calendar-linked practice
- focus
- blocks/stations
- staff owners
- player groups
- attendance
- recap
- source-backed AI suggestion

Enhanced behavior:

- convert signal to practice block
- player view only shows relevant groups/details
- completed practice writes timeline events and report data

## Stats Center

Must include:

- official vs development split
- game logs
- season summaries
- import/source labels
- missing stat import status
- stat conflicts/anomalies

Enhanced behavior:

- postgame action review
- generate recap from approved stats
- recommend practice focus only after source review

## Performance Lite

Must include:

- lift assignment/result import
- completion/compliance
- wellness/check-in summary
- availability status
- strength staff role

Enhanced behavior:

- readiness/availability flags explain source and uncertainty
- limitation affects practice plan and Command Center
- no medical diagnosis language

## Staff Decision Room

Must include:

- agenda from signals
- top player changes
- practice attendance
- lift compliance
- availability
- academic/travel conflicts
- open tasks
- source-backed action recommendations

Enhanced behavior:

- convert agenda item to task/note/practice adjustment
- export/copy summary
- meeting outcomes write timeline/task records

## AI Layer

Must include:

- source refs
- confidence
- visibility
- disposition
- recommended action
- staleness/expiration

Must not include:

- chat-first product center
- unsupported predictions
- medical claims
- hidden private-note leakage
