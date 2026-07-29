# RELEASE READINESS

_Updated 2026-07-29 02:05 EDT. Branch `baseball/overnight-completion`,
draft PR [#1092](https://github.com/njrini99-code/helmv3/pull/1092)._

The question this file answers: **can BaseballHelm be shown to a college
baseball program today, and can it be sold?** Those are different bars and are
answered separately.

---

## 🔴 One blocker outranks everything

**Two live cross-tenant data exposures.** Any authenticated user on any team
reads every other program's roster PII (email, phone, GPA, SAT/ACT) and every
team's secret `join_code`.

This is not "an incomplete product." A demo of a product that leaks every other
program's player data to the person you are demoing to is a liability, and it
is the one finding that is **worse to ship than to delay**. BaseballHelm is
sold on the promise that a program's roster is theirs.

The fix is written, reviewed, and committed as files. **It has not been applied
to anything.** Apply it in three steps — see `DATABASE_STATUS.md` for the full
reasoning and `CURRENT_PRIORITIES.md` for the checklist.

**Do this first:** read CI on PR #1092. Its `supabase` job builds a fresh local
stack from all migrations and runs the pgTAP suites. That is the first time
this SQL will have been executed by any Postgres — everything else about it so
far is static review.

---

## Can it be DEMOED today?

**Yes, with one caveat and one preparation.**

| | State |
|---|---|
| Core team-ops loop (roster, calendar, practice, messaging, tasks) | Works |
| Lift Lab integration | Works, and materially better than 24h ago — see below |
| Recruiting | Deliberately hidden. This is a feature, not a gap: it was the least complete surface and diluted the pitch. |
| Demo seed data | **Verify before demoing.** Recon found no seed coverage for Announcements, Travel, Documents, Post-Game Reviews, or lifting maxes/bodyweight. Work is in flight; confirm it landed before opening those tabs. |

**The caveat:** demo against a demo org, never against a prospect's own data,
until the RLS fix is applied. The leak means anything opened in one program is
visible from another.

**Fixed tonight, and each of these was demo-visible:**

- "Sync Athletes" reported success while inserting zero rows — every call
  passed a parameter name the RPC does not have, and the error was never read.
  A coach clicking Sync got a green toast and an empty roster.
- Assigning a team in Settings did not seed its athletes, so the next screen
  was empty with nothing explaining why. The doc comment had claimed it did for
  months.
- Cutting a player left them active in Lift Lab forever. The two products
  disagreed about who is on the team, and Lift Lab was the one that was wrong.
- Three bottom navigation bars rendered 3 tabs instead of 4 after the sunset.

---

## Can it be SOLD today?

**No — and the gap is narrower than it looks.**

| Blocker | Status |
|---|---|
| Cross-tenant leak | Fix written, **not applied**. This is the whole answer. |
| RLS test coverage | 35% of `baseball_*` tables have zero pgTAP coverage — messaging, tasks, travel, announcements, invitations, dev plans. A hole in any of them would not be caught. |
| `helm_lifting_athletes.user_id` staleness | Write-once at seed time, never re-synced, **verified stale in production**. Any player synced before their account is linked permanently fails the athlete-self gate at `/lifting/dashboard`. |

Everything else on the open list is quality, not correctness.

---

## What changed tonight, by honesty class

The mission brief asked for this distinction explicitly. Overstating any row
here would defeat the point of the file.

### Complete and verified

- Recruiting sunset, closed at **every** layer: nav registry, hub resolution,
  server route guards, middleware, and the public `/packet/<token>` share link
  — the only recruiting surface reachable with no session, which every other
  gate missed, and which was still serving a high-school player's measurables
  and video to anyone holding an old URL.
- Roster status changes propagate to Lift Lab. Deactivate, never delete.
- "Sync Athletes" actually syncs, and reports what it did rather than a fixed
  success string.
- The bottom-nav 3-tab regression.
- Roster "Add existing player" narrowed from a cross-tenant substring browse
  (typing "sm" returned strangers' email addresses from every program) to an
  exact-email lookup.

### Production-usable but not proven

- The RLS migrations. Authored, reviewed line-by-line against the real schema,
  and **never executed**. CI on #1092 is the first real test.
- The companion app changes. They work under both the old and new policies by
  construction, but the second half of that claim is only exercised once
  migration B is applied somewhere.

### Improved but incomplete

- Seed data. In flight at the time of writing.
- `PlayerProfileClient` (1,701 lines, almost no Fairway) and the Settings hub
  (three design systems on one page). Both in flight.

### Intentionally hidden

- The entire recruiting module. Code, migrations, types and data all preserved.
  `PRODUCT_MODULES.recruiting.enabled = true` brings it back, and the tests
  that assert its old behaviour were **kept** — re-run under a mock-enabled
  module — so restoration has live coverage rather than being archaeology.

### Blocked, deliberately

- Applying anything to the database. Shared production DB with live Golf users;
  a mis-scoped RLS policy locks legitimate users out rather than failing safe,
  turning a confidentiality bug into an outage. The exposure has been live
  ~2 months; the marginal risk reduction from applying at 02:00 unattended
  versus with the owner present does not justify that.

### Out of scope

- The Elite stat event model: 8 tables, ~10 dedicated migrations, **zero rows**
  in production. Real schema investment behind a pitch-by-pitch analytics model
  that has never received a single row. Keep or graveyard — a product call, not
  an overnight one.

---

## One P0 retracted

Recon reported the staff-invite accept RPC had no email-ownership check — any
leaked invite token would let anyone join any team **as staff**. It was
**false**; the check is present at three layers and always has been.

Recorded rather than deleted, and pinned by a test. A P0 that turns out not to
exist is itself a finding: the recon pass produced at least one false positive
at the highest severity, so its other conclusions deserve the same
read-the-source treatment before anyone acts on them.
