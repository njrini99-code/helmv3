# Helm Feature Scan Blueprint

## Goal

Build a deterministic, role-aware, full-stack scan that treats UI, API, RLS/RPC/Storage, database state, providers, console/network behavior, accessibility, and visual presentation as separate observable contracts. Start with P0/P1 authorization and data integrity; do not use production as a test target.

## Recommended Playwright projects

| Project | Browser/viewport | Persona | Purpose |
| --- | --- | --- | --- |
| public-chromium | Chromium desktop | Unauthenticated | Marketing/auth/demo/link smoke |
| baseball-primary | Chromium desktop | P-08 | Core coach P0/P1 |
| baseball-scoped | Chromium desktop | P-09 | Capability/player-scope denial matrix |
| baseball-player | Chromium desktop | P-10 | Today/messages/passport/own stats |
| golf-head | Chromium desktop | P-02 | Team/CoachHelm P0/P1 |
| golf-assistant | Chromium desktop | P-03 | Head-vs-assistant boundaries |
| golf-player | Chromium desktop | P-04 | Rounds/hub/tasks/RSVP/stats |
| tenant-isolation | Chromium desktop; two contexts | A and B pairs | Direct table/API/RPC/Storage and same-name traps |
| team-switch | Chromium desktop; two tabs | P-07 | Cookie/cache/back/reload isolation |
| lifting-coach | Chromium desktop | P-11 | Programs/sessions/athletes |
| lifting-athlete | Chromium desktop | P-12 | Own-session/check-in boundaries |
| platform-admin | Chromium desktop | P-14 | Admin gates/health only |
| mobile-critical | Chromium 375x667 and 430x932 | Core coach/player states | P0/P1 mobile navigation/forms/chat/calendar |
| tablet-critical | Chromium 820x1180 | Core coach/player states | Tables/drawers/charts |
| cross-browser-critical | Firefox + WebKit desktop/mobile | Reused storage state per browser | P0/P1 compatibility |
| visual-a11y | Chromium fixed fonts/time | Selected personas | High-value screenshots + axe + keyboard |

### Viewport matrix

| Label | Viewport | Use |
| --- | --- | --- |
| Small iPhone | 375×667 | Navigation, keyboard, sheets/modals, safe area |
| Large iPhone | 430×932 | Chat, calendar, forms, sticky controls |
| Tablet | 820×1180 | Tables/drawers/charts/two-pane layouts |
| Desktop | 1440×900 | Primary functional and visual baseline |

Keep Chromium as the fast default, then run all P0/P1 smoke flows in Firefox and WebKit. The current root config comments out Firefox/WebKit and wires Baseball setup only; add Golf/Lifting/admin setup projects without committing storage-state files.

## Authentication-state strategy

- Global setup creates isolated auth users from the persona blueprint and logs in through the real UI once per browser engine.
- Save one storage state per persona/browser/run in CI temporary storage; never commit it.
- Expired/removed/role-changed tests mutate only the isolated DB through a Node fixture controller, then reuse/refresh the same browser session to prove server invalidation.
- Token invitation/password-reset tests use a fake mailbox that captures the actual generated link; do not construct tokens in the browser.
- Admin storage state is never reused by normal tests.

## Isolation and database reset

1. Provision one Supabase branch/local database per CI run.
2. Verify schema fingerprint/migration baseline before seeding.
3. Seed deterministic ids and two similar organizations.
4. Allocate a separate team/run namespace to parallel workers; serialise only tests that intentionally share a conversation/series/round.
5. Restore a snapshot or reseed the namespace after each spec group.
6. Global teardown emits unexpected-row/object/provider-call differences and fails the run.

The connected production database is not a safe reset target. Current repository migration/live drift must be resolved for test infrastructure before a clean-replay assertion can be trusted.

## Database assertion harness

- Actor client: normal anon key + persona session for positive/negative RLS and RPC/Storage checks.
- Verifier client: Node-only service role in isolated CI, restricted to known fixture ids and redacted scalar assertions.
- Assertions: exact parent/child counts, team/org/player/creator/status, timestamps within frozen clock, unique/idempotency key, no foreign rows, no duplicates, notification/audit/provider ledgers.
- Capture database errors with code/table/function, but redact values and credentials.

## External-service mocking

| Integration | Mock mode | Assertions |
| --- | --- | --- |
| Anthropic/Gateway | Deterministic fake model stream/tool transcript | Tool selection/input, evidence numbers, approvals, retry/interruption; never exact prose |
| Resend/Gmail | Local fake mailbox/provider adapter | Recipient/template/deep link/idempotency; zero send on failure |
| Web push/APNs | Fake delivery server with 200/410/429/500 | Payload, token deactivation, retry, preferences |
| Stripe | Stripe test fixtures or local stub; signed webhook generator | Signature, idempotency, no production call |
| Inngest | Local dev/fake client | Event payload, retry, terminal markers, safety-net |
| Arccos/Google Calendar | Recorded HTTP fixtures and OAuth stub | Mapping/dedup/sync log; no live account |
| Sentry/Datadog/PostHog | Intercept/no outbound | Expected local logging/analytics schema only |
| Storage | Isolated real Supabase Storage | Object key/bytes/policy/metadata; use harmless fixture files |

## Global console and network monitor

Attach listeners before navigation:

- Fail on `pageerror`, unhandled promise rejection, React hydration/serialization errors, uncaught console error, and relevant failed asset load.
- Record every request/response. Fail unexpected 401/403/404/409/429/500+, CORS/mixed-content errors, aborted mutations, and repeated identical requests above a documented budget.
- Allowlist expected negative-test denials by test id, URL, method, and status; a broad 4xx allowlist is forbidden.
- Redact authorization/cookies/query tokens/request bodies before attaching traces.
- Treat provider stubs as assertions: unexpected calls fail; missing expected calls fail only when the product contract says delivery is synchronous/queued.

## Critical smoke suites

1. Direct authorization/RLS/RPC/Storage/Edge tests in the first-20 list.
2. Sign-in/onboarding/team selection for Baseball, Golf, Lifting, and admin.
3. Baseball roster → practice → player Today; box-score save.
4. Golf round draft/recover/submit → stats/cache → CoachHelm terminal analysis.
5. Golf event/recurrence → RSVP/attendance; task assign/complete.
6. CoachHelm evidence question and each of four approve/deny/retry action types.
7. Team switch and same-name tenant isolation.

## First 20 tests to implement

| Order | Test ID | Feature | Test | Action | Expected | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | SCAN-P0-001 | COMM-002 | Baseball cross-conversation SELECT is denied | Baseball player in Organization A attempts to select messages for an Organization B conversation using the authenticated Supabase client. | No rows and authorization error; no message metadata leaks. | baseball_messages policies; src/hooks/use-messages.ts |
| 2 | SCAN-P0-002 | COMM-002 | Baseball cross-conversation INSERT/UPDATE is denied | Alter conversation_id/message id in a direct request. | No row inserted or changed; target conversation remains unchanged. | baseball_messages policies |
| 3 | SCAN-P0-003 | COMM-002 | Conversation-details RPC cannot impersonate another user | Call get_baseball_conversations_with_details with another persona user id. | RPC rejects or returns only caller-owned conversations. | get_baseball_conversations_with_details |
| 4 | SCAN-P0-004 | TEAM-003 | Raw Baseball player directory is tenant-scoped | Organization A staff queries baseball_players and a known Organization B player id. | No cross-tenant player profile or contact/academic fields. | baseball_players_select policy; src/app/baseball/actions/roster.ts |
| 5 | SCAN-P0-005 | AUTH-008 | Staff invite RPC binds token to authenticated email | A different authenticated user calls baseball_accept_staff_invite with a valid invite token. | No coach/staff row created; invitation remains redeemable by invitee. | baseball_accept_staff_invite; src/app/baseball/actions/staff.ts |
| 6 | SCAN-P0-006 | AUTH-007 | Invitation counters cannot be changed by unrelated users | Unrelated authenticated persona calls try/release redeem RPC for another team invitation. | Counter and status remain unchanged. | try_redeem_baseball_team_invitation; release_baseball_team_invitation_redemption |
| 7 | SCAN-P0-007 | OPS-002 | Private documents bucket is tenant-isolated | Organization A user selects/downloads/updates/deletes an Organization B object key. | Every operation is denied; metadata and bytes remain intact. | storage.objects policies for documents |
| 8 | SCAN-P0-008 | ADMIN-001 | Orphan create-admin-user Edge Function rejects unauthenticated caller | Invoke without an authenticated super-admin context using fictional input. | 401/403 and no auth/user/admin row. | live Edge Function create-admin-user v5 |
| 9 | SCAN-P0-009 | ADMIN-002 | verify-emails Edge Function rejects ordinary authenticated users | Ordinary player invokes function. | 403 and no crm_coaches updates. | live Edge Function verify-emails v4 |
| 10 | SCAN-P0-010 | STATS-002 | Box-score RPC enforces manage_stats capability | Scoped staff without manage_stats calls save_baseball_full_box_score directly. | Denied; no box score or aggregate rows change. | save_baseball_full_box_score; src/app/baseball/actions/games.ts |
| 11 | SCAN-P0-011 | COMM-005 | Golf conversation-id RPC cannot impersonate another user | Call user_conversation_ids with another persona user id. | Only caller conversations or authorization error. | user_conversation_ids; src/hooks/golf/use-golf-messages.ts |
| 12 | SCAN-P0-012 | COACHHELM-002 | CoachHelm cannot act on another team/player | Alter a proposal/player identifier to the similar-name player in Organization B. | Approval/action rejected; no cross-tenant focus/task/event/announcement row. | src/lib/coachhelm/v3/chat/agent-tools.ts |
| 13 | SCAN-P0-013 | COACHHELM-002 | CoachHelm approval is idempotent | Approve the same proposal twice and retry the network response. | Exactly one domain row and one terminal action-run receipt. | golf_coachhelm_action_runs; action-runs.ts |
| 14 | SCAN-P0-014 | COACHHELM-002 | CoachHelm denial reaches a terminal audited state | Deny a proposed write and reload. | Action run is denied, no domain row, denial remains visible. | recordDenial in action-runs.ts; chat stream route |
| 15 | SCAN-P0-015 | COACHHELM-002 | Pending CoachHelm approval survives reload safely | Create a proposal, reload before approval, then approve or cancel. | Approval remains actionable with same id or is explicitly expired; never silently executes. | restoreUIMessages; data-action-proposal |
| 16 | SCAN-P0-016 | PRACTICE-003 | Recurring event creation is bounded and coherent | Create 26-occurrence practice for selected players. | Exactly 26 event rows, correct root/children and attendance rows; no 27th row. | src/app/golf/actions/recurring-events.ts |
| 17 | SCAN-P0-017 | PRACTICE-003 | Deleting/editing a root occurrence does not cascade survivors | Use this/this-and-future/all on root and child across DST. | Only intended rows change; surviving root promoted; local wall time preserved. | recurring-events.test.ts; golf_events FK |
| 18 | SCAN-P0-018 | AUTH-011 | Team switch clears prior-team state and caches | Load Organization A, switch to second team, use back/refresh/two tabs. | Only selected-team data in DOM/network/DB reads; no stale A data after switch. | TeamSwitcher.tsx; resolve-team-server.ts |
| 19 | SCAN-P0-019 | DEV-008 | Task assignment rejects a player from another team | Coach tampers assignToPlayerIds with Organization B Sam Carter. | Assignment insert denied/validated and task outcome is honest; no orphan assignment. | src/app/golf/actions/tasks.ts; golf_task_assignments policies |
| 20 | SCAN-P0-020 | PRACTICE-004 | Calendar/task/RSVP state persists despite missing Realtime publication | Mutate in another context, wait, then reload. | Test records whether live update arrives; reload must show committed DB truth with no duplicate. | use-calendar-range-events.ts; use-task-realtime.ts; live supabase_realtime publication |

## Full regression design

For every feature in the catalog:

- **Happy path:** exact actor, entry, UI result, DB graph, and synchronous/queued effects.
- **Validation:** required, malformed, duplicate, long, date/status/file constraints.
- **Authorization:** every other role, foreign team/org/player, removed membership, expired invitation, direct URL/API/RPC/Storage, hidden-control bypass.
- **Persistence:** reload, sign-out/in, second context, deep link, team switch away/back, DB verification.
- **Failure:** primary DB error, each child write, provider error, timeout/offline, duplicate click, retry, partial side effect.
- **Mobile:** navigation, form controls, dialogs/sheets, tables/charts, chat composer/keyboard, sticky/safe-area/overflow.
- **Accessibility:** keyboard path, visible focus, labels/descriptions, live error announcement, focus trap/return, semantic table/status, axe.

The structured test matrix contains generated rows for each catalog feature plus the hand-prioritized P0 set.

## Visual regression

Capture only deterministic, high-value states:

- Baseball and Golf coach dashboards/command centers.
- CoachHelm empty, evidence response, chart, action proposal, approved/failed receipt, mobile keyboard.
- Baseball player profile/Today, stats chart, practice editor/calendar, roster.
- Golf player hub, round entry/review, team/player stats, qualifier board, calendar/editor/series-scope dialog, roster.
- Lifting Today/live room/program editor.
- Small/large iPhone navigation and critical empty/error/permission states.

Freeze time, animations, fonts, provider/model outputs, and seed ids. Mask only truly nondeterministic telemetry; never mask a team/player name or value under test.

## Accessibility

Run axe on the selected route/state matrix, then explicit keyboard tests for menus, comboboxes, dialogs, sheets, tables, calendar, shot entry, and chat approval. Assert error summary/live region, button accessible names, dialog focus trap/return, non-color status indicators, chart text alternative/legend, and mobile keyboard reachability.

## Traces, screenshots, and retention

- Keep trace/video/network/console/database diff for first failure and final retry.
- On CI retry, preserve both attempts to identify flake.
- Redact secrets, tokens, cookies, email bodies, and user-entered private content.
- Retain P0 failure artifacts 30 days, P1 14 days, passing visual baselines per review policy; do not upload raw production data.

## CI integration

Recommended lanes:

1. PR static/unit/SQL/type/build.
2. PR isolated-DB P0 authorization and 15-minute critical smoke.
3. Merge/main Chromium P0/P1 regression.
4. Nightly Firefox/WebKit, mobile/tablet, provider-failure, RLS/function matrix.
5. Weekly visual/a11y, >1,000-row scale, migration replay/drift, mutation/promptfoo.

Current GitHub Actions cover type/lint/unit/business/build, Supabase local lint/RLS, route hygiene/import cycles, Baseball auth smoke, full/manual Playwright, and PR accessibility/mobile lanes. Some visual/picker/Baseball smoke jobs are non-blocking. CircleCI adds weekly knip, mutation, SQL lint, audit, iOS, Lighthouse, and promptfoo. Test discovery should be a required artifact because many `node --test` scripts are not wired into Vitest.

## Flake reduction and parallelism

- Freeze time/random/locale/timezone and use stable ids.
- Wait on domain responses/rows, not arbitrary sleeps; poll background terminal markers with bounded backoff.
- One mutable round/series/conversation per worker; never share.
- Disable fully parallel execution for recurrence, messaging, CoachHelm action-ledger, and reset tests unless each gets an independent namespace.
- Make retries diagnostic, not masking: compare first/second network and DB diffs; fail “passes only on retry” in nightly.
- Model/provider text is nondeterministic; assert typed tool data/ledger and bounded semantic UI, not exact prose.
- Realtime tests must include reconnect and explicit reload because the live publication currently omits subscribed domain tables.

## Estimated implementation order

| Order | Work package | Exit criterion |
| --- | --- | --- |
| 1 | Isolated Supabase + migration fingerprint + deterministic seed/reset | Clean repeatable run; zero leaked rows/objects |
| 2 | Persona auth states + restricted actor/privileged verifier clients | All roles log in and forbidden baselines pass |
| 3 | P0 RLS/RPC/Storage/Edge authorization | First ten tests automated and triaged |
| 4 | Baseball/Golf team switch, onboarding, invites, roster | Tenant graph and active context stable |
| 5 | Baseball practice/stats/import and Golf round/calendar/task/qualifier | Core P1 workflows + DB assertions |
| 6 | CoachHelm read evidence + four actions + failure/reload/deny | Model text no longer trusted; action graph proven |
| 7 | Notifications/jobs/provider faults | Queued side effects observable/idempotent |
| 8 | Lifting core and long-tail ops/recruiting/documents | Role matrix coverage |
| 9 | Mobile/a11y/visual/cross-browser | Selected high-value state matrix stable |
| 10 | Scale/drift/flake hardening | >1,000 rows, clean replay, retry diagnostics |

## Blockers to trustworthy automation

- No connected isolated Supabase target; production cannot be reset or safely side-effect tested.
- Production deployment SHA is not confirmed.
- Live/local migration and generated-type drift prevent a trustworthy clean baseline.
- Golf/Lifting/admin auth setup is not wired into root Playwright config.
- Provider fakes/test credentials and a safe background-job runner are not standardized.
- Desired policy for current confirmed security mismatches is unresolved: tests can characterize current behavior, but “expected pass” needs product/security decisions.
