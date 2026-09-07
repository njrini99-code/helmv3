# RELEASE READINESS

_Updated 2026-07-29 02:05 EDT. Branch `baseball/overnight-completion`,
draft PR [#1092](https://github.com/njrini99-code/helmv3/pull/1092)._

The question this file answers: **can BaseballHelm be shown to a college
baseball program today, and can it be sold?** Those are different bars and are
answered separately.

---

## ✅ The blocker that outranked everything is CLEARED

**Applied to production 2026-07-29 ~17:45Z**, on the owner's explicit
instruction. Any authenticated user on any team could read every other
program's roster PII (email, phone, GPA, SAT/ACT) and every team's secret
`join_code`. They no longer can — measured, as three real users:

- a non-member player: teams `13 → 1`, join codes `13 → 1`, players `35 → 1`,
  own row preserved
- a coach with an 8-player roster: players `35 → 16`, own roster `8 → 8`
- the owner's account: players `35 → 22`, own roster `14 → 14`

Cross-org visibility does not reach zero because the recruiting backstop admits
players who **opted in** (9 of 35; all 26 college players excluded) — the
consent model, not a residual leak.

Join-by-code, the roster email search and the anon-facing public view were each
exercised through the exact RPC the app calls, after applying. See
`DATABASE_STATUS.md` for the full before/after and PR **#1102** for the record.

**Still open — the only unclosed P0:** `baseball_coaches`. Any coach reads every
coach's **email** (not phone — `phone` is NULL for every row in production; the
long-standing "email + phone" wording overstated it). Measured: 10 coaches
across 8 organizations, of which 1 org is the caller's own.

**It is no longer blocked on the audit.** The 75-call-site audit is done and
collapses to zero: of 74 reads, 66 are self-scoped, 2 are INSERTs, 1 uses the
service-role client, and the rest are same-org by construction. A measured fix
exists — `20260729200000_baseball_coaches_org_scope.sql` — deliberately
unapplied pending CI and review.

**Caveat:** every measurement is a row count at the data layer. No browser
walked these screens, so the residual risk is a rendering bug in the app rather
than a policy denying too much.

---

## Can it be DEMOED today?

**Yes, with one caveat and one preparation.**

| | State |
|---|---|
| Core team-ops loop (roster, calendar, practice, messaging, tasks) | Works |
| Lift Lab integration | Works, and materially better than 24h ago — see below |
| Recruiting | Deliberately hidden. This is a feature, not a gap: it was the least complete surface and diluted the pitch. |
| Demo seed data | **Verify before demoing.** Recon found no seed coverage for Announcements, Travel, Documents, Post-Game Reviews, or lifting maxes/bodyweight. Work is in flight; confirm it landed before opening those tabs. |

~~**The caveat:** demo against a demo org, never against a prospect's own data,
until the RLS fix is applied.~~ **Lifted 2026-07-29** — the fix is applied and
verified. Cross-program roster and join-code visibility is closed, so a demo no
longer risks showing one program's data to another.

**The one residue:** a coach can still see other coaches' names and emails
across organizations (finding #5). That is professional contact information of
the kind usually on a public athletics staff page, not player data — but it is
the remaining reason to prefer a demo org over a prospect's live tenant.

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
| Cross-tenant leak | ✅ **CLOSED in production 2026-07-29.** Five of six exposures fixed and verified by execution. |
| `baseball_coaches` email readable by any coach | 🟡 **OPEN, but no longer blocked on the audit.** The 75-call-site audit is done and collapses to zero cross-org readers; a measured fix is written (`20260729200000`) and deliberately unapplied pending CI + review. Exposure is 10 coaches / 8 orgs / 10 emails / **0 phones** — the "email + phone" wording overstated it. |
| RLS test coverage | 35% of `baseball_*` tables have zero pgTAP coverage — messaging, tasks, travel, announcements, invitations, dev plans. A hole in any of them would not be caught. |
| `helm_lifting_athletes.user_id` staleness | ✅ **FIXED AND REPAIRED.** `20260729000300` applied, and the repair run: 21 of 22 athletes were unlinked and locked out of `/lifting/dashboard`; now 0, with `is_active` untouched and every link matching its source player across 22 distinct accounts. |

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

- ~~The RLS migrations. Authored, reviewed line-by-line, **never executed**.~~
  **Superseded 2026-07-29: applied to production and verified by execution**,
  as three real users via role impersonation. Moved to "Complete and verified".
- ~~The companion app changes … only exercised once migration B is applied.~~
  **Now exercised.** Migration B is applied and every affected flow was run
  through the exact RPC the app calls.
- **What genuinely remains unproven:** all of that verification is row counts at
  the data layer. No browser walked the join-by-code, roster-search or public
  profile screens. The residual risk is a rendering or call-shape bug, not a
  policy that denies too much.
- The mobile hamburger fix (#1099) is deployed by SHA and covered by 5 passing
  unit tests, but was **not** visually re-confirmed in production — Chrome will
  not resize below ~500px, Playwright's MCP profile was locked by another
  session, and the site correctly refuses to be framed.

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

- ~~Applying anything to the database.~~ **Unblocked and done 2026-07-29** on
  the owner's explicit instruction, with them awake. The reasoning for the
  overnight deferral was correct at the time and is preserved in
  `DATABASE_STATUS.md` — it is the argument that has to be made again next time,
  not a mistake to erase.
- **Still deliberately unapplied:** `20260729180000` (golf shot-detail RLS perf,
  3413ms → 515ms) and `20260729200000` (baseball_coaches org scope). Both are
  measured against production inside rolled-back transactions, both are RLS
  changes with no pgTAP coverage yet, and `CLAUDE.md` mandates
  db-migration-reviewer for RLS. The tenant-isolation pair's CI caught two
  recursion cycles that had already survived two line-by-line human reviews —
  a perf win and a tidy audit do not justify skipping the gate that caught them.
- **Deploying** is no longer blocked either: production is `b18c2a174` as of
  18:37:10Z, carrying every merged fix.

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
