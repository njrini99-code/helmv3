# Phase 3: Testing & Documentation Review

## Test Coverage Findings

### Critical

**TEST-1: Zero Test Coverage for Calendar Event System**
- No test file exists for `createGolfEvent`, `updateGolfEvent`, `deleteGolfEvent` in `golf.ts`
- No test file for `EventDetailModal`, `MobileEventSheet`, `PremiumCalendarClient`, `MonthView`, `WeekView`
- The entire calendar subsystem — the feature with the most reported bugs — has zero automated tests
- Existing test infrastructure (Vitest + React Testing Library) is mature; `travel.test.ts` provides an excellent template

### High

**TEST-2: No Tests for Any of the 5 Confirmed Bugs**
- Bug 1 (Silent update success): No test verifies row count on mutations
- Bug 2 (allDay corruption): No test verifies form populates `allDay` from DB boolean
- Bug 3 (Player can mutate): No test verifies coach-only enforcement for update/delete
- Bug 4 (Time stripping): No test for `buildDateTimeString` with undefined time
- Bug 5 (Bare date shift): No test for timezone behavior of date-only strings

### Medium

**TEST-3: `buildDateTimeString` and `formatTimezoneOffset` Are Private**
- Cannot be imported from `'use server'` file. Must be duplicated for testing (same pattern as `golf-schemas.test.ts`)

**TEST-4: Existing Tests Don't Verify Mutation Payloads**
- `travel.test.ts` checks table name but not the actual data passed to `.insert()/.update()`

### Recommended Test File
`src/app/golf/actions/__tests__/golf-event-actions.test.ts` — single highest-leverage addition. Detailed test code provided for all 5 bugs.

---

## Documentation Findings

### High

**DOC-1: `buildDateTimeString` Missing Critical Warning on Bare-Date Behavior**
- No comment about what happens when `time` is undefined — returns bare date that shifts in timestamptz

**DOC-2: Event Edit Flow Not Documented Anywhere**
- `golfhelm-features.md` Feature 4 covers create/RSVP but says nothing about the edit path
- No file documents: form → action → DB → refresh flow, timezone handling, or attendee diff

**DOC-3: `golf_events.start_time` Dual-Use Not Documented**
- `golfhelm-database.md` lists columns but doesn't note that `start_time` stores either full timestamps (timed events) or bare dates (all-day events)

**DOC-4: Schema Mismatch Between Migration and Production**
- Migration 023 defines `start_date DATE` + `start_time TIME` but production uses `start_time TIMESTAMPTZ`. The conversion migration isn't tracked.

**DOC-5: Timezone Gotchas Absent from Feature 4 Known Gaps**
- Feature 4 is the only feature without a Known Gaps section — yet it has the most complex timezone handling

### Medium

**DOC-6: `GolfEventInput` Interface — No Field-Level Docs**
- Date format (YYYY-MM-DD), time format (HH:MM), timezoneOffset sign convention all undocumented

**DOC-7: `allDay` Flag Inference Bug — No Warning Comment**
- EventDetailModal derives allDay from parsing, ignoring `event.all_day`. No comment warns about this.

**DOC-8: Coach-Only Gate Missing from Update/Delete — No Comment**
- `createGolfEvent` correctly blocks players with an explicit message; update/delete silently allow them

**DOC-9: Feature 4 Key Files Table Lists Wrong Action File**
- Lists `event-lifecycle.ts` but CRUD functions are in `golf.ts`

**DOC-10: `all_day` Column Interaction with `start_time` Not Documented**
- Database docs show `all_day | boolean | YES | false` with no behavioral notes

### Low

**DOC-11**: `MobileEventFormData` missing fields vs desktop — no explanation
**DOC-12**: `GolfEventInsertData` index signature `[key: string]: unknown` undocumented
**DOC-13**: `timezoneOffset` sign convention undocumented
**DOC-14**: RLS policy history for `golf_events` not documented in database reference
