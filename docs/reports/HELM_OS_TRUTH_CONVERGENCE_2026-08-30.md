# Helm OS truth convergence — 2026-08-30

<!-- markdownlint-disable MD013 -->

**Starting `main`:** `df7bb77fd55d5f9ffa2eb068faa59ec318c6206e`

A record of one run: what was found, what was fixed, what was deliberately not
fixed, and what is still unknown. It is a dated report and therefore
**historical evidence, not authority** — the map is `docs/HELM_OS.md` and the
reasoning is `memory/decisions/ADR-2026-08-30-helm-knowledge-authority.md`.

Counts below are measurements taken during this run. They will rot; the
regenerated `docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md` is where a current
census lives.

---

## The trigger

`npm run worktrees:retire` removed a concurrent session's checkout
(`agent/round-type-reclassify`, PR #1681, OPEN). Every mechanical signal said
disposable: clean, tip identical to its pushed remote, no process whose cwd
`lsof` could see. Nothing was lost — parking keeps the branch — but the checkout
had an owner and the tool could not tell.

That is one instance of the shape this whole run is about: **a statement that
was true when written, with no mechanism attached that would notice it stopping
being true.** `classifyWorktree`'s own header stated the defect as design.

## Shipped

| PR | | Merge |
| --- | --- | --- |
| **#1683** | An OPEN PR's checkout needs its owner's consent, not `lsof`'s silence | `201b2a30a` |
| **#1684** | One owner per kind of truth, and six documents that said otherwise | `013778f49` |
| **#1685** | Reconcile the two feature maps; route nothing to the losing generation | `4e29f2018` |
| **#1686** | Make the durable records refer to things that exist | — |
| **#1687** | The inventory, the authority checker, and this report | — |

---

## Documents

Only documents whose ROLE changed. The other ~1,680 are categorised
mechanically in `docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md`.

| Path | Former role | Final role | Action |
| --- | --- | --- | --- |
| `docs/README.md` | index claiming "none of it is generated" | index + trust model naming the generated files | corrected; three prose counts removed |
| `memory/README.md` | said collapsing two feature generations was "work still owed" | says `features/` is the corpus and `context/` is history | corrected; the collapse actually done |
| `memory/context/golfhelm-features.md` | routed as a feature's current-state doc | HISTORICAL, routed from nowhere | banner added; 26 routes removed |
| `memory/system/golfhelm-engineering-os.md` | claimed a PreToolUse hook DENIES governed edits | says DETECTED, post-hoc, and defers to the generated inventory | corrected |
| `memory/ledgers/README.md` | documented a `ledgers/operations/` directory | documents the three that exist | claim removed, not implemented |
| `memory/operations/release-queue.yml` | header said "empty … not a placeholder for hand-written entries" | header describes hand-population as the intended use | corrected |
| `docs/OBSERVABILITY.md` | implied every server failure reaches both surfaces | owns EMISSION only; points at the authority contract | scope narrowed |
| `docs/superpowers/specs/helm-bridge/FEATURE_COVERAGE.md` | "Canonical spec" | `DESIGN_SPEC`, historical | demoted |
| `docs/ai-system/selfheal/STATE-2026-08-28.md` | dated file with no marker | `SNAPSHOT — NOT CURRENT AUTHORITY` | banner added |
| `.coachhelm-fix-progress.md` | root-level progress file asking "Ready to proceed?" | archived with the evidence that its items landed | moved to `docs/archive/2026-08/` |
| `helm-newsletter-march-2026.{docx,html}` | root clutter | `docs/business/` | moved |
| `docs/HELM_OS.md` | — | the navigation map | created |
| `memory/decisions/ADR-2026-08-30-…` | — | the authority decision | created |
| `memory/features/recruiting.md` | — | current-state doc for a feature that had none | created |
| `docs/generated/HELM_FEATURE_MAP.md` | — | generated projection | created |
| `docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md` | — | generated report | created |
| `docs/superpowers/{plans,specs}/README.md` | — | class-level classification | created |

## Rules

| Subject | Former authorities | Final authority |
| --- | --- | --- |
| workspace / concurrency policy | `AGENTS.md` **and** two contradicting lines in `shipping.md` | `AGENTS.md` |
| worktree lifecycle mechanism | `autonomy.md` recipes **and** `scripts/worktree-lifecycle.mjs` | the script; the rules link to it |
| what is mechanically enforced | prose in three rule files | `docs/CONTROL_PLANE_ENFORCEMENT.md` (generated) |
| which feature docs to read | `CLAUDE.md` → `context/`, `AGENTS.md` → `registry.yml` | `memory/registry.yml` |

`autonomy.md` lost a `git worktree remove --force` / `git branch -D` / `lsof +D`
recipe. It taught a second deletion algorithm nothing tests, and its `lsof`
step taught the exact inference that removed a live checkout.

## Feature system

| | |
| --- | --- |
| semantic features | 20, `memory/registry.yml` |
| runtime FeatureKeys | 87, `src/lib/admin/feature-registry.ts` |
| keys with exactly one semantic owner | 85 |
| keys explicitly classified as unowned | 2 — `integrations` (platform), `crm_recruiting_pipeline` (feature-awareness gap) |
| features owning no key, with a recorded reason | 4 — `shot_tracking`, `team_access_control`, `ios_native_shell`, `feature_awareness_system` |
| golf action modules unmapped by the router | **32 → 0** |

The crosswalk is DECLARED, not derived. Deriving it from action-file overlap
returned three-or-more owners for 28 of 39 golf/coachhelm keys, because shared
modules like `src/app/golf/actions/golf.ts` legitimately belong to many
features. Ownership is a judgement about which doc describes a surface.

## Ledgers and durable records

| Record | Purpose | Current state? | Integrity check |
| --- | --- | --- | --- |
| `memory/incidents/**` | confirmed product defects | yes | `knowledge:ledger-check` |
| `memory/operations/release-queue.yml` | repair units in flight | yes | `knowledge:ledger-check` |
| `memory/ledgers/changes/**` | behavioural history | append-only | `knowledge:ledger-check` |
| `memory/ledgers/tests/**` | test-contract history | append-only | `knowledge:ledger-check` |
| `memory/ledgers/deployments.md` | production promotes | append-only | — |
| `config/control-plane-gaps.json` | accepted limitations | yes | `knowledge:ledger-check` |
| `config/open-pr-dispositions.json` | open PRs and their worktree policy | yes | `control-plane:verify` |
| `memory/decisions/**` | architecture decisions | append-only | `knowledge:ledger-check` |

Found on the checker's first run: **four incidents carried a prose feature name**
(`- Feature: Golf Round Lifecycle and Stats Analytics`) instead of the backticked
registry id, so nothing could join them to the registry, the release queue or
the feature map — and one silently named two features in a field the model
treats as one. Plus **one repair unit with `incident_id: null` and no reason.**
Both classes are now refused.

Deliberately NOT enforced: that a repair unit's incident lives under its own
feature. It does not always, and the dedupe rule says that is correct. Reported
as a note, never failed.

## Historical, and why

| Item | Why historical | Current replacement |
| --- | --- | --- |
| `memory/context/golfhelm-features.md` | Gen-1 corpus; every feature it covers has a `features/` doc | `memory/registry.yml` → `memory/features/*.md` |
| `docs/audits/HELMV3_ISSUE_LEDGER_2026-06-30.md` | its own header has read SUPERSEDED since 2026-07-10 | `memory/incidents/**` |
| `docs/ROUND_REVIEW_ACCURACY_REPORT.md` | 2026-02 point-in-time report | `memory/incidents/**` |
| `docs/superpowers/plans/2026-05-28-ai-codebase-intelligence.md` | completed-wave plan | `docs/ai-system/helmv3-ai-codebase-intelligence.md` |
| `FEATURE_COVERAGE.md` | a spec is not a registry | `feature-registry.ts` + `memory/registry.yml` |
| `.coachhelm-fix-progress.md` | its eight pending items are landed; V2 path superseded by V3 | `release-queue.yml` + `memory/incidents/**` |

Two of those were still **routed as current authority** when this run started —
`memory/registry.yml` reached the superseded 2026-02 report from two different
features, and the superseded planning doc from a third. Both routes are removed
and `knowledge:authority-check` now refuses the shape.

## Commands

```bash
npm run helm-os:check      # docs:check + knowledge:check — the static set
npm run docs:check         # generated docs, schema names, doc paths, tool authority
npm run knowledge:check    # coverage, staleness, globs, ledgers, authority,
                           # feature-registry reconciliation, both projections
npm run control-plane:verify   # runtime capability and enforcement truth
```

`helm-os:check` is a **local convenience**, not new CI enforcement. CI invokes
the individual scripts by name and always has; the real tightening is that
`knowledge:check` — already a required job — grew four stages. A separate CI job
would have duplicated work and added another required-context name that has to
match exactly, which is the phantom-check trap this repo has already paid for.

## Unresolved

Everything below is UNKNOWN or an ACKNOWLEDGED_GAP. Nothing here is "probably
fine".

| id | state | closes when |
| --- | --- | --- |
| `SUPABASE_ARBITRARY_SQL_UNENFORCED` | gap | the sanctioned path connects; the account grant is removed |
| `SUPABASE_MIGRATION_GRANT_VS_READ_SCOPES` | gap | OAuth completes and `apply_migration` is observed under `:read` scopes |
| `SANDBOX_FILESYSTEM_DISABLED` | gap | an `allowWrite` set permits worktrees and denies canonical, proven on a disposable profile |
| `ERROR_SURFACES_DISAGREE` | gap | the board renders the split in `docs/OBSERVABILITY_AUTHORITY.md` |
| `WORKTREE_PARK_NO_PR_OWNERSHIP` | gap | a worktree carries an ownership marker independent of its PR |
| `crm_recruiting_pipeline` | feature-awareness gap | a current-state doc is written from the code and the feature is registered |
| PR #1681 reconciliation | **blocked** | that PR merges; its disposition row records what must reach feature memory and the incident system |
| `docs/baseballhelm-overnight/DATABASE_STATUS.md` | UNKNOWN | two items marked "NOT FIXED — needs a product decision" on 2026-07-29 were not re-verified here; verifying them is production work, not documentation work |

## Deliberately not done

- **Rendering the Mission Control board** to close `ERROR_SURFACES_DISAGREE`.
  It is product UI with tests, hiding inside a documentation run. The gap stays
  registered with a written definition of done, which is more honest than a
  half-rendered board.
- **Per-file `STATUS:` headers on 61 plans and 6 specs.** Determining which of
  PROPOSED / IMPLEMENTED / ABANDONED applies means reading each one and guessing
  where the evidence is thin. The directories carry class-level READMEs, the
  inventory carries per-file category and lifecycle, and nothing routes to any
  of them — which is the property that actually matters.
- **A prose contradiction detector.** Rejected in the ADR: regex over prose
  produces confident nonsense, and this repo has already deleted a guard for
  exactly that. `knowledge:authority-check` verifies structure and REPORTS
  language.
- **Deleting anything.** The goal was never fewer files.

## Three defects the new tooling found in its own authors' work

1. **`docs:schema-drift` could not see a namespace.** Writing the ADR turned it
   red on `golf_round_lifecycle` — a registry FEATURE ID, not a table. Feature
   ids share the `golf_*` shape the gate greps for. Fixed by excluding
   **declared** registry keys only, printed on every run so the exemption is
   never silent.
2. **The authority checker failed on the sentences that fixed the problem.**
   `docs/README.md` explains that an entry "used to point at" a superseded
   ledger; the first version matched any backticked `.md` in the section and
   read the explanation as a pointer. Now a Start Here entry is the bolded lead
   of a list item, and a path contains a slash. Third time this repo has paid
   for *a substring is not a mechanism*.
3. **The document inventory did not converge.** It listed itself, so each
   regeneration changed its own row and every other file's incoming count.
   Excluded from its own listing.

Also: the inventory has **no last-touch-SHA column**, though the plan asked for
one. It cannot work — this file is tracked, so the commit recording every other
file's SHA changes them, and a `--check` gate would fail on its own commit.
`shipping.md` already has the right answer: record an anchor SHA and let the
reader run `git rev-list --count <sha>..HEAD -- <path>`.

## Final authority table

| Question | Authority |
| --- | --- |
| What files belong to a semantic feature? | `memory/registry.yml` |
| How does that feature behave now? | the mapped feature doc + verified code |
| What FeatureKey does runtime telemetry use? | `src/lib/admin/feature-registry.ts` |
| What confirmed product defects exist? | `memory/incidents/**` |
| What repair is being worked? | `memory/operations/release-queue.yml` |
| What changed historically? | `memory/ledgers/changes/**` |
| What test guarantee changed? | `memory/ledgers/tests/**` |
| What deployed? | `memory/ledgers/deployments.md` |
| What architectural decision was made? | `memory/decisions/**` |
| What limitations are consciously accepted? | `config/control-plane-gaps.json` |
| What open PRs intentionally remain? | `config/open-pr-dispositions.json` |
| What is mechanically enforced? | `docs/CONTROL_PLANE_ENFORCEMENT.md` |
| What tools carry authority? | `docs/TOOL_AUTHORITY_MATRIX.md` |
| What do Sentry and `admin_events` mean? | `docs/OBSERVABILITY_AUTHORITY.md` |
| How does self-heal operate? | `docs/ai-system/selfheal/` |
| Is production healthy right now? | Mission Control, synthesised |
| What was true on a past date? | the dated snapshot — including this file |
| Where do I start? | `docs/HELM_OS.md` |

## Resume point

Ordinary Helm product development. The anti-loop rule stands: a new
stabilization program requires a **reproduced invariant violation** — a failing
verifier, a failing CI job, a guard reporting INFRASTRUCTURE_FAILURE
incorrectly, a reproduced worktree or branch leak, or a supposedly denied
mutation actually observed. A feeling that the repository is messy is not
enough.
