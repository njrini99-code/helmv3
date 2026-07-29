# FINAL REPORT — BaseballHelm overnight run

_2026-07-28 23:35 → 2026-07-29 06:00 EDT. Branch
`baseball/overnight-completion`, draft PR
[#1092](https://github.com/njrini99-code/helmv3/pull/1092), 45 commits.
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

Plus one write hole: `baseball_notifications` lets any authenticated user post
a notification to anyone (in-app phishing, not a leak). Not fixed — the
obvious fix breaks practice-publish; see `DATABASE_STATUS.md`.

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
05:30 EDT.

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
- **The heartbeat is real but session-scoped.** `CronCreate` job `9234a858`
  fires hourly at :11 while this session is alive and idle. Nothing on disk
  restarts it if the process exits. The durable recovery mechanism is
  `RESUME_INSTRUCTIONS.md` plus the commit history, not the cron job.
- **A shared working tree.** Another session holds ~100 uncommitted files in
  `src/app/golf/admin/crm/**` and `src/components/landing/**`. Every commit here
  was path-scoped and verified with `git diff --cached --name-only` first; none
  of that work was swept in.
