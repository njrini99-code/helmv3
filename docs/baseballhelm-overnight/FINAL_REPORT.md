# FINAL REPORT — BaseballHelm overnight run

_2026-07-28 23:35 → 2026-07-29 06:40 EDT. Branch
`baseball/overnight-completion`, draft PR
[#1092](https://github.com/njrini99-code/helmv3/pull/1092), 77 commits ahead
of `main`. Full unit suite green at 06:37: **868 files, 8,221 tests**.
CI is green except `BaseballHelm authenticated smoke` (and the CI aggregate
that depends on it), which fails on a Cloudflare 522 from the production
Supabase — red before this branch existed, unrelated to the diff, and the
same outage that blocked every live database question below._

The brief asked for an honest split between complete, production-usable,
improved-but-incomplete, blocked, intentionally-hidden, and out-of-scope. That
is what this file is. Where a claim is weaker than it sounds, the weakness is
stated next to it rather than in a footnote.

---

## Read this first

**1. Seven live security findings in production, all predating this branch.**
Every one is in the 2026-05-27 baseline. None was introduced by this work.

| | Table | What is exposed | State |
|---|---|---|---|
| 🔴 | `baseball_messages` | **Every private coach↔player message in the database — read AND write** | Fix written |
| 🔴 | `baseball_players` | Every program's roster PII — email, phone, GPA, SAT/ACT | Fix written |
| 🔴 | `baseball_teams` | Every team's secret `join_code` | Fix written |
| 🔴 | `baseball_team_invitations` | Every live invitation `code` | Fix written |
| 🟠 | `baseball_player_percentiles` | Every player's academic + athletic ranking | Fix written |
| 🟠 | `baseball_coaches` | Every coach's email + phone, to any coach | **Not fixed** — product decision |
| 🟠 | `golf_coaches` | Every golf coach's email + phone, to *any* logged-in user | **Not fixed** — out of scope, live product |

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

**2. Nothing in this run touched a database.** No migration applied, no
`supabase db push`, no `psql`. The only writes were to files and to git.
Production Postgres was unreachable all night in any case — last retried
06:22 EDT, still `Connection terminated due to connection timeout`.

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
- **The demo seed stopped writing a recruiting board into production.** Every
  reseed created 3 fictional organizations and teams, 8 `baseball_players` with
  emails, GPAs and measurables — each `recruiting_activated = true`, which is
  the flag that makes a player publicly NAMED rather than masked to initials —
  and 8 watchlist rows for a pipeline no coach can open. The verifier that runs
  immediately afterwards already asserted "the demo must not carry a recruiting
  board"; the seed and its own verifier were contradicting each other inside a
  single `npm run seed:baseball:demo`.
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

## Verified, and the answer was "already fine"

Recorded because a checked-and-clean result is evidence, and re-checking it
tomorrow is waste:

- **No empty `catch {}` in any baseball source file.** One textual hit, inside
  a comment describing a suppression that was already removed.
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
  production's actual state, which may have drifted and could not be read
  overnight (see the ops note below).
- **The companion app changes.** They work under both the old and new policies
  by construction, but the second half of that is only exercised once migration
  B is applied somewhere.

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

- **Applying anything to the database.** Shared production DB with live Golf
  users. The two recursion cycles CI caught are the concrete vindication: each
  would have taken the whole product down on apply. Reviewing this with the
  owner awake is worth more than four hours of exposure that has already stood
  for two months.

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
| **Production Supabase was intermittently failing all night** | REST and auth answered 401 in ~0.1s while direct Postgres connections timed out on every attempt from 00:30 to 03:00 EDT. CI's seed step hit a **Cloudflare 522** from `qmnssrrolpinvwjjnufo.supabase.co` at 06:03 UTC and again at 07:46, both ending `createUser failed for demo-coach@baseballhelmdemo.com`. Reads as connection-pool exhaustion or compute pressure rather than a hard outage. It is why live `pg_policies` could not be confirmed, and it is the sole reason the `BaseballHelm authenticated smoke` check is red on #1092 — it was red before any of this work and the cause is unrelated to the diff. |
| **`public_profile_mode` semantics are unsettled** | DDL default is `'private'` (`20260624000091:23`); a 2026-07-09 live read recorded `'unlisted'`. If the DDL is what is live, `baseball_teams_public_profile` is default-**deny** and zeroes cross-org discovery. Recruiting is sunset so impact today is zero. One query settles it. |
| **The pgTAP RLS coverage gap is now closed for the tables that had none** | Messaging, tasks, travel, announcements and developmental plans all have suites as of this run. Writing them found two P0s: the invitation-code leak (twice noticed and twice deferred by prior migrations) and the `baseball_messages` typo (never noticed by anyone). Two for five tables is not a coincidence — an untested policy is an unverified claim, and this codebase now has the evidence to say so rather than the intuition. |
| **`helm_lifting_athletes.user_id` is stale in production** | Write-once at seed time, never re-synced. Any player synced before their account was linked permanently fails the athlete-self gate at `/lifting/dashboard`. |

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
