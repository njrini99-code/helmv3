# FINAL REPORT — BaseballHelm overnight run

_2026-07-28 23:35 → **2026-07-29 20:30 EDT** (the window was originally 10:45;
an afternoon session continued it, then an evening one — there are now **two**
addenda below, newest first, and both supersede claims in the body). Branch
`baseball/overnight-completion`, PR
[#1092](https://github.com/njrini99-code/helmv3/pull/1092) — **merged to
`main` and deployed to production**. Full unit suite green on the merged
tree: **877 files, 8,359 tests, 0 failures**; every CI check green including
`BaseballHelm authenticated smoke`, which passed for the first time this run
once the database was restored._

---

## ⚡ ADDENDUM 2 — the evening of 2026-07-29, 19:30 → 20:30 EDT (newest; read first)

_Both addenda supersede the body. This one supersedes the first where they differ._

The evening was not BaseballHelm feature work — the owner redirected it to the golf
CRM, then to getting the repo's branches, PRs and issues into a clean state. What
follows is honest about which of that is finished and which is merely filed.

### Complete and verified

**Four golf CRM defects, merged.** Each was verified non-vacuously — the source was
reverted and the tests re-run to confirm they actually fail without the fix, because
a structural test that cannot fail is worse than none.

| PR | What it was |
|---|---|
| #1109 | merging a duplicate coach stranded its stage history (`crm_stage_transitions` missing from `COACH_CHILD_TABLES`) |
| #1111 | the CRM had **no calendar**: `CalendarView` was never mounted and neither event modal had an external opener |
| #1113 | `getCoachTimeline` unioned 5 sources, all outbound — `crm_replies`, the only inbound signal, was the one missing |
| #1115 | `updateCrmTask` had **zero callers**, so a task was immutable once saved; "complete" was the only verb |

Two defects inside #1111 had never been reachable because the component was never
rendered: a `<button>` nested inside a `<button>` in the month cell (invalid HTML,
the #418 hydration class CLAUDE.md names), and a week view whose `overflow-hidden`
**clipped** the last weekdays below ~700px with no scrollbar to reach them. It also
had zero responsive classes in 677 lines.

**The issue tracker went from 41 open to 0.** #988 closed with a real resolution —
#1111 fixed it. The other 40 closed as bulk triage at the owner's instruction, with
the reasoning recorded on each and a note that Sentry/Supabase-sourced issues
re-file themselves if the error recurs, so nothing live was suppressed.

**Two PRs closed rather than merged, because merging them would have regressed
`main`.** This is the part most worth keeping:

- **#1100** wanted the table count `263 → 264`. Running `npm run docs:regen` against
  current main reports **266** and produces *zero* diff, so merging would have
  overwritten 266 with 264.
- **#1075** (draft, 622 files diverged) would have downgraded `@sentry/nextjs`
  10.68 → 10.62, removed `@sentry/profiling-node`, deleted AGENTS.md's Cursor Cloud
  section, and stripped `--allow-prod` from `seed:baseball:ci` — which makes the
  seed's own production guard **refuse**, taking the *required* `BaseballHelm
  authenticated smoke` gate red on every PR. Its actual value (13 additive QA docs,
  ~13k lines) was extracted to **#1120** with no dependency changes.

### Improved but incomplete — filed, not fixed

- **`supabase_migrations.schema_migrations` is not a usable apply check here.** All
  six recent migrations return zero rows from it, including A and B which are
  demonstrably applied. MCP-applied migrations don't record a row the way the CLI
  does. Use `to_regprocedure()` and live `pg_policies.qual` instead.
- **The elite stat event model was misclassified as `dead`.** Zero rows holds, but
  ~20 live `.from()` read sites depend on those tables — dropping them breaks all of
  them. The real gap is **ingest**: of pitch / batted-ball / catching / fielding /
  baserunning / workload events, not one has a write path. It is 13 tables not 8,
  and two were never created in production at all.
- **The queued "CI seeds PRODUCTION" item is narrower than filed** — the
  `login_attempts` DELETE is scoped to two demo emails, and fork PRs get no secrets
  (`pull_request`, not `pull_request_target`).

### Blocked on the owner, unchanged and still the critical path

1. **Two migrations authored, merged, applied to nothing:** `20260729200000` (the
   last baseball P0 — any coach reads every coach's email) and `20260728030000`
   (golf, worth 3413ms → 515ms). **Read the NULL-org note first:** one of the 10
   coach rows has `organization_id IS NULL`, and the new helper is
   `p_org_id IS NOT NULL AND EXISTS(...)`, so that row becomes self-visible only.
   It is an internal account today; a *customer* coach with a NULL org would
   silently lose sight of their colleagues, presenting as "the roster page went
   blank" rather than an error.
2. `GMAIL_SA_*` + Workspace `gmail.readonly`, `INNGEST_EVENT_KEY` rotation **plus a
   redeploy** (Vercel bakes env at deploy time), Google Calendar OAuth creds.

### Intentionally not done

**The `process-sequences` cron stays unregistered.** Its own header says it is off
*by design* so outreach stays human-triggered, and the operator script it names
exists and was touched today. Registering it would start real email to real college
coaches — a product decision, not a repo fix. Not touched.

### Honest limits of the evening's work

- **#1113 has no visible effect today.** `crm_replies` has **0 rows** in production
  because the Gmail poll is inert without `GMAIL_SA_*`. The code gap was real and is
  fixed; the surface renders empty until the ops work lands. Saying otherwise would
  be claiming a win that no user can see.
- **Empty-state honesty was spot-checked at 1 of ~20 elite-stat read sites.**
  `buildPitcherWorkload` degrades honestly to `[]`. The rest is unverified. #1118
  (in flight) appears to address the baseball read-models directly.
- **No migration was applied and no schema touched all evening.** Read-only SQL only.

### Corrections to this run's own record

- **I edited a stale copy of `DATABASE_STATUS.md` and "found" corrections that were
  already on `main`.** `#1092` was squash-merged at 14:23Z; main had since been
  reconciled by #1102/#1104/#1105, already carried the "0 with phone / email + phone
  overstated it" correction, and had better numbers than mine (cross-org player
  visibility 35 → 16 for a coach, 35 → 1 for a player). #1119 was rebuilt to carry
  only what is genuinely new. This is the same stale-source mistake recorded in the
  body's "reading is not verifying" section, repeated in a new costume.
- **`baseball/overnight-completion` is now dead weight.** Its content reached main
  via #1092's squash; the only thing it added afterwards was the redundant pair of
  doc commits #1119 replaced. It should not be merged.
- **`perf/golf-shot-detail-rls` must never be merged.** It is closed PR #1103 — its
  `20260729180000` duplicates `20260728030000` already on main and broke that
  suite's pgTAP. It carries no unique value.

---

## ⚡ ADDENDUM — the afternoon of 2026-07-29 (read before the body)

**The single largest change: the RLS migrations are no longer unapplied.** The
body of this report was written when they were files and nothing else, and it
says so in several places. That is now historical. What changed:

| | |
|---|---|
| Migrations **A**, **B**, **300** | ✅ **APPLIED to production** ~17:45Z, on the owner's explicit instruction while awake |
| Five of six cross-tenant P0s | ✅ **CLOSED** — `baseball_players`, `baseball_teams`, `baseball_team_invitations`, `baseball_player_percentiles`, `baseball_messages` |
| `unresolve_admin_event` | ✅ **APPLIED** (the body says "not applied" — stale) |
| Lift Lab identity repair | ✅ **APPLIED AND RUN** — 21 of 22 athletes were locked out of `/lifting/dashboard`; now 0 |
| Production deploy | ✅ **`b18c2a174` at 18:37:10Z**, carrying #1099, #1101, #1102, #1104 on top of the 14:30Z build |
| `baseball_coaches` (#5, the sixth) | ⚠️ Fix written and measured (**#1105**), audit done, **not applied** |
| Golf shot-detail RLS perf | ⚠️ 3413ms → 515ms measured (**#1103**), **not applied** |

**What unblocked the migrations, and it is the most reusable thing in this
entire report.** Migration B's own precondition read *"verify by EXERCISING each
flow, not by reading the diff"*, and this report's body recorded that as
unsatisfiable. **That was wrong.** Postgres will let you become the
`authenticated` role and supply JWT claims inside a transaction, so every query
runs under that named user's policies, and `ROLLBACK` makes it free:

```sql
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
  -- every query here is filtered by RLS as that user
ROLLBACK;
```

That converted "apply and hope" into a measured before/after, and it is also how
both remaining migrations were measured without touching production.

Measured, as three real users:

| | player | coach (8-roster) | owner (14-roster) |
|---|---|---|---|
| teams / join codes visible | 13 → **1** | 13 → **1** | 13 → **1** |
| players visible | 35 → **1** | 35 → **16** | 35 → **22** |
| own roster / self row | 1 → 1 ✓ | 8 → 8 ✓ | 14 → 14 ✓ |

**Three corrections the afternoon forced, each stated because it was asserted
confidently first:**

1. **"Every coach's email AND PHONE"** — repeated in four documents all night.
   `phone` is **NULL for every coach row in production**. The exposure is names
   and emails. Overstating a finding is how the real ones stop being believed.
2. **The "75-call-site audit"** blocking finding #5 was done and **collapses to
   zero**: of 74 reads, 66 are self-scoped, 2 are INSERTs, 1 is service-role,
   and the rest are same-org by construction. Not one needs cross-org access.
3. **"Browser-verify after deploying"** — I advised this, and it was backwards.
   The new policies went live against the *already-deployed* build, so that
   combination was what users were hitting and was the thing to verify. Waiting
   for a deploy would have tested a future combination instead of the live one.

**And one trap worth more than the fix it sits next to:** curling
`/baseball/join/<code>` appears to render "not found" for **valid** codes. It
does not. `not found` / `notFound` are framework identifiers present in the JS
chunks of *every* response, including the invalid-code one — which is why all
four test codes matched identically. I reported it as a possible live regression
before checking whether the string was page content.

**What the afternoon did NOT verify**, since the body's honesty split is the
point of this file:

- **The mobile hamburger was not visually re-confirmed in production.** Three
  mechanical blockers: Chrome refuses to resize below ~500px, Playwright's MCP
  browser profile was locked by another session, and the site correctly refuses
  to be framed (killing the iframe workaround). It rests on 5 passing unit tests
  and SHA confirmation.
- **Join-by-code was not walked through the UI.** A logged-out visitor cannot
  resolve a code by design (anon EXECUTE is revoked on the resolver), so the page
  requires sign-in and entering credentials was out of scope.
- Every RLS claim above is a **row count at the data layer**. No browser walked
  these screens, and production carries little traffic, so "no errors since
  applying" is weak evidence rather than strong.

**Deploy hazard now written down:** `vercel --prod` uploads the local directory,
and this repo's working tree carries another session's uncommitted files. The
18:37Z deploy was made from a **clean detached worktree** at main's tip for
exactly that reason. It is the one path where the shared-tree hazard reaches
production.

> **The run was interrupted by two live production incidents. Both are now
> resolved and shipped.**
>
> **07:12 — the service worker.** A user on full LTE bars was served
> `offline.html` and could not get past it. Fixed in
> [#1094](https://github.com/njrini99-code/helmv3/pull/1094).
>
> **04:10Z–13:38Z — the real one: production Postgres was wedged**, serving
> zero queries for 9.4 hours while Supabase's control plane still reported
> `ACTIVE_HEALTHY`. That is what had the site erroring on every route, what
> kept `BaseballHelm authenticated smoke` red, and what blocked every live
> database question in this report. Fixed by an owner-approved Management API
> restart. Root cause of the wedge remains unknown — the restart destroyed the
> evidence. See `DATABASE_STATUS.md` → OPS.
>
> **Deployed 14:30Z.** `main` does not auto-deploy, so this was a deliberate
> one-shot `vercel --prod` after five PRs landed (#1098, #1097, #1095, #1096,
> #1092). Verified live: `sw.js` carries the fix, `/api/health` returns
> `database: "ok"`.

_The earlier caveat here — "CI is green except `BaseballHelm authenticated
smoke`, red for reasons unrelated to the diff" — is resolved. That job was red
because production Postgres was wedged, not because of anything in the branch.
Once the database was restarted it passed, and with it the `all` aggregate._

The brief asked for an honest split between complete, production-usable,
improved-but-incomplete, blocked, intentionally-hidden, and out-of-scope. That
is what this file is. Where a claim is weaker than it sounds, the weakness is
stated next to it rather than in a footnote.

---

## Status at 2026-07-29 12:30 EDT

The mission's own deliverable is **merged and deployed**. Everything below the
next heading is the overnight record and still stands. This block is what
happened after it.

| Thing | State |
|---|---|
| #1092 — the mission PR, 93 commits | **Merged + deployed.** All CI green, incl. `BaseballHelm authenticated smoke` |
| #1094 service-worker fix, #1095, #1096, #1097, #1098 | **Merged + deployed** in the same one-shot `vercel --prod` |
| Production Postgres wedged 04:10Z–13:38Z | **Resolved** by an owner-approved Management API restart. Root cause of the wedge unknown; the restart destroyed the evidence |
| Six RLS exposures | **Confirmed live against production `pg_policies`**, not inferred from migration source. Fixes authored, still applied to nothing |
| #1099 — follow-ups | Open, `MERGEABLE/CLEAN`, nothing failing |

### What #1099 carries

- **Landing hamburger** opened 2,000px above the viewport when scrolled. The
  scroll lock used the `overflow` shorthand on `<body>`, which sets
  `overflow-x` too and promotes body to a scroll container — defeating
  `position: sticky` on the header, exactly as `globals.css:173-188` warns.
  Measured before/after in a real browser.
- **Bridge user-detail** unreadable on a phone (four-line meta block, log lines
  clipped mid-word). Not re-measured after the fix — no authenticated Bridge
  session available; stated in the commit rather than implied.
- **Bridge incident counts** disagreed across three surfaces (4 / 3 / up to 9)
  because they counted rows vs groups vs kind-filtered groups. All three now
  read one field.
- **Bridge Resolve** did nothing for the founder's account: `requireSuperAdmin()`
  gates on an env var, the `resolve_admin_event` RPC gates on the
  `admin_allowlist` TABLE, and the account was in one and not the other.
  Unblocked by adding the row (owner-approved). The two gates still read
  different sources of truth — **open**.
- **Auto-resolve Rule C.** Auto-resolve already existed and ran nightly, but
  both its rules key on fingerprint and so could never touch the 87,653
  null-fingerprint rows that are 99% of the backlog.
- ~~**`unresolve_admin_event`** authored as a migration file, **not applied**.~~
  **APPLIED 2026-07-29 afternoon.** It also turned out to be anon-EXECUTEable —
  Supabase default-grants EXECUTE to `anon` on new public functions, and
  `REVOKE … FROM PUBLIC` does not remove that role-specific grant. Not
  exploitable (it self-gates on `is_super_admin()`; an anon call was exercised
  and returned `42501 Forbidden` before touching a row), but the grant is now
  revoked so the gate is not the only thing standing between anon and an admin
  write. A second function, `log_crm_stage_transition`, needed
  `REVOKE … FROM PUBLIC` rather than `FROM anon`, because its grant came through
  PUBLIC and revoking from `anon` was a silent no-op — verified the CRM trigger
  still fires afterwards.

### Corrections to earlier versions of this report

Stated plainly because each was asserted confidently before being checked:

- The "last successful resolve" was **not** a human on the `admin@` account —
  it was the nightly auto-resolve cron, which uses the service role and bypasses
  the RPC gate entirely.
- "One fingerprint accounts for 87,653 rows" and "the largest error is 82,088
  rollup timeouts" were both artifacts of `GROUP BY fingerprint` bucketing NULLs
  together. See `DATABASE_STATUS.md` § A trap in this table. The rollup timeout
  last fired **2026-04-24** and is not an open problem; the real largest is
  `Client error: network error` at 71,660 rows, also historical.
- An earlier heartbeat reported the service worker as "a very likely culprit"
  for the mobile-menu report, then tested it and it passed. The eventual cause
  was the body scroll lock.

---

## Read this first

**1. Seven live security findings in production, all predating this branch.**
Every one is in the 2026-05-27 baseline. None was introduced by this work.

**All six baseball findings were re-verified directly against production
`pg_policies` at 10:40 EDT** — not inferred from migration source. Every one
is live and unmodified. Rows are the measured blast radius.

| | Table | What is exposed | Rows | State |
|---|---|---|---|---|
| 🔴 | `baseball_messages` | **Every private coach↔player message in the database — read AND write** | 80 | Confirmed live · fix written |
| 🔴 | `baseball_players` | Every program's roster PII — email, phone, GPA, SAT/ACT | 35 | Confirmed live · fix written |
| 🔴 | `baseball_teams` | Every team's secret `join_code` | 13 | Confirmed live · fix written |
| 🟡 | `baseball_team_invitations` | Every live invitation `code` | **0** | Confirmed live · fix written · empty today |
| 🟡 | `baseball_player_percentiles` | Every player's academic + athletic ranking | **0** | Confirmed live · fix written · empty today |
| 🟠 | `baseball_coaches` | Every coach's email + phone, to any coach | 10 | Confirmed live · **not fixed** — product decision |
| 🟠 | `golf_coaches` | Every golf coach's email + phone, to *any* logged-in user | — | **Not fixed** — out of scope, live product |

Two of these were downgraded 🔴→🟡 by the live read: the invitation and
percentile policies are genuinely broken but currently hold **zero rows**, so
they are correctness bugs with no present exposure. They ship with the pair;
they are not tonight's emergency. Nothing was downgraded on the strength of
being hard to fix.

Also from the live read: **every policy above is granted to `authenticated`,
none to `anon`.** The exposure requires an account. Baseball signup is open
self-serve so the practical bar is "anyone who registers" — a real
cross-tenant failure — but it is not readable from the open internet, and the
earlier version of this table did not distinguish those.

Plus one write hole: `baseball_notifications` let any authenticated user post a
notification into anyone's feed (in-app phishing, not a leak). **Fix written**
(`bcbba306b`) and it is in migration B, so it applies with the rest. The
obvious `auth.uid() = user_id` would have broken the product — practice-publish
and coach lift messages legitimately notify *other* users through the caller's
own session — so it gates on a definer `can_notify_baseball_user()` instead.
See `DATABASE_STATUS.md`.

**➜ If only one thing gets applied in the morning, apply the
`baseball_messages` fix.** Three baseline policies compare
`cp.conversation_id` to *itself* — always true — so the predicate reduces to
"is the caller in *any* conversation". One conversation anywhere buys every
DM in every program, plus the ability to post into any private thread under
your own name. It survived two months because the same rule written
*correctly* sits twenty lines below it, and permissive policies OR together,
so the correct one never mattered.

That fix is **three `DROP POLICY` statements, no `CREATE`, no app change**,
safe under both old and new code because every dropped policy already has a
correctly-correlated twin. Alone among this work it needs no deploy ordering.

The other five fixes ship as a **sequenced pair** of migrations —
`DATABASE_STATUS.md` has the reasoning, `CURRENT_PRIORITIES.md` the checklist.
All are verified by execution in CI (six pgTAP suites, 93 assertions) and
**applied to nothing**.

**2. Nothing in this run applied a migration.** No `apply_migration`, no
`supabase db push`, no `psql`. Once the database came back at 13:43Z it was
read — `pg_policies`, `information_schema`, `count(*)` — and **every one of
the six exposures above was confirmed live in production**, matching migration
source exactly. That upgrades this table from "verified from migration source"
to "verified against the running database", which is the difference between a
claim and a fact. Read-only throughout; the only writes this run made were to
files and to git. Detail, including two corrections the live read forced:
`DATABASE_STATUS.md` → § Live verification.

**3. Do not demo against a prospect's own data until (1) is applied.** A demo
org is fine.

### How they were found — the transferable part

Recon reported **two** of the seven. The rest came from re-asking the previous
question one level wider. None needed information that was not in the repo on
day one:

| Question | Found |
|---|---|
| What *else* uses the same `.eq('code', …)` shape as the join_code leak? | `baseball_team_invitations` — a policy literally named *"Anyone can view active invitations by code"* that checks no code. Noticed **twice** before (`20260701000000:173`, `20260708141000:86`), described accurately both times, deferred as out of scope both times. |
| What *else* in the baseline is `FOR SELECT … USING (true)`? | `baseball_player_percentiles`. Thirty seconds of grep; should have been the first thing run. |
| Then where would a *fifth* be — a predicate neither `true` nor missing? | `baseball_coaches`. The prediction was written at the end of the previous sweep, then actually executed. |
| Read the policies of the untested tables *before* writing their tests | `baseball_messages` — the worst of the seven, from a task meant to produce coverage. |
| Re-run all of it across *every* table, not just `baseball_*` | `golf_coaches`, on the live revenue product. |

Four further sweeps came back **clean** and are recorded in
`DATABASE_STATUS.md` so nobody repeats them: RLS is enabled on all 98 baseball
tables, the self-comparison typo exists nowhere else, the write surface is
otherwise clean, and every definer function already has a pinned
`search_path`.

---

## The through-line: reading is not verifying

The run's most serious findings were invisible to inspection and surfaced only
by running something. This is the most useful thing the night produced, and it
is worth more than any individual fix:

| Found by | What it was |
|---|---|
| **Executing the SQL** (CI, 4 rounds) | Two independent recursion cycles in the new RLS policy. Either one makes **every** query against `baseball_players` fail — a confidentiality fix converted into a total outage. Two adversarial reviewers had read this migration line by line against the real schema and found neither. |
| **Executing the SQL** | All five new functions were anon-callable. `REVOKE ... FROM PUBLIC` does not remove Supabase's role-specific default grant to `anon`. |
| **Asserting the props object, not the DOM** | The public player page shipped withheld GPA, SAT, ACT and private video URLs inside its HTML. The client gated them in JSX, which keeps data out of the DOM and not out of `curl`. The first version of the fix still leaked every URL under the raw relation key — the payload test caught that too. |
| **Running the seed script** | Its "production guard" *allowlisted* production, plus two bypasses (`<prodref>.example.invalid` was trusted on a first-label substring; any `.local` host on the LAN was trusted as loopback). |
| **Counting what a config selects** | Three vitest projects matched ~870 files each instead of 5, 0 and 7 — `extends: true` merges array options rather than replacing them. CI's "Business contracts" job was re-running the entire unit suite under a name promising seven contract files. The config's own comment asserted the opposite of what the tool does, which is what preserved it. |
| **Executing the pgTAP** | A fixture that passed auth user ids where `baseball_coaches.id` was required. Zero of ten assertions ran. Worth noting because a fixture error and a policy regression look identical from outside — only the error text distinguishes them. |
| **Parsing the JSX instead of grepping it** | A regex check for nested interactive elements reported 27 violations; **all 27 were false positives** (`<button onClick={() => x} />` contains a `>`, so a `[^>]*/>` self-close pattern never matches and every later button looks nested), and the **two real ones were not among them**. The lesson is not "regex is bad" — it is that a checker reporting a number nobody verifies is worse than no checker, which is why the guard now asserts it reports non-zero on a known-bad fixture. |
| **Checking that a mock took effect** | A new suite mocked `isRecruitingEnabled` to assert a route was blocked *and* that re-enabling reopens it. `vi.mock` replaces a module's **exports**; `isPathnameModuleDisabled` calls the flag **internally**, through the module's own binding, so the mock never applied. Five of six assertions went green — on the real flag. The suite looked like it proved both directions while proving one. Green is not the same as meaningful. |
| **Auditing the inventory, not just the sweep** | `recruiting-sunset-doors.test.ts` walks `MODULE_ROUTE_PREFIXES` across every role × program type and passed all night. `/baseball/dashboard/activate` — the route that *turns recruiting on* — was not in that list, so the sweep could not see it. A sweep is only as complete as the inventory it iterates; the inventory now has its own assertion. |
| **Actually flipping the flag** | "One line brings recruiting back" is asserted in four documents. Flipping it fails **54 unit tests in 7 files** — every one a test asserting recruiting is hidden, so the behaviour is right, but the `restore` note warned about 8 of them. A wall of red in unnamed files is deleted, not read, and what would have been deleted is the sunset's own regression coverage. Now measured and enumerated in `restore`. |

The corollary, recorded because it cuts the other way: recon reported a P0 that
**did not exist** (the staff-invite RPC missing an email-ownership check — it
has one, at three layers). One false positive at the highest severity means the
rest of that document deserves the same read-the-source treatment before anyone
acts on it. It is retracted in place, not deleted, and pinned by a test.

---

## Complete and verified

Each has tests, and the tests assert behaviour rather than existence.

- **Recruiting sunset, closed at every layer.** Nav registry, hub resolution,
  server route guards, middleware, and — the one every other gate missed —
  the public `/baseball/packet/<token>` share link, reachable with no session
  at all and still serving a high-school player's measurables and video to
  anyone holding an old URL.
- **The sunset preserves rather than deletes.** Tests that asserted pre-sunset
  behaviour were *kept* and re-run under a mock-enabled module, so
  `PRODUCT_MODULES.recruiting.enabled = true` restores the feature against a
  green suite instead of an archaeology project.
- **The one recruiting route that could turn recruiting back on is shut.**
  `/dashboard/activate` flips `baseball_players.recruiting_activated` and makes
  a player discoverable to other programs. Nav hid it; nothing closed it. It
  was missing from `MODULE_ROUTE_PREFIXES` even though the middleware that
  reads that list names `/activate` in its own comment as a reason to defer to
  the registry. Every other recruiting route only *displays* recruiting — this
  one writes state that would have outlived the sunset.
- **Calendar stopped selling a module the buyer cannot reach.** A college coach
  with no team yet — an ordinary first login, and one on the demo path — was
  shown "Your recruiting calendar is empty" under a **Browse prospects** button
  pointing into a blocked route. Gated at read time, so the recruiting
  narrative returns unedited when the module does.
- **The player's first screen after login no longer advertises a redirect.**
  Four surfaces — Today, Profile, Passport, and a player's own public profile —
  carried a green **Activate Recruiting** button. The one on the public profile
  is *kept*, not hidden: it discloses that the page is private to the viewer,
  which stays true and matters more under the sunset; only its explanation and
  its dead CTA changed.
- **The front door stopped selling the module we removed.** `/baseball`'s
  `<title>`, both social cards, the H1, the hero and an entire feature section
  pitched the recruiting pipeline. Replaced — not stripped — with practice,
  readiness and attendance, every claim of which is backed by shipped tables.
  One flag flip restores the original wording byte for byte.
- **No hardcoded baseball link points at a route that does not exist.** 283
  routes resolved against 2,739 files: zero dead links, proven by a probe that
  makes the sweep fail on demand rather than by trusting a green run.
- **Both seeds stopped writing recruiting players into production.** The demo
  seed created, on every reseed, 3 fictional organizations and teams, 8
  `baseball_players` with emails, GPAs and measurables — each
  `recruiting_activated = true`, the flag that makes a player publicly NAMED
  rather than masked to initials — and 8 watchlist rows for a pipeline no coach
  can open. The verifier that runs immediately afterwards already asserted "the
  demo must not carry a recruiting board", so the seed and its own verifier
  were contradicting each other inside one `npm run seed:baseball:demo`.

  The **E2E** seed had the same shape and runs on every push to `main`: a
  "Jordan Hayes" player row with the same flag, a watchlist entry, and an "E2E
  Prospect Camp" — for two specs that now skip. A fixture nothing reads stops
  being distinguishable from real data.
- **Two rule-engine rules stopped nagging players about recruiting.** They gate
  on the player's opt-in, which was sufficient until the sunset — a player who
  activated *before* it still carries `recruiting_activated = true`, so both
  kept firing and kept telling them to finish a recruiting profile, as a task in
  their inbox. Gated on rule `ownerRole`, so a future recruiting rule is covered
  the day it is written.
- **Seven E2E specs stopped driving routes that redirect.** 46 tests skip with a
  reason naming the cause, one is repointed at live routes, and two assertions
  that were passing on the *redirect target* (both `/camps` and `/journey` land
  on pages that also have an `<h1>`) are now conditional.

  **Correction to how I first described this.** I wrote in the commit message
  that "the first PR touching an E2E-relevant path inherits a wall of red".
  That is wrong, and the truth is worse: `playwright.yml` runs
  `Playwright (chromium)` on **push to `main`** or manual dispatch only — never
  on a pull request. PRs get the cheap advisory a11y smoke from `pr-smoke.yml`.
  So nothing would have gone red until #1092 **merged**, on main, after review,
  with no PR signal at any point beforehand.

  It also means CI cannot verify this fix before merge. The evidence is a local
  run against a deliberately dead base URL (`http://127.0.0.1:9`), where all 46
  tests in the five gated specs report "skipped" — nothing could have passed by
  reaching a real page.
- **A guard against the next one.** `no-inbound-links-to-disabled-modules`
  fails when a file outside a module links into it without consulting the gate.
  Its first draft failed on the five sites just fixed — the markup is still
  there, inside a conditional a source scan cannot see — and satisfying that
  draft would have meant deleting the links instead of gating them. The rule
  became "consult the gate", and the header states the residual gap rather
  than implying more coverage than exists.

## The production incident (2026-07-29 07:12 EDT)

Not part of the mission brief; it arrived mid-run and took precedence.

**Symptom.** A user on full LTE bars, on an iPhone, taps the marketing site's
mobile menu. Nothing navigates. Then: a full-page **"No Connection — Helm
Sports Labs needs an internet connection."**

**Cause.** `public/sw.js` is registered `scope: '/'` by the GOLF DASHBOARD's
`OfflineProvider`. It therefore controls the entire origin — marketing,
BaseballHelm, auth — although only the golf dashboard ever wanted offline
support. Every other navigation reached `handleDynamicRequest`, whose `catch`
turned **any** `fetch` rejection into `offline.html`. No retry, no
`navigator.onLine` check, and the page's only exit re-entered the same handler.
One transient blip and the site was gone until website data was cleared.

**Fix** (#1094, merged, **undeployed**): navigations outside the golf dashboard
are not intercepted at all; the offline page is served only when
`navigator.onLine === false`; the synthetic empty `404`/`503` responses are
gone; cross-origin requests are skipped. Golf's offline support is preserved
and a test asserts it, so "stop intercepting" cannot become "delete the
feature".

**On method — three wrong turns worth recording, because each was caught by
running something rather than by thinking harder:**

1. I measured the mobile menu's tap targets as `0×0` and nearly reported it as
   the bug. It was **my own test artifact** — the window resized but the
   viewport did not, so a `md:hidden` rule made the sheet `display: none`.
2. I told the user the service worker was "a very likely culprit", then tested
   it: registered it, confirmed it was controlling the page, and the menu
   worked. I retracted that publicly before they acted on it. Four
   reproduction attempts against production all passed — the deployed build
   really was fine, and it took **their screenshot** to identify the trigger.
3. I reported `CACHE_VERSION` as a third defect — a constant that never
   changes, so caches never invalidate. Wrong: `prebuild` runs
   `scripts/stamp-sw.mjs`, which rewrites it to the commit SHA on real Vercel
   builds. I had read the constant and assumed its runtime value. Retracted; no
   change made.

The worker had **no tests** and is the most dangerous file in the repo — a bad
one pins every client permanently, and you cannot push a fix to a client that
will not fetch. It has 10 now, and they were validated against the SHIPPED
worker: 5 fail on it, and the 5 covering preserved behaviour still pass.

## Verified, and the answer was "already fine"

Recorded because a checked-and-clean result is evidence, and re-checking it
tomorrow is waste:

- **No empty `catch {}` in any baseball source file.** One textual hit, inside
  a comment describing a suppression that was already removed.
- **No unscoped `DELETE` or `TRUNCATE` in any baseball seed.** Five seed
  scripts, two `.delete()` calls total, both narrow and both documented at the
  call site: `login_attempts` filtered to the two demo emails (lockout carried
  over from a failed CI run), and `baseball_camp_registrations` filtered to
  `(camp_id, player_id)` so the register/unregister spec starts clean. Checked
  because `.env.local` points at production and the rule was explicit.
- **`loading.tsx` coverage.** Every live baseball dashboard and player route
  has one, except `operations` and `stats`, which inherit the dashboard-level
  fallback.
- **`/watchlist` and `/analytics` were never open.** Both call
  `requireRecruiting*Route`. They are absent from `MODULE_ROUTE_PREFIXES` on
  purpose, and adding them would duplicate an existing control — the test that
  checks this now asserts "the door is shut" rather than naming one lock.
- **Roster status changes propagate to Lift Lab.** A cut player stayed
  `is_active` forever; nothing was going to converge, because the sync RPC is
  `ON CONFLICT DO NOTHING` and could add an athlete but never deactivate one.
  Deactivate, never delete — their lifting history is the program's record of
  work done.
- **"Sync Athletes" actually syncs.** Every call passed a parameter name the
  RPC does not have, and the error was never read: a green toast over zero
  rows. Assigning a team now also seeds its athletes, which the doc comment had
  claimed for months without it being true.
- **Roster "Add existing player" is a lookup, not a browse.** Typing `sm`
  returned strangers' names and email addresses from every program in the
  database — the tenant-isolation leak shipped as a feature.
- **Invite codes stopped being world-readable**, and the join screen tells the
  truth on the way through. A deactivated or expired invitation used to be
  indistinguishable from a fake one — the old policy filtered `is_active`
  itself, so the code's own error branches were unreachable and a player with
  a real-but-switched-off link was told it was invalid.
- **Player percentile rankings are no longer public to every account.** The
  policy was called "Anyone can view percentiles", which is what you would
  name a table of league benchmark curves; it sat on a per-player table
  holding `percentile_gpa` and `composite_academic`.
- **The vitest projects select the files they claim to.** A root-level
  `include` was being *merged* into every project (`extends: true` merges
  arrays, it does not replace them), so `integration`, `rls` and `business`
  each matched ~870 files instead of 5, 0 and 7. CI's "Business contracts"
  job was therefore re-running the whole unit suite under a name that
  promised seven contract files. The config's own comment claimed the
  opposite, which is probably why nobody looked.
- **The select's clear button is no longer nested inside its trigger button.**
  Interactive content inside a `<button>` is invalid HTML; browsers *split*
  the outer button while parsing, so server-rendered markup reparses into a
  different tree than React expects and hydration mismatches. CLAUDE.md
  records this as a known crash class — and nothing executed the rule, so it
  drifted back in. There is now a parser-based guard over every `.tsx` in the
  repo; it currently reports zero across baseball, golf, fairway and lifting.
- **Three bottom bars stopped rendering 3 tabs instead of 4.**
- **The public player profile withholds at the server**, not just at the
  renderer.
- **The demo seed refuses production** unless explicitly told otherwise.
- **Re-syncing repairs an athlete's Lift Lab account link.** It was write-once,
  so every athlete the demo seed wrote directly (`user_id: null`) was locked
  out of `/lifting/dashboard` permanently — the one mechanism that could have
  supplied the id was the one declining to write it.

## Production-usable, but not proven

- **The RLS migrations.** CI applies both to a fresh Postgres and passes
  34/34 pgTAP assertions for tenant isolation, 19/19 for invitation codes and
  9/9 for the Lift Lab sync, with 9 more for player percentiles. That proves
  they are correct against a database built from migrations — **not** against
  production's actual state — which **has now been read**, at 10:40 EDT, and
  matches on every one of the six policies (§ Live verification in
  `DATABASE_STATUS.md`). One genuine drift was found elsewhere: the live
  `public_profile_mode` column default is `'unlisted'`, not the `'private'`
  the committed DDL declares.
- ~~**The companion app changes.** … only exercised once migration B is applied
  somewhere.~~ **Now exercised** — B is applied and each flow was run through
  the exact RPC the app calls, as a real non-member: join-by-code → 1 row,
  join-context → 1 row, roster exact-email → 1 row, roster `'sm'` → **0 rows**
  (that last one is the leak itself: the old search was an unscoped ILIKE over
  name *and* email, so two characters returned strangers' addresses).

- **What is genuinely still unproven after all of it.** Every verification
  above — pgTAP, live `pg_policies`, role impersonation — operates on rows and
  counts. None of it renders a page. The RLS failure mode most worth fearing is
  an **empty result displayed as a blank screen rather than an error**, and a row
  count cannot distinguish that from success. No browser walked join-by-code, the
  roster search, or Discover/Compare after the change. Production also carries
  little traffic right now, so the clean error logs are weak evidence.
  **Residual risk is a rendering or call-shape bug in the app, not a policy that
  denies too much** — the policies themselves have been executed as real users.

## Improved but incomplete

- **Seed data.** Announcements, Travel, Documents, Post-Game Reviews and
  lifting entries now have coverage, the verifier no longer overstates, and a
  skip exits non-zero instead of printing under a success banner. Not
  end-to-end verified against a live database, because none was reachable.
- **`PlayerProfileClient`** (1,701 lines) got the payload fix, honest empty
  states and a shape-matched skeleton. It is not a finished Fairway migration.
- **The Settings hub** is unified across 28 files with the worst a11y
  regression fixed and the first tests it has ever had — but its test coverage
  is thin relative to the size of the change.

## Blocked, deliberately

- ~~**Applying anything to the database.**~~ **Unblocked and done** on
  2026-07-29 afternoon, on the owner's explicit instruction with them awake —
  which is precisely the condition this entry said to wait for. The reasoning is
  preserved rather than deleted: it is the argument that has to be made again
  next time, not a mistake. The two recursion cycles CI caught remain the
  concrete vindication of having waited.

- **Still deliberately unapplied, and these are the live ones:**
  - **#1103** — golf shot-detail RLS, `3413ms → 515ms` (returning *zero* rows),
    row-for-row equivalence proven across 3,394 production rows on both the
    player and coach branches.
  - **#1105** — `baseball_coaches` org scope, measured across all ten coach
    identities, nobody losing their own row.

  Both are RLS changes on live products with **no pgTAP coverage yet**, and
  `CLAUDE.md` mandates `db-migration-reviewer` for RLS. A 6.6× perf win and a
  tidy audit do not justify skipping the gate that caught two
  product-down-on-apply bugs earlier in this same run. The measurements were
  taken by applying inside a transaction and rolling back — evidence, not a
  substitute for the gate.

- **A note on authorization, because it matters for the next run.** The
  afternoon's applies happened under a specific, explicit instruction. That
  permission is **spent**, not standing: the autonomous rule is back to "never
  apply a database migration", which is why #1103 and #1105 sit written and
  unapplied rather than being pushed through on the momentum of the earlier
  approval.

- **Two blockers that are billing, not code:** the Anthropic API credit balance
  is exhausted (11 chat failures) and the Vercel AI Gateway free tier is
  blocking `round_review` (3 failures). No amount of engineering clears either.

## Intentionally hidden

- **The entire recruiting module.** Code, migrations, types and data all
  preserved. One line in `src/lib/baseball/product-modules.ts` brings it back,
  and `restore` documents what to re-verify first.

## Out of scope

- **`golf_coaches` PII is readable by any authenticated user.** Found while
  re-running the baseball sweeps across *every* table on the theory that a
  shared baseline shares its mistakes. `golf_coaches_select_all` is
  `USING (true)`, it is the only SELECT policy on a table holding `full_name`,
  `email` and `phone`, and it has never been touched. The identical baseball
  policy was recognised and dropped on 2026-07-01 with the reasoning written
  out — the migration was scoped to baseball and the golf half never happened.
  Golf is therefore *less* protected than baseball is even today.

  **Not changed.** GolfHelm is live, is not this mission's scope, and the fix
  is two migrations rather than one: there is no `golf_coaches_public` view to
  absorb the legitimate reads, so dropping the policy alone would break every
  golf surface that renders a coach's name. `DATABASE_STATUS.md` has the
  detail. Flagging it is in scope; changing the revenue product at 05:40
  unattended is not.

- **The Elite stat event model** — 8 tables, ~10 dedicated migrations, **zero
  rows** in production. Real schema investment behind a pitch-by-pitch
  analytics model that has never received a single row. Keep or graveyard is a
  product call.

---

## Open, and worth knowing before the demo

| | |
|---|---|
| **CI seeds PRODUCTION on every PR — confirmed from CI's own log** | `seed:baseball:ci` creates auth users, force-resets two passwords and deletes `login_attempts` rows in the production project. It has always done this. The strengthened guard makes it say so out loud now: `⚠ SEEDING PRODUCTION (qmnssrrolpinvwjjnufo) — allowed only because --allow-prod was passed`. Surfaced, not changed — flipping a working deployment behaviour unattended is not mine to do — but it should almost certainly target a local stack instead. |
| ~~**Production Supabase was intermittently failing all night**~~ ✅ **ROOT-CAUSED AND RESOLVED** — it was not intermittency; production Postgres was WEDGED, serving zero queries for 9.4h while the control plane reported `ACTIVE_HEALTHY`. Fixed by an owner-approved Management API restart at 13:38Z. Original text kept below for the diagnostic detail. | REST and auth answered 401 in ~0.1s while direct Postgres connections timed out on every attempt from 00:30 to 03:00 EDT. CI's seed step hit a **Cloudflare 522** from `qmnssrrolpinvwjjnufo.supabase.co` at 06:03 UTC and again at 07:46, both ending `createUser failed for demo-coach@baseballhelmdemo.com`. Reads as connection-pool exhaustion or compute pressure rather than a hard outage. It is why live `pg_policies` could not be confirmed, and it is the sole reason the `BaseballHelm authenticated smoke` check is red on #1092 — it was red before any of this work and the cause is unrelated to the diff. |
| ~~**`public_profile_mode` semantics are unsettled**~~ **SETTLED — live default is `'unlisted'`, drifted from the committed DDL's `'private'`.** Impact today is zero (recruiting sunset), so this is a note about production-not-matching-its-migration, not an action. Original text: | DDL default is `'private'` (`20260624000091:23`); a 2026-07-09 live read recorded `'unlisted'`. If the DDL is what is live, `baseball_teams_public_profile` is default-**deny** and zeroes cross-org discovery. Recruiting is sunset so impact today is zero. One query settles it. |
| **The pgTAP RLS coverage gap is now closed for the tables that had none** | Messaging, tasks, travel, announcements and developmental plans all have suites as of this run. Writing them found two P0s: the invitation-code leak (twice noticed and twice deferred by prior migrations) and the `baseball_messages` typo (never noticed by anyone). Two for five tables is not a coincidence — an untested policy is an unverified claim, and this codebase now has the evidence to say so rather than the intuition. |
| ~~**`helm_lifting_athletes.user_id` is stale in production**~~ ✅ **FIXED AND REPAIRED 2026-07-29** | Migration `20260729000300` applied, and the repair itself RUN — applying the file only makes repair possible, a coach clicking "Sync Athletes" performs it. Measured before: **21 of 22 athletes had `user_id` NULL and `is_active`**, every one unable to open `/lifting/dashboard`, permanently, because `DO NOTHING` meant the only mechanism that could supply the id refused to. After: **0 unlinked, 22 active (unchanged — no activation flipped), every link equal to its source player's `user_id` across 22 distinct accounts.** Verified in a rolled-back transaction FIRST that a deactivated athlete stays deactivated; including `is_active` in the upsert would resurrect cut players on every sync. |

---

## Honest notes on how this was run

- **12 subagents across 4 workflows**, every implementation packet followed by
  an independent adversarial reviewer told to assume the claim was overstated.
  That paid: reviewers caught a join-by-code fix that was 1 of 3 required
  changes, a "fixed" visibility gate that was DOM-only, a production guard that
  allowlisted production, and a test that passed by asserting a false sentence.
- **Reviewers were also wrong sometimes** — one asserted a horizontal-overflow
  consequence that `overflow-hidden` makes impossible. Their findings were
  checked, not adopted.
- **I was wrong sometimes too, and the retractions are in the tree.** I reported
  three open recruiting doors and wrote gates for all three; two of them —
  `camps` and `scout-packets` — were already in `MODULE_ROUTE_PREFIXES` and
  already enforced at `src/lib/supabase/middleware.ts:408`. Reverted rather
  than shipped, because the code would have been harmless while its comments
  described gaps that did not exist, and a wrong comment outlives the person
  who wrote it. Same for the retracted staff-invite P0. `CURRENT_PRIORITIES.md`
  keeps a running "Corrections" list so no claim gets promoted by repetition.
- **The heartbeat is real but session-scoped.** `CronCreate` job `9234a858`
  fires hourly at :11 while this session is alive and idle. Nothing on disk
  restarts it if the process exits. The durable recovery mechanism is
  `RESUME_INSTRUCTIONS.md` plus the commit history, not the cron job.
- **A shared working tree.** Another session holds ~100 uncommitted files in
  `src/app/golf/admin/crm/**` and `src/components/landing/**`. Every commit here
  was path-scoped and verified with `git diff --cached --name-only` first; none
  of that work was swept in.
