# Engineering methodology — cross-cutting, durable lessons

This file holds engineering-verification and audit-methodology lessons that
are true across features rather than about one feature's behavior. It is one
of the new context files created 2026-09-05 while folding the machine-local
auto-memory corpus into this repo's Git-backed memory
(`memory/decisions/ADR-2026-09-05-control-plane-reset.md` records the whole
operation). Every entry below cites its source auto-memory note by filename
and date, and states what was verified against the current repository on
2026-09-05 versus what is unverified.

## Verification and instrumentation trust

- **A passing check is only evidence if the check could have failed for the
  reason you actually care about.** Before trusting a green result, state the
  failure mode in one sentence and ask what the instrument would have
  rendered, returned, or matched had the bug been present. If the answer is
  "the same thing," the check is decorative. Three real instruments were
  caught being structurally blind to the bug they were meant to catch in one
  session: a screenshot cannot verify a reveal-animation bug when the
  animation completes on both the broken and fixed build under
  `prefers-reduced-motion: no-preference` (Playwright's default); `innerText`
  returns text sitting at `opacity: 0`, so any DOM-text "is the page empty"
  probe is blind to an invisible-but-present element by construction; and a
  fixed settle timeout can erase a layout flash that is over long before the
  probe runs. Prefer probing the mechanism (computed style, exit code, actual
  URL) over the artifact (screenshot, `innerText`, a glob match). (STU,
  source: `verification-instrument-must-be-able-to-show-the-bug.md` dated
  2026-08-15.)
- **Broken reachability/audit tooling reliably fails toward the more
  interesting or more reassuring answer, because that is the failure mode
  nobody investigates.** A tool that under-reports usage manufactures
  findings, which feel like progress and get acted on; a tool that
  over-reports usage produces silence, which feels like failure and gets
  fixed the same day. Eleven separate instruments produced confidently wrong
  results in one overnight session, each erring in the flattering direction —
  a misconfigured `knip.json` entry point made 86 dead files look clean; a
  table scanner nearly reported a 5,646-row live table as dead; a recursive
  FK query made SET NULL chains look like CASCADE; `reltuples = -1` (never
  analyzed in PG14+, not zero) made 93 empty tables look like 124. Four rules
  caught these: (1) never trust a reachability number without a sanity
  case — pick a known-live item the tool is *required* to find, and check it
  before believing any output; (2) an all-or-nothing result from a
  differentiating question is a tool failure, not a finding; (3) a plausible
  split is not evidence the classifier works — the sanity case must be a
  specific known-live item, never a shape judgment about the output; (4)
  assert on the sanity case, don't just eyeball the output for it — a triage
  parser once silently dropped 571 of 881 input rows and reported 0% of the
  thing it measured, and the output was internally consistent the whole time.
  (STU, source: `instruments-fail-in-the-flattering-direction.md` dated
  2026-08-19.)
- **Monitoring and polling scripts must distinguish "no signal," "ambiguous
  signal," and a definite answer — never bucket by "not success" or "not
  failure."** Enumerate every terminal state explicitly
  (`success | failure | cancelled | timed_out | skipped` are five different
  things); treat a failed lookup (`gh`/`curl` erroring or returning empty) as
  *unknown*, never as a negative result; and never key readiness on a
  check-run name that more than one workflow emits (see the CI section
  below). A monitor that exits early on the absence of a negative is worse
  than one that never fires, because its silence reads as "still running"
  when it is actually gone — require positive confirmation of every item
  instead. (STU, source:
  `monitors-must-not-infer-from-absent-signals.md` dated 2026-07-30.)
- **A backgrounded browser tab throttles `requestAnimationFrame`, so a
  mount-triggered reveal animation never advances past its initial state** —
  read `document.visibilityState` before concluding an element is invisibly
  broken; taking a screenshot foregrounds the tab and can make the "bug"
  disappear on its own. The reverse also happens: a screenshot taken
  mid-animation can show nothing while a DOM query moments later reports the
  element fully visible. A single screenshot is not evidence that something
  failed to render. (STU, source:
  `backgrounded-tab-freezes-reveal-animations.md` dated 2026-08-17.)
- **A dev server can serve a stale bundle while source-level reasoning says
  the fix is correct.** Two `next-server` processes sharing one `.next`
  directory served pre-edit chunks after a real, correct fix — grep and
  typecheck read the source, but the browser reads the bundle, and a stale
  bundle makes them disagree while the browser looks authoritative. Detect it
  by asserting on something only the new code can emit (a new `data-slot`, a
  new class, a new string) before trusting any browser-verified result;
  behavior that both the old and new implementation produce proves nothing.
  Run exactly one dev server against this repo at a time. (STU, source:
  `stale-dev-server-fakes-a-failed-fix.md` dated 2026-08-03.)
- **A browser-test timeout's assertion message is structurally
  uninformative** — `expect(locator).toBeVisible() failed: element(s) not
  found` describes what every hang looks like and contains nothing about the
  cause. Pull the Playwright trace's console output before theorising from
  the assertion message; two root causes (a CSP violation, an RLS infinite
  recursion) were sitting in the console from the first look, after several
  CI rounds were spent reasoning from the message alone. A green *step* is
  not a green *suite* — confirm the run actually executed tests, since a
  passing step can mean zero tests ran. (STU, source:
  `ui-hangs-have-no-assertion-message.md` dated 2026-07-30.)
- **A UI/reachability audit script's own harness bugs can fake a large
  fraction of its findings.** One golf UI audit script had six such bugs in
  one pass — a login wait keyed on a URL glob that also matched the login
  page itself (a coin flip), an accessible-name check reading `innerText`
  (blind inside a collapsed `<details>`), `alt=""` counted as a missing
  attribute rather than the correct decorative value, a screenshot filename
  collision across personas, a "clipped text" detector that selected for
  CSS `truncate` working as designed, and a tap-target measurement that
  missed invisible hit-slop and never emulated touch. 105 raw findings became
  54 real ones. When a large finding count looks surprising, audit the
  harness before the product. (STU, source:
  `ui-audit-script-login-is-a-coin-flip.md` dated 2026-08-16, fixed; kept
  only for this lesson.)
- **The same error message on a different route is not automatically the
  same bug.** "Rendered more hooks than during the previous render" (React
  #310) on one golf stats route was a Turbopack HMR/stale-chunk artifact; the
  identical message on a different route was a real production crash from
  calling `useReducedMotion()` directly instead of a guarded wrapper that
  defaults the SSR-time `null` to `false`. Before dismissing a repeat
  error as a known false positive, check the route, the `environment` tag,
  `handled`, and whether stack chunks are prod- or localhost-hashed. (STU,
  source: `coachhelm-stats-hooks-310-false-positive.md` dated 2026-07-30,
  updated 2026-08-19 — see `memory/features/coachhelm-ai.md` for the
  feature-specific fix.)
- **A doc that looks stale deserves the same prove-it discipline as a bug
  report — the check costs one grep.** A rule stating a design token no
  longer resolves to a serif font was nearly "corrected" on the strength of
  the font still loading elsewhere in the codebase; the rule was scoped to
  the *type-role tokens*, not to whether the font loads anywhere, and reading
  the actual `fontFamily` config it named (rather than grepping for the font
  name) confirmed it was correct all along. Two rule files can show the
  identical "looks contradicted by a grep" symptom and have opposite
  verdicts. (STU, source:
  `fraunces-removed-means-removed-from-fw-tokens.md` dated 2026-08-16 — this
  one confirmed `.claude/rules/design-system.md` is currently correct; no
  edit needed there.)

- **A layout or data-fetch chain that "feels slow" from a user report is not
  necessarily the file the report points at.** A `~14s` cold golf dashboard
  report was attributed to a layout's sequential `await`s; measuring the
  actual chain end-to-end against production as a real authenticated user
  (RLS evaluated) put it at 260ms — roughly 2% of the reported time — with
  the remaining time attributable to `next dev`'s own cold-compile cost, not
  the data path. Before "optimizing" a chain again on the strength of a
  vague slowness report, re-measure it directly; a perf number like this one
  rots (re-measure rather than reuse it, and treat it as unverified once it
  is more than a few weeks old), but the habit of measuring the real chain
  before touching it does not. (STU, source:
  `golf-dashboard-layout-is-not-the-slow-part.md` dated 2026-08-15;
  unverified since that date — do not cite the 260ms figure as current
  without re-measuring.)

## Reachability and dead-code audits

- **Any "is this table/export/action dead?" scan is wrong unless it handles
  every access convention this codebase actually uses.** For Supabase table
  reads that means at minimum `.from('t')`, `.from('t' as any)`,
  `.from.call(supabase, 't')`, a `fromUntyped(supabase, 't')` helper, and
  `const TABLE = 't'; …from(TABLE)` — a scan keyed on `.from('t')` alone
  reported a 5,646-row, still-growing table as unread. Key on the quoted
  table literal in any syntactic context, then classify by the nearest
  chained operation. For server actions, the common shape is a three-hop
  chain — a private `xImpl` holding the real write, an exported wrapper
  beside it, and a barrel re-export the real callers import from — and the
  middle hop looks like a terminus to a naive caller search; searching only
  `.tsx` for callers also misses an entire hooks tier between component and
  action. Knip cannot know an array of function references is a registry
  (`export const functions = [a, b]` makes those reachable) versus an array
  of string literals that merely names things — check whether the file
  actually imports the modules it lists. (STU, source:
  `reachability-scans-need-four-conventions.md` dated 2026-08-19.)
- **A type-only import satisfies an identifier grep and makes an orphan
  component look used.** Grep for the JSX tag (`<ComponentName`) and for the
  state setters that open it, never the bare identifier — a bare-identifier
  grep matched three importers that all took only the component's *types*,
  and the orphan survived months of audits. Two traps compound this: `<Name`
  also matches generics (`useState<ComponentName>`), so confirm each hit is
  really JSX; and a component can be mounted in the shell yet still be
  unreachable if the only code that flips the state showing it lives inside
  the component itself (a closed circuit) — reachability is two questions,
  not one: is it rendered, and can anything outside it open it. Never
  exclude a module's own directory when proving "nothing calls this" — the
  real caller can live in a sibling file inside that same excluded
  directory. Once a genuinely orphaned, never-rendered component is finally
  mounted, its DOM has never been checked either — budget for the surface
  being broken, not merely hidden. (STU, source:
  `an-import-is-not-a-render.md` dated 2026-07-29 and
  `unreachable-capability-audit-classes.md` dated 2026-08-18.)
- **A Fairway re-skin of a legacy component reliably carries the logic
  across and can silently drop the affordance that made the logic legible.**
  A selection cap enforced with an `if/else if` and no trailing `else`
  discarded a click past the limit with no toast, no disabled state, no
  cursor change — the legacy component it replaced *did* answer that click
  (a brief shake animation), and the feedback did not survive the port even
  though the cap did. When auditing a `src/components/fairway/**` component,
  grep for the legacy component its own docblock names (most name it
  explicitly) and diff the *interaction* branches, not the markup — look
  specifically for an `else` branch in the legacy version with no
  counterpart in the re-skin. (STU, source:
  `a-reskin-can-drop-an-affordance.md` dated 2026-08-17.)
- **A test that only asserts on the initial mount cannot see a
  lifecycle bug that only manifests on re-render.** Eight passing hook tests
  shipped a total sign-in hang because every one of them rendered once and
  never re-rendered — the fatal second effect run that killed the page never
  happened in any test. For a hook holding a timer, subscription, or
  scheduled side effect, the interesting states are re-render,
  dependency-change, and StrictMode mount→cleanup→mount, not a clean first
  mount. If an effect has an `if (hasSomethingRef.current) return` guard next
  to a cleanup that tears down state, that pairing is the smell — the guard
  makes the teardown permanent. Prefer narrowing the dependency array
  (volatile inputs onto refs) over adding guards. (STU, source:
  `a-single-render-test-cannot-see-a-rerender-bug.md` dated 2026-08-03.)
- **A `data:0.js` bundle can be 100% dead while typecheck, lint, and the full
  unit suite are all green**, because none of them evaluate the emitted
  Next.js server/client bundle. `import 'server-only'` reaching a client
  component through a shared helper produced an HTTP 500 with 8,755 unit
  tests passing; separately, a `'use server'` module's `export type { A, B }`
  specifier list got every name in it registered as a server action by
  Next's action transform, so the emitted module evaluated a runtime
  reference to an erased type and every action on that surface 500'd — found
  by clicking Send in a browser, not by any gate. For anything touching a
  `'use server'` module or a client/server boundary, the proof is `next
  build` or a real click on the actual control, never a green gate; a plain
  `export interface X {}`/`export type X = …` declaration form is erased
  safely, only the specifier-list re-export form leaks. (STU, source:
  `green-gates-dont-cross-the-bundle-boundary.md` dated 2026-08-02.)
- **A skipped test's `TODO` comment explains why it was skipped THEN, not
  whether it is still blocked now.** Un-skip locally, run it, and read the
  actual failure rather than trusting the comment — of 13 skips audited this
  way, 7 were resolvable, and 3 of those 7 would have been *wrong* to simply
  un-skip, because the spec encoded a behavior the component had since
  deliberately rejected (re-enabling it naively would re-assert a bug as the
  contract). Three outcomes are worth distinguishing: resolvable (the
  blocker cleared and nobody re-enabled it), inverted (the spec encodes
  rejected behavior — fix the assertions, don't delete the spec), and
  genuinely blocked (needs a product/design answer — record the observed
  failure so the next person doesn't re-derive it). A skip-inventory index
  file can itself go stale in both directions at once (naming deleted files
  while missing a live skip with no entry at all) — don't trust it over
  actually reading the skipped test. (STU, source:
  `a-skips-stated-blocker-is-a-hypothesis.md` dated 2026-07-30; the specific
  2026-07-30 skip inventory is a frozen snapshot and should not be reused —
  only this method is durable.)
- **A comment-stripping bug in a reachability test's regex, and other
  regex-over-a-grammar failures.** A route-reachability walk bounded import
  statements with `[^;]*?`, which cannot cross a semicolon — a semicolon
  sitting inside a comment inside a multi-line `export { … } from '…'` block
  truncated the match and reported eight components unreachable, including
  one directly imported by a live page. When a harness result implicates
  something you can independently prove is fine, suspect the instrument
  before the code — the tell was not the finding count but the *contents*.
  Deletion damage is caught by typecheck (`TS6133` on the orphaned imports),
  not lint. (STU, source:
  `reachability-test-breaks-on-comment-semicolons.md` dated 2026-08-15,
  fixed; kept only for this lesson.)

## Data and evidence discipline

- **Proving a generator emits wrong output does not prove any user received
  it — the defect proof and the impact claim are separate claims needing
  separate evidence.** Two true counts sitting next to each other (44 broken
  events; 4 live feeds) read as one fact and are not — the join that connects
  the bad rows to the actual consumers (feed → team → events, cron → config,
  route → traffic) is one query, and skipping it produced a bug report
  claiming "a subscriber saw the wrong dates" when exposure was actually
  zero. After proving a generator is wrong, run the join before writing
  anything in the past tense about who was affected. The same investigation
  also demonstrated that provenance settles a data-convention question
  duration-plausibility cannot: a span-0 event cannot exist under an
  exclusive date convention (a zero-length event no UI can produce), so
  finding 30 of them proved the convention outright. (STU, source:
  `a-proven-defect-is-not-delivered-harm.md` dated 2026-08-17.)
- **A derived extract on disk is not the source, and an absent column in your
  copy is not evidence the origin never had it.** Three separate instances
  found a derived/aggregated extract silently dropping a field or
  undercounting rows relative to the original publisher — in the worst case,
  a missing field was written up as "the publisher doesn't provide this,"
  when the publisher did and the extract on disk had simply dropped it before
  reaching the aggregate table. Before writing that a source lacks a field,
  fetch one record directly from the source and look at it — one request.
  When a row count backs a decision, check it against the publisher's own
  stated count. A per-record feed often carries identifiers an aggregate
  roll-up does not; when a publisher offers both, characterise the
  per-record one. (STU, source:
  `derived-extracts-silently-drop-fields.md` dated 2026-08-08, generalized
  from its original data-pipeline examples.)
- **Fixing a measurement bug silently disables every threshold that was
  calibrated against the old, buggy values, and nothing fails loudly.** A
  gate compared a value against a constant that was itself carried forward,
  unexamined, through two later corrections to the underlying measurement;
  after the second correction the production range of real values could
  never cross the gate again, and every CI fixture used the old, now-fossil
  values — the rule silently stopped matching and CI stayed green throughout.
  When you fix a unit or a measurement, grep for every constant compared
  against that value and re-derive it from real, current data — and when a
  rule "works" in tests, check the fixture values actually occur in
  production. Fixing a formally-identical sibling rule "for consistency" can
  break a rule that was working precisely because its error happened to
  cancel out at the values it sees in practice — check the actual numbers
  before generalizing a fix. (STU, source:
  `thresholds-outlive-the-bug-they-calibrated-against.md` dated 2026-08-16.)
- **Bug reports gathered from production are statements about an old commit
  when the deploy pipeline is on-demand, not continuous.** Because production
  is promoted manually rather than auto-deployed on merge, `main` routinely
  sits many commits ahead of what a browser shows — a handed-over
  outstanding-bugs list can be mostly already fixed on `main` and simply
  undeployed. Before fixing anything from a production-derived report, grep
  `main` for the named symbol and compare against the deployed SHA
  (`git show <deployed-sha>:<file>`); state "already fixed on main,
  undeployed" as a finding, since it converts a bug list into one clean
  action (deploy) rather than redundant or regressive work. The same trap
  runs in reverse for a stale local branch: decide whether to merge it by
  comparing each touched file's last-modified commit time against `main`
  (`git log -1 --format=%ct`), never by branch name or commit subject —
  squash merges make both lie. (STU, source:
  `prod-lags-main-so-bug-reports-go-stale.md` dated 2026-08-15.)
- **CI that only ever runs against a pre-existing, already-configured
  database cannot detect an incomplete seed, an untracked schema object, or a
  broken policy the migrations themselves create.** Pointing a required smoke
  gate at a fresh local stack instead of production surfaced seven
  independent defects that had been live for a month or more, none related
  in mechanism — a trigger and a storage bucket that existed in production
  but in no tracked migration; a demo seed that never created a required
  join row; a seed script with no production-target guard running against
  prod on every push; and migrations that actively created an
  infinitely-recursive RLS policy, which only bites a disaster-recovery
  rebuild from migrations. When a seed or migration set "works," ask against
  what — if the answer is only ever production, that is not evidence it is
  complete. A guard that greps SQL for a pattern must strip comments first,
  or it fires on a migration merely *documenting* the bug it hunts. (STU,
  source: `ci-against-prod-hides-incomplete-setup.md` dated 2026-07-30 —
  historical; the seven defects found this way are fixed and guarded by
  tests under `src/test/schema/`, verified 2026-09-05 to exist.)
- **A migration written against a live-measured production defect can
  duplicate one that already exists, unapplied, on `main`.** Production being
  broken is evidence a fix is UNAPPLIED, not that it doesn't exist — this
  repo routinely carries authored-but-unapplied migrations for a day or more.
  The opposite failure also happens: production can carry an object *no*
  migration in the repo creates, because the historical baseline dump is
  schema-scoped and cannot represent anything in `auth`/`storage`/`cron`/
  `realtime`. So grepping `supabase/migrations/` only answers "is a fix
  written," never "does production have this" — check the live objects
  directly (`to_regprocedure(...)`, `pg_policies.qual`) either way, since
  `supabase_migrations.schema_migrations` is not a reliable applied/unapplied
  signal for migrations applied through the Supabase MCP `apply_migration`
  tool (it stamps its own execution-time version, ignoring the filename —
  after any MCP apply, insert a `(version, name)` row at the filename's own
  stamp so a later `supabase db push` does not try to re-run it and abort).
  Before authoring a migration, grep for the object you are about to create.
  (STU, source: `grep-migrations-before-authoring-one.md` dated 2026-07-30
  and `migration-history-drift-and-repair.md`/
  `the-32-unaccounted-migrations-are-fully-mapped.md` dated 2026-08-19/20 —
  the specific migration counts in those two notes have moved since and
  should not be reused; re-run the classification against the current
  catalog and `supabase/migrations/HELD.md` — verified 2026-09-05 to exist —
  rather than citing an old number.)

## Row-Level Security — authoring and testing

- **Test an RLS policy by becoming the real role inside a rolled-back
  transaction, not by reading the migration diff.**
  ```sql
  BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
    SELECT count(*) FROM public.some_table;   -- filtered exactly as that user would see it
  ROLLBACK;
  ```
  `SET LOCAL ROLE anon` tests the anonymous surface the same way, and this
  works through the Supabase MCP `execute_sql` tool. Dry-run a new predicate
  as a plain `SELECT … WHERE <the new USING expression>` before applying
  anything, to see what it would admit with zero risk. Check that a probe
  isn't vacuous — a query that returns 0 rows for an empty fixture proves
  nothing about whether real access survives; pick fixtures with real data
  and confirm the tables aren't simply empty. Grant on any temp bookkeeping
  table *before* `SET LOCAL ROLE`, or the probe's own insert throws and reads
  as the thing under test failing. Always pair "the disallowed thing is
  refused" with "the allowed thing still succeeds" in the same transaction —
  a probe that fails for an unrelated reason otherwise reads as confirmation.
  A row count proves the policy admits the right rows; it does not prove the
  UI renders — the dangerous RLS failure mode is an empty result, not an
  error, which a count alone cannot distinguish from success. Also worth
  knowing: a `USING`-only `UPDATE` policy (no explicit `WITH CHECK`) is NOT
  missing a check — Postgres applies the `USING` expression to the new row
  as well as the old one for `UPDATE`, so it is owner-scoped on both sides
  already; several policies in this repo are written that way on purpose,
  and it is not a hole to file. (STU, source:
  `verify-rls-by-role-impersonation.md` dated 2026-07-30.)
- **The predicate you submit to `CREATE POLICY` is not necessarily the
  predicate you get, and nothing in the normal gate stack will tell you.**
  Postgres resolves a bare (unqualified) column name inside an RLS
  subquery to the innermost table in scope — the subquery's own `FROM`
  table, not the row being guarded. If both tables have a column of that
  name, it silently binds to the wrong one, and the result is valid SQL that
  parses, plans, lints, and passes RLS tests. One confirmed instance: a
  storage-upload policy's `WITH CHECK` read a bare `name` inside a subquery
  joined to a courses table, so it bound to the course's title column
  instead of `storage.objects.name` — every authenticated upload was
  rejected (fails closed, not an exposure, but still broken). The
  transferable discipline: after any `CREATE POLICY`, read the policy back
  (`SELECT with_check, qual FROM pg_policies WHERE policyname = …`) and diff
  the stored text against what you wrote — the read-back is where the silent
  rebinding shows — then verify behaviorally in a rolled-back transaction
  (impersonate, run the real access, confirm allow/deny per case), not just
  by reading the text back. Qualify every column in an RLS subquery with its
  table name; never leave a bare name a joined or subquery table could also
  own. Note `is_golf_team_coach()` in this codebase is existence-only (any
  staff row, ignoring role); `is_golf_team_head_coach()` is the
  role-checking variant — see
  `memory/incidents/golf_round_lifecycle/INC-2026-08-19-assistant-coach-cascade-delete-round-history.md`
  for the P0 this distinction produced and its fix. (STU, source:
  `rls-predicate-you-submit-is-not-what-you-get.md` dated 2026-08-20.)
- **An RLS policy whose guard subquery reads the SAME table the policy is
  on recurses into itself on EVERY query against that table, not just the
  guarded branch.** Postgres raises `42P17 infinite recursion detected in
  policy for relation X`, and it takes the whole table's reads and writes
  down. Nothing in the normal gate stack catches this — not review, not
  `tsc`, not the unit suite, since the SQL lives only inside a migration
  string. Fix by moving the self-referencing read into a `SECURITY DEFINER`
  helper function, so the read happens outside the policy's own evaluation.
  This is a sibling failure to the bare-column-binding issue above, and both
  were found in the same 2026-08-19 overnight RLS remediation pass. (STU,
  source: `self-referencing-rls-policy-recurses-whole-table.md` dated
  2026-08-19.)
- **Tightening an RLS SELECT policy is not scoped to the attack it
  closes — any first-contact flow (join, accept-invite, claim, redeem) reads
  its target resource before the membership that would authorize reading it
  exists.** See `memory/features/auth-onboarding-join.md`'s Known Risk Areas
  for the specific golf-team-join regression this produced and how to check
  a future SELECT-policy change against it. (STU, source:
  `rls-tightening-broke-the-flow-it-guarded.md` dated 2026-08-04.)

## CI, build and gate gotchas

- **`npm run build` (`next build`) can print `Failed to compile.` and still
  exit 0, and can also succeed and exit 0 — the same exit code both ways.**
  Read the OUTPUT, not `$?`: a pass ends in `✓ Compiled successfully` and the
  full route table; a failure shows `Failed to compile.`/`Module not found`.
  A build that follows a failed build can also go green off a cached,
  half-populated `.next` — to make a real "does this compile cleanly" claim,
  build cold (`rm -rf .next` then build). Two failure modes look like code
  bugs and are not: a sandboxed run can fail to reach `fonts.googleapis.com`
  at build time (Next fetches Google Fonts during the build) and print a
  webpack-shaped error naming your own source files — retry unsandboxed
  before touching any font code, since the fetch is flaky rather than
  uniformly blocked; and two concurrent `next build` processes on a memory-
  constrained machine can die with `SIGABRT`/exit 134
  ("JavaScript heap out of memory") — serialise builds and raise the heap
  (`NODE_OPTIONS="--max-old-space-size=8192"`) rather than assuming a code
  regression. A fresh `git worktree` has no `.env*` files, so `next build`
  compiles but fails the export phase on every prerendered page with a
  missing-Supabase-URL error — that is environment plumbing, not code. (STU,
  source: `next-build-fails-two-different-ways.md` dated 2026-08-19.)
- **Adding a wrapped admin action or editing a feature doc can trip
  CI-only gates that no per-directory `vitest run` or per-file `eslint` will
  ever show you locally.** Three concrete ones in this repo: admin tripwire
  tests that assert an exact wrapped-action count and an exact feature
  registry manifest size (bump both, with a dated comment, when adding a
  wrapped export); `npm run audit:supabase-errors`, which regresses if a
  Supabase read destructures `data` without also binding `error`; and
  `npm run knowledge:check`, which regenerates a generated document-authority
  inventory and diffs it — because a PR's CI checkout is a synthetic merge
  with current `main`, a doc another PR touched after your last local merge
  can show as stale even though you didn't touch it. Before pushing a branch
  that adds a server action or edits a `memory/features/*.md` file, merge
  `origin/main` and run the relevant checks locally first. (STU, source:
  `new-wrapped-action-trips-three-ci-gates.md`, no date field — PR #1774,
  2026-09-03.)
- **A `nosemgrep:` suppression comment does nothing if it sits on the line
  AFTER the finding rather than on it or the line immediately before —
  semgrep does not warn about a misplaced or unused suppression, so it looks
  exactly like a rule refusing to be suppressed.** Always re-run and confirm
  exit 0 after adding one. Separately, semgrep only scans files tracked by
  git — a control copy written to a scratchpad is silently skipped and the
  run exits 0, which reads as "the rule doesn't fire" when the truth is
  "nothing was scanned." Look for "Scanning N files tracked by git" in
  stderr, and run any control case in the working tree, not a scratchpad.
  The reliable way to prove a suppression is real: strip the token in place,
  confirm the scan now fails (exit 1), restore it, confirm the scan passes
  (exit 0) — a suppression that has never been proven to suppress anything
  might be suppressing nothing. (STU, source:
  `nosemgrep-must-be-on-or-before-the-finding.md` dated 2026-08-20.)
- **Pushing again while a `main` CI run is in flight cancels that run, and
  the aggregate reads red on the intermediate commit even though nothing is
  actually broken.** GitHub's concurrency group kills in-progress jobs when a
  newer commit lands on the same ref; the long-running smoke/E2E job is
  usually the one still running when the next push arrives, and it dragging
  the aggregate red is not the same as a real failure. Don't trust the
  run-level conclusion — list the individual jobs
  (`gh run view <id> --json jobs --jq '.jobs[] | select(.conclusion !=
  "success") | "\(.conclusion)\t\(.name)"'`); if the only non-success entries
  are a cancelled long-running job and the failed aggregate it feeds, the
  code is fine and a later push superseded it. Confirm by checking that the
  next completed run (containing the same commits) is green. This compounds
  badly under a tight push cadence: pushing roughly every 13 minutes against
  a Playwright suite that takes about 50 minutes cancelled twenty consecutive
  runs in a row, hiding the fact that the suite had actually failed on every
  run that was allowed to finish for several days. Before pushing the next
  cycle's work, check for and wait on an in-flight run on the same ref.
  Also: a required-check name that more than one workflow can emit is
  ambiguous — confirm which workflow's run you are reading rather than
  trusting a bare check-run name, and a `Playwright`/E2E job that is `if:
  push || dispatch` never runs on a pull request at all, so a "green"
  Playwright check on a PR can mean SKIPPED, not passed — grep `e2e/` for
  coverage of a changed surface before treating a green PR as E2E-verified.
  (STU, source: `rapid-pushes-cancel-own-ci.md` dated 2026-08-17 and
  `my-push-cadence-erased-the-e2e-gate.md` dated 2026-08-19.)
- **This machine has no Docker daemon, so anything whose correctness depends
  on a real local Postgres (`supabase start`, a fresh migration replay, a
  local seed run, pgTAP) is unverifiable locally.** Do every provable part
  locally (typecheck, lint, shell/YAML/action linters, unit tests on pure
  logic), then structure the change so the CI job that actually stands up a
  stack is the proof, and say plainly in the PR which claim rests on that CI
  run rather than on local evidence. A PR that only rewires a required gate
  blocks itself if the guess is wrong — never pair that kind of change with
  an unrelated one you actually want merged. (STU, source:
  `no-docker-local-stack-only-provable-in-ci.md` dated 2026-07-30 —
  machine-specific; re-check if this machine's Docker availability has
  changed.)
- **`npm run dev` started from inside the Bash tool's sandbox comes up
  looking healthy and then serves 404 for every route, because the sandbox
  denies the file-watching syscalls Turbopack's route discovery depends on.**
  The tell is `Watchpack Error (watcher): Error: EMFILE: too many open
  files, watch` in the boot log — `ulimit -n` reading a huge number is a red
  herring, since the sandbox denies the syscall regardless of the configured
  limit. Separately and independently, `.env`, `.env.local` and
  `.env.development.local` can be denied on `stat` even to a server that
  otherwise comes up, so it has no Supabase credentials either way. Don't
  spend time debugging routing/proxy code against a sandboxed `next dev` —
  run it with the sandbox disabled, or skip the server entirely and measure
  a data-fetch chain directly in a scratchpad script that signs in and
  replays the reads. (STU, source:
  `sandboxed-next-dev-404s-every-route.md` dated 2026-08-15 — this may
  overlap with a newer, more detailed EMFILE/Watchpack write-up recorded
  independently in `.claude/rules/shipping.md` on a branch not yet merged to
  `main` at the time of writing; reconcile the two rather than treating them
  as two separate defects if both are visible when you read this.)

## Fairway / Base UI component patterns

- **An ungrouped Base UI control inside a Fairway `<Form>` registers as a
  permanently-invalid field and silently blocks every submit — no `POST`, no
  console output, no visible error.** `Checkbox.Root` calls
  `useField({ enabled: !groupContext })`, so a bare `<Checkbox>` with no
  `CheckboxGroup` around it registers itself as a form field whose validity
  never resolves out of `null` (falsy under the form's `!f.validityData.
  state.valid` check), and because there is no `Field.Root` there is no
  `Field.Error` either — the app's `onSubmit` simply never runs, with zero
  user-visible feedback. Two things that look like evidence and are not:
  `event.defaultPrevented === true` proves nothing if the app's own handler
  unconditionally calls `preventDefault()`; a green test suite proves nothing
  if it never exercises the real submit path (see the reachability section
  above). The one diagnostic that actually works: Base UI calls
  `focusControl(invalidFields[0].controlRef.current)`, so reading
  `document.activeElement` immediately after a failed submit click names the
  offending control. Fix by wrapping the control in a `CheckboxGroup`
  (`value`/`onValueChange`, each child a `<Checkbox value={id}>`) — with a
  group context, the field never registers as one of the form's own fields
  at all. See `memory/features/qualifiers.md` for the specific incident this
  produced. (STU, source:
  `baseui-ungrouped-checkbox-kills-form-submit.md` dated 2026-08-03.)

## Working practice and shared-state hygiene

- **In a shared working tree, staging by file list is an unverified
  authorship claim, even when the list is explicit paths rather than `-A`.**
  A peer's stated file list, or your own memory of what you edited, can both
  be wrong: one file attributed to "my" changes was actually 100% a peer's
  work with zero relevant hunks; another file had unrelated hunks from a
  third, unlisted agent mixed in; a peer's own stated list was short by a
  file it wrote after sending the list. Before staging, classify every
  modified path by counting hunks that don't match your own change's
  signature — zero non-matching hunks means it's purely yours; anything else
  needs a read before deciding. `git status --untracked-files=all` (not the
  bare form) is what reveals how many files a new directory really holds, not
  the single collapsed entry the short form shows. (STU, source:
  `audit-hunks-not-file-lists-before-staging.md` dated 2026-08-17, extending
  `.claude/rules/shipping.md`'s "stage explicit paths, never `-A`" rule with
  the reason explicit paths alone are not sufficient.)
