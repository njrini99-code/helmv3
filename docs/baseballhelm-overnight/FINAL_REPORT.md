# FINAL REPORT — BaseballHelm overnight run

_2026-07-28 23:35 → 2026-07-29 04:30 EDT. Branch
`baseball/overnight-completion`, draft PR
[#1092](https://github.com/njrini99-code/helmv3/pull/1092), 32 commits.
CI is green except `BaseballHelm authenticated smoke`, which fails on a
Cloudflare 522 from the production Supabase — red before this branch existed,
unrelated to the diff._

The brief asked for an honest split between complete, production-usable,
improved-but-incomplete, blocked, intentionally-hidden, and out-of-scope. That
is what this file is. Where a claim is weaker than it sounds, the weakness is
stated next to it rather than in a footnote.

---

## Read this first

**0. Every private message in the database is readable — and writable — by any
authenticated user who is in a single conversation.** Three baseline policies
on `baseball_messages` compare `cp.conversation_id` to *itself*, which is
always true, so the predicate means "does the caller participate in any
conversation at all". One conversation anywhere buys every coach↔player DM in
every program, plus the ability to post into any thread under your own name.
It survived two months because the same rule written *correctly* sits twenty
lines below it — and permissive policies OR together, so the correct one never
mattered.

**The fix is three `DROP POLICY` statements, no `CREATE`, no app change**, and
it is safe under both old and new code because every dropped policy already has
a correctly-correlated twin. It does not need to wait for the rest of the
sequence. If one thing gets applied in the morning, apply this.

**1. Five further cross-tenant exposures are open in production.** Any
authenticated user on any team can read every other program's roster PII —
email, phone, GPA, SAT/ACT — every team's secret `join_code`, every live
invitation `code`, and every player's academic and athletic percentile
ranking; and any coach can read every coach's email and phone. Live since
2026-05-27. The fixes are written, executed in CI, and **applied to nothing**
(the coach one is deliberately unfixed — it needs a product decision). It is a
three-step sequence: `DATABASE_STATUS.md` has the reasoning,
`CURRENT_PRIORITIES.md` has the checklist.

All four are one mistake repeated: an over-broad SELECT policy on a table
whose rows belong to somebody. Three are the sharper form — a secret in a
column guarded by a predicate that cannot see the query filtering on it. RLS
never sees a WHERE-clause literal, so "you may read this row if you already
know its code" always degrades to "you may read this row".

**Recon reported two of the four.** The other two came from asking narrower
questions afterwards: what *else* uses the same `.eq('code', …)` shape
(→ `baseball_team_invitations`, whose policy is literally named *"Anyone can
view active invitations by code"* and checks no code — noticed **twice**
before, at `20260701000000:173` and `20260708141000:86`, described accurately
both times, and deferred as out of scope), and what *else* in the baseline is
`FOR SELECT … USING (true)` (→ `baseball_player_percentiles`, never noticed by
anyone). The second question is one grep. It should have been the first thing
run, and that is the most portable lesson in this report.

**A sixth was found last, and is the worst.** `baseball_messages` — see item 0
above. It came from a task that was supposed to produce *coverage*, not fixes:
auditing the policies of the tables that had no pgTAP suite, before writing
their tests. Six other tables were audited in the same pass and came out clean.
The generalisable part is that every one of these six findings came from
re-asking the previous question one level wider — none needed new information,
only a refusal to stop at the first answer.

**A fifth is confirmed and deliberately left alone.** `baseball_coaches_select`
is `USING (auth.uid() = user_id OR get_my_coach_id() IS NOT NULL)` — the `OR`
makes the first clause irrelevant to anyone holding a coach row, so any coach
reads every coach's email and phone. It is not in the migration pair for two
reasons: `20260701014000` explicitly reserved the scope of coach-sees-all as a
product decision, and 75 call sites read that table directly. Fixing it means
auditing all 75, which is not a 4am change. Severity is real but below #1–#4:
it needs a coach account and exposes contact details that are usually on a
public athletics staff page. `DATABASE_STATUS.md` §5 states the decision needed.

**2. Nothing in this run touched a database.** No migration was applied, no
`supabase db push`, no `psql`. The only writes were to files and to git.

**3. Do not demo against a prospect's own data until (1) is applied.** A demo
org is fine.

---

## The through-line: reading is not verifying

Four of the run's most serious findings were invisible to inspection and
surfaced only by running something. This is the most useful thing the night
produced, and it is worth more than any individual fix:

| Found by | What it was |
|---|---|
| **Executing the SQL** (CI, 4 rounds) | Two independent recursion cycles in the new RLS policy. Either one makes **every** query against `baseball_players` fail — a confidentiality fix converted into a total outage. Two adversarial reviewers had read this migration line by line against the real schema and found neither. |
| **Executing the SQL** | All five new functions were anon-callable. `REVOKE ... FROM PUBLIC` does not remove Supabase's role-specific default grant to `anon`. |
| **Asserting the props object, not the DOM** | The public player page shipped withheld GPA, SAT, ACT and private video URLs inside its HTML. The client gated them in JSX, which keeps data out of the DOM and not out of `curl`. The first version of the fix still leaked every URL under the raw relation key — the payload test caught that too. |
| **Running the seed script** | Its "production guard" *allowlisted* production, plus two bypasses (`<prodref>.example.invalid` was trusted on a first-label substring; any `.local` host on the LAN was trusted as loopback). |

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
