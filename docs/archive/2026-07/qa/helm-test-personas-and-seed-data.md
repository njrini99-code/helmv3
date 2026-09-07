# Helm Test Personas and Seed Data

## Safety and target environment

Do not seed or reset the connected live production project. Provision an isolated Supabase branch/local project, apply the intended schema from a clean baseline, and run the deterministic seed there. Auth users are created by Node global setup with a service-role credential held only in the CI process; Playwright pages receive storage state, never the credential. Passwords are CI secrets and are not written to this document or repository.

## Minimum personas

| ID | Persona | Auth account | Role | Organization/team | Subscription fixture | Profile/data | Expected access | Forbidden access |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-00 | Unauthenticated visitor | None | None | None | N/A | N/A | Marketing/auth/demo/token pages | All authenticated routes/data |
| P-01 | Registered, onboarding incomplete | CI-created auth user | No product role/profile complete | None | None | Incomplete | Onboarding/password/account | Team dashboards |
| P-02 | Org A Golf head coach | coach.a@example.invalid | head_coach/primary | Raleigh Hawks / Women | Fixture paid-equivalent metadata only | Complete | All team coach features/CoachHelm | Org B and super-admin |
| P-03 | Org A Golf assistant coach | assistant.a@example.invalid | assistant_coach | Raleigh Hawks / Women | N/A | Complete | Team coach features allowed by product/RLS | Ownership/admin/Org B |
| P-04 | Org A Golf player Sam Carter | sam.a@example.invalid | player | Raleigh Hawks / Women | N/A | Complete stats | Own hub/rounds/stats/tasks/RSVP | Other players private data/Org B |
| P-05 | Org B Golf head coach | coach.b@example.invalid | head_coach/primary | Raleigh Hawks Academy / Women | Trial metadata fixture only | Complete | Org B coach features | Org A |
| P-06 | Org B Golf player Sam Carter | sam.b@example.invalid | player | Raleigh Hawks Academy / Women | N/A | Incomplete stats | Own Org B data | Org A |
| P-07 | Multi-team Golf head coach | multi.a@example.invalid | head_coach on two teams | Org A Women + Men | N/A | Complete | Team switch and both allowed teams | Org B |
| P-08 | Baseball primary coach | baseball.owner.a@example.invalid | primary/head | Raleigh Hawks Baseball | N/A | Complete | All Baseball capabilities | Org B |
| P-09 | Baseball scoped assistant | baseball.assistant.a@example.invalid | assistant; only manage_practice + player scope | Raleigh Hawks Baseball | N/A | Complete | Scoped practice/player actions | Stats/settings/unscoped players/Org B |
| P-10 | Baseball player | baseball.player.a@example.invalid | player | Raleigh Hawks Baseball | N/A | Complete | Own Today/messages/passport/stats | Coach-only notes/academics of others |
| P-11 | Lifting coach | lifting.coach.a@example.invalid | lifting coach | Org A lifting bridge | N/A | Complete | Programs/athletes/sessions | Org B |
| P-12 | Lifting athlete | lifting.athlete.a@example.invalid | athlete | Org A lifting bridge | N/A | Incomplete readiness | Own sessions/check-ins | Program management/other athletes |
| P-13 | Expired-invitation user | expired.invite@example.invalid | No active membership | Expired Org A invite | None | Complete auth only | Invite error/recovery | Team data |
| P-14 | Platform super-admin | admin.test@example.invalid | admin + allowlist | Cross-product | N/A | Complete | /admin and permitted Golf admin | Never used for normal role tests |

The role set covers all minimum personas requested. Parent/guest/suspended identities are not confirmed product roles; add them only after product intent is answered.

## Deterministic identifier namespace

| Fixture | Stable ID | Display name |
| --- | --- | --- |
| Organization A | 10000000-0000-4000-8000-000000000001 | Raleigh Hawks |
| Organization B | 10000000-0000-4000-8000-000000000002 | Raleigh Hawks Academy |
| Golf Team A Women | 20000000-0000-4000-8000-000000000011 | Raleigh Hawks Women |
| Golf Team A Men | 20000000-0000-4000-8000-000000000012 | Raleigh Hawks Men |
| Golf Team B Women | 20000000-0000-4000-8000-000000000021 | Raleigh Hawks Academy Women |
| Baseball Team A | 20000000-0000-4000-8000-000000000031 | Raleigh Hawks Baseball |
| Baseball Team B | 20000000-0000-4000-8000-000000000032 | Raleigh Hawks Academy Baseball |
| Golf Sam Carter A | 40000000-0000-4000-8000-000000000011 | Sam Carter |
| Golf Sam Carter B | 40000000-0000-4000-8000-000000000021 | Sam Carter |
| Baseball Sam Carter A | 40000000-0000-4000-8000-000000000031 | Sam Carter |
| Season A current | 50000000-0000-4000-8000-000000000011 | 2026–27 |
| Season A historical | 50000000-0000-4000-8000-000000000012 | 2025–26 |

All remaining records should derive a UUIDv5/SHA-1 namespace from `helm-e2e-v1:<entity>:<stable-key>` or use an explicit checked-in UUID map. Lookups may use unique `e2e_key` only if a test-only schema addition is approved; otherwise deterministic primary ids and unique fictional emails are sufficient.

## Dataset blueprint

| Domain | Required rows | Purpose |
| --- | --- | --- |
| Organizations/teams | Two separate orgs; two Golf teams in A; one Golf team in B; Baseball teams in both; similar names | Cross-tenant and team-switch detection |
| Players | Complete stats, incomplete stats, no stats, improving trend, declining trend; duplicate Sam Carter names in A/B | Stats/empty/trend/name-resolution |
| Seasons | Current and historical for each sport/team | Filters/date boundaries |
| Rounds/games | 9/18-hole rounds, complete/in-progress/abandoned, qualifier-tagged; Baseball games and event-grain stats | Round lifecycle/stats/imports |
| Events/practices | Past/upcoming/cancelled, all-day/timed, DST boundary, 26-occurrence series, one legacy-shape series | Calendar/recurrence/attendance |
| RSVP/attendance | pending/accepted/declined/tentative, checked-in/absent, no-response | Player/coach state transitions |
| Development | Focus areas active/completed, goals, drills, tasks pending/overdue/completed, coach-only and player-visible notes | Visibility/progress/actions |
| Communications | Announcements/read/unread, conversations/messages, attachments, notifications/read state | Isolation/realtime/deep links |
| CoachHelm | Conversation history, read-tool evidence, visible/hidden V2/V3 insights, proposed/denied/completed/failed action runs | AI truth/approval/history |
| Lifting | Program, group, assignments, session, results, readiness/soreness/weight/nutrition | Coach/athlete/bridge workflows |
| Invitations | Valid, expired, revoked, exhausted redemption, accepted | Token/email/counter tests |
| Subscription states | Trial/paid/cancelled/failed metadata in test fixture/mock only | Billing UI once implemented; no current live table |

### Exact trend fixtures

- **Improving player:** six completed rounds with score-to-par `+12,+10,+9,+7,+5,+3` on fixed dates, stable course/par, and putting/approach detail sufficient for CoachHelm metrics.
- **Declining player:** six rounds `+2,+4,+5,+7,+9,+11`.
- **Incomplete player:** completed round headers but intentionally missing optional shot detail on selected holes; never violate DB required constraints.
- **No-stats player:** active membership/profile and no rounds/games/cache rows.
- **Duplicate import:** two files/runs with the same source game/event identifiers, allowing exact idempotency assertions.

### Two-tenant trap design

Both organizations contain Sam Carter, “Hawks Practice,” “Qualifier #1,” “Putting Focus,” “Weekly Review,” and an identically named document/object. Tests always know both ids. A query, page, model tool, notification, or search that scopes only by display name will therefore fail loudly.

## Seed ordering

1. Auth users and shared users/profiles.
2. Organizations and sport teams.
3. Coaches/players/athletes and staff/member/viewer relationships.
4. Seasons, settings, capabilities, invitations.
5. Rounds/games/events/practices and dependent stats/attendance.
6. Development, communications, documents, notifications.
7. CoachHelm caches/insights/conversations/action ledger.
8. Lifting graph.
9. Provider mock ledgers and test-run namespace record outside production schema.

## Reset strategy

- Use a per-CI-run isolated Supabase branch or local database. Never reset production.
- Apply migrations from a canonical baseline, then seed deterministically. Because the live and local migration ledgers drift, first establish a verified schema fingerprint and decide whether live dump or repaired migrations are authoritative.
- Before every test worker, either restore a database snapshot or reseed a worker-specific namespace. Prefer one organization/team namespace per worker to avoid shared mutations.
- After a test, delete only the explicit run namespace in dependency-safe order or restore the snapshot. A killed worker must not depend on test-finally cleanup.
- Global teardown compares all seeded ids/counts/checksums against the allowed mutation manifest and emits a leak report.
- Time is fixed to `2026-09-15T14:00:00Z` in browser and background mocks; date fixtures include DST transitions and month/year boundaries.

## Database assertion strategy

### Restricted actor assertions

Use each persona's normal Supabase session to assert what that role can read/write. This is the only reliable RLS characterization and should cover raw table, RPC, Storage, API, and hidden-control bypasses.

### Privileged CI verification

A Node-only verifier may use the isolated environment's service role after the browser action. It must:

- accept only known fixture/run ids, never arbitrary SQL from a test page;
- return or log redacted scalar/row-count assertions, not secrets or personal data;
- assert correct team/organization/player/creator/status and all dependent rows;
- assert no duplicate or cross-tenant rows and no forbidden notification/provider calls;
- compare action receipts and UI counts to database truth;
- never expose the service role through `process.env` serialization, browser context, trace, screenshot, or report.

No test-only verification endpoint should be deployed to production. If an endpoint is unavoidable, compile it only in a test deployment, require a short-lived CI token, restrict fixture namespaces, and return booleans/counts.

## Provider fixtures

Resend/Gmail/push/Stripe/Anthropic/Arccos/Google Calendar/Inngest are faked by deterministic adapters or request interception. Record expected outbound payloads in a Node mock ledger keyed by test id. Tests assert exact recipient/team/object/action and zero calls on validation/authorization failure.

## Current seed infrastructure

[scripts/seed-baseball-e2e.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/scripts/seed-baseball-e2e.ts) already uses deterministic namespace-derived Baseball ids and service-role setup/reseed/teardown. It is a useful pattern but must run only against an isolated target. Existing repository history documents teardown races and leaked junk rows; a snapshot/namespace leak check is required. A Golf auth setup file exists, but root [playwright.config.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/playwright.config.ts) wires only the Baseball setup.
