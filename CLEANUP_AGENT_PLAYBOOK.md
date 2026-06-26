# Helm Comprehensive Cleanup & Architecture Audit Playbook

## Mission

Perform a comprehensive, non-destructive cleanup audit of the Helm repo.

This is not just a line-count cleanup. The goal is to make the codebase safer, easier to understand, less bloated, less duplicated, easier for agents to work in, less likely to regress, more production-ready, and better separated by product area.

The first pass is audit only. Do not modify product code until the owner reviews the findings and explicitly approves cleanup batches.

---

## Absolute Rule: Do Not Touch BaseballHelm

BaseballHelm is currently frozen.

There may be two conflicting implementation tracks: an older BaseballHelm implementation and a newer BaseballHelm implementation. Different workflows may have created fixes against different versions. Until the owner reconciles that, BaseballHelm is read-only.

### BaseballHelm hard restrictions

Do not:

- delete BaseballHelm files
- rename BaseballHelm files
- move BaseballHelm files
- refactor BaseballHelm files
- deduplicate BaseballHelm code
- remove BaseballHelm exports
- update BaseballHelm imports
- update BaseballHelm routes
- update BaseballHelm components
- update BaseballHelm data models
- update BaseballHelm migrations
- update BaseballHelm tests
- remove BaseballHelm dependencies
- decide which BaseballHelm implementation is correct
- merge old BaseballHelm and new BaseballHelm
- fix BaseballHelm tool warnings
- modify files that are shared with BaseballHelm unless the impact is proven safe and explicitly approved

### What counts as BaseballHelm?

Treat anything as BaseballHelm-related if it includes or likely supports:

- `baseball`
- `Baseball`
- `BaseballHelm`
- `bb`
- baseball stats
- baseball roster
- baseball recruiting
- baseball team dashboards
- baseball game stats
- baseball player profiles
- baseball scoring
- baseball imports
- baseball routes
- baseball database tables
- baseball-related API routes
- baseball-specific components
- shared utilities used mostly by BaseballHelm

When uncertain, classify as `DEFERRED_BASEBALLHELM`.

### If a tool flags BaseballHelm

Record the finding, but do not act.

Create:

```bash
.cleanup/reports/DEFERRED_BASEBALLHELM_FINDINGS.md
```

Use this format:

```md
# Deferred BaseballHelm Findings

These findings were discovered during cleanup analysis but were not fixed because BaseballHelm is frozen.

| Tool | File/Area | Finding | Risk | Suggested Future Review |
|---|---|---|---|---|
```

---

## Guiding Principle

Do not optimize for fewer lines. Optimize for less risk, less duplication, clearer ownership, cleaner architecture, smaller bundles, fewer dead files, fewer dead dependencies, safer agent workflows, and easier future development.

A large but stable file may be better than a fragile abstraction. Do not create abstractions just to reduce line count.

---

## Cleanup Phases

This audit has these phases:

1. Baseline and branch setup
2. Product boundary mapping
3. LOC and size analysis
4. Dead file/export/dependency audit
5. Duplicate code audit
6. Architecture and import graph audit
7. Frontend bundle audit
8. Test and validation audit
9. Generated artifact and repo hygiene audit
10. Database-adjacent safety audit
11. Risk classification and BaseballHelm quarantine
12. Cleanup PR roadmap
13. Final master report

---

## Phase 0: Required Branch Setup

Start clean.

```bash
git checkout main
git pull
git checkout -b cleanup/comprehensive-code-audit
mkdir -p .cleanup/reports
```

Confirm branch:

```bash
git branch --show-current
```

Expected:

```text
cleanup/comprehensive-code-audit
```

Do not work on `main`.

---

## Phase 1: Establish Safety Baseline

Before analyzing cleanup, record the current health of the repo.

```bash
npm install
npm run typecheck > .cleanup/reports/baseline-typecheck.txt 2>&1 || true
npm run lint > .cleanup/reports/baseline-lint.txt 2>&1 || true
npm run build > .cleanup/reports/baseline-build.txt 2>&1 || true
npm run test > .cleanup/reports/baseline-test.txt 2>&1 || true
```

If e2e tests are supported in the current environment:

```bash
npm run test:e2e > .cleanup/reports/baseline-e2e.txt 2>&1 || true
```

Create:

```bash
.cleanup/reports/BASELINE_HEALTH.md
```

Include:

```md
# Baseline Health

| Check | Status | Notes |
|---|---|---|
| npm install | Pass/Fail | |
| typecheck | Pass/Fail | |
| lint | Pass/Fail | |
| build | Pass/Fail | |
| unit tests | Pass/Fail | |
| e2e tests | Pass/Fail/Not Run | |

## Existing Failures

List all failures that existed before cleanup.

## Important Rule

Do not blame cleanup for failures that already existed at baseline, but do not make them worse.
```

---

## Phase 2: Product Boundary Mapping

Before deleting anything, map the repo.

The agent must understand product areas:

- GolfHelm
- BaseballHelm
- CoachHelm
- shared UI
- shared hooks
- shared services
- Supabase/database
- scripts/tooling
- tests
- docs
- generated artifacts
- AI/agent tooling

Run:

```bash
find src -maxdepth 5 -type d | sort > .cleanup/reports/src-folder-map.txt
find supabase -maxdepth 5 -type d | sort > .cleanup/reports/supabase-folder-map.txt
find scripts -maxdepth 4 -type d | sort > .cleanup/reports/scripts-folder-map.txt
find . -maxdepth 3 -type d | sort > .cleanup/reports/repo-folder-map-depth-3.txt
```

Search for product boundaries:

```bash
grep -Ril "baseball\|Baseball\|BaseballHelm" src supabase scripts docs 2>/dev/null \
  > .cleanup/reports/baseball-related-files.txt || true

grep -Ril "golf\|Golf\|GolfHelm" src supabase scripts docs 2>/dev/null \
  > .cleanup/reports/golf-related-files.txt || true

grep -Ril "coach\|Coach\|CoachHelm" src supabase scripts docs 2>/dev/null \
  > .cleanup/reports/coach-related-files.txt || true
```

Create:

```bash
.cleanup/reports/PRODUCT_BOUNDARY_MAP.md
```

Include:

```md
# Product Boundary Map

## GolfHelm Areas

| Path | Purpose | Cleanup Allowed? |
|---|---|---|

## BaseballHelm Areas

| Path | Purpose | Cleanup Allowed? |
|---|---|---|

All BaseballHelm areas are read-only.

## CoachHelm Areas

| Path | Purpose | Cleanup Allowed? |
|---|---|---|

## Shared Areas

| Path | Consumers | Risk |
|---|---|---|

## Ambiguous Areas

| Path | Why Ambiguous | Required Human Decision |
|---|---|---|
```

Important: if a shared file is used by BaseballHelm, classify it as high risk.

---

## Phase 3: Install Cleanup Tools

Install the code-cleanup tool stack.

```bash
npm i -D cloc knip jscpd ts-prune depcheck madge dependency-cruiser unimported npm-check-updates npm-package-json-lint prettier
```

If install changes package files, do not commit yet unless approved.

---

## Phase 4: LOC and Size Analysis

### 4.1 App-only LOC

```bash
npx cloc src supabase scripts \
  --include-ext=ts,tsx,sql,mjs,js \
  --by-file \
  --csv \
  --out=.cleanup/reports/cloc-app.csv
```

### 4.2 Whole repo excluding obvious junk

```bash
npx cloc . \
  --exclude-dir=node_modules,.next,dist,build,coverage,.git,.vercel,out,test-results,ui-intelligence,routes,.full-review,.worktrees,.cache \
  --exclude-ext=json,lock,svg,png,jpg,jpeg,webp,pdf,pptx \
  --by-file \
  --csv \
  --out=.cleanup/reports/cloc-repo.csv
```

### 4.3 Largest source files

```bash
find src supabase scripts \
  -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.sql" -o -name "*.mjs" -o -name "*.js" \) \
  -not -path "*/node_modules/*" \
  -exec wc -l {} + | sort -nr | head -100 \
  > .cleanup/reports/top-100-largest-source-files.txt
```

### 4.4 Largest folders

```bash
du -sh ./* ./.??* 2>/dev/null | sort -hr | head -100 \
  > .cleanup/reports/largest-folders.txt
```

### 4.5 Largest tracked git objects

```bash
git rev-list --objects --all \
  | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
  | awk '$1=="blob" {print $3, $4}' \
  | sort -nr \
  | head -100 \
  > .cleanup/reports/largest-git-objects.txt
```

Create:

```bash
.cleanup/reports/LOC_AND_SIZE_SUMMARY.md
```

Include:

```md
# LOC and Size Summary

## Key Numbers

| Metric | Value |
|---|---|
| App LOC | |
| Repo LOC excluding junk | |
| Largest source file | |
| Largest folder | |
| Largest git object | |

## Top Bloat Sources

| Rank | Path | Reason | Cleanup Risk |
|---|---|---|---|

## BaseballHelm Size Findings

These are deferred.

| Path | Finding |
|---|---|

## Immediate Observations

Explain whether the codebase is truly huge or inflated by generated files, docs, artifacts, or duplicated code.
```

---

## Phase 5: Dead Code Audit with Knip

Knip is the primary dead-code tool.

```bash
npx knip --reporter markdown > .cleanup/reports/knip.md 2>&1 || true
npx knip --reporter json > .cleanup/reports/knip.json 2>&1 || true
```

If there is no Knip config, generate but do not blindly trust:

```bash
npx knip --init
```

Suggested future `knip.json`:

```json
{
  "entry": [
    "src/app/**/*.{ts,tsx}",
    "src/middleware.ts",
    "next.config.*",
    "postcss.config.*",
    "tailwind.config.*",
    "playwright.config.*",
    "vitest.config.*",
    "scripts/**/*.{ts,tsx,mjs,js}",
    "supabase/functions/**/*.{ts,js}"
  ],
  "project": [
    "src/**/*.{ts,tsx}",
    "scripts/**/*.{ts,tsx,mjs,js}",
    "supabase/**/*.{ts,js,sql}",
    "e2e/**/*.{ts,tsx}",
    "tests/**/*.{ts,tsx}"
  ],
  "ignore": [
    ".next/**",
    "node_modules/**",
    "dist/**",
    "build/**",
    "coverage/**",
    "test-results/**",
    "ui-intelligence/**",
    "routes/**",
    ".full-review/**",
    ".worktrees/**"
  ],
  "ignoreDependencies": [
    "@types/*"
  ]
}
```

Create:

```bash
.cleanup/reports/KNIP_CLASSIFIED_FINDINGS.md
```

Format:

```md
# Knip Classified Findings

## Safe Delete Candidates

Only include items that are clearly not BaseballHelm and not dynamically used.

| Type | File/Export/Dependency | Evidence | Confidence |
|---|---|---|---|

## Manual Review Required

| Type | File/Export/Dependency | Why Risky |
|---|---|---|

## Likely False Positives

| Type | File/Export/Dependency | Why Likely False Positive |
|---|---|---|

## Deferred BaseballHelm Findings

| Type | File/Export/Dependency | Reason Deferred |
|---|---|---|
```

Rules:

- do not delete anything
- do not remove dependencies
- do not touch BaseballHelm
- do not trust Knip blindly with dynamic route systems

---

## Phase 6: Duplicate Code Audit with jscpd

```bash
npx jscpd src supabase scripts \
  --min-lines 20 \
  --min-tokens 100 \
  --reporters console,html,json \
  --output .cleanup/reports/jscpd
```

Optional stricter pass:

```bash
npx jscpd src \
  --min-lines 10 \
  --min-tokens 60 \
  --reporters console,json \
  --output .cleanup/reports/jscpd-strict
```

Create:

```bash
.cleanup/reports/DUPLICATION_REPORT.md
```

Include:

```md
# Duplication Report

## Top Duplicate Clusters

| Rank | Files | Area | Duplication Type | Estimated Impact | Risk |
|---|---|---|---|---|---|

## Best Refactor Candidates

Non-BaseballHelm only.

| Area | Files | Proposed Shared Abstraction | Expected Benefit | Risk |
|---|---|---|---|---|

## Do Not Refactor Yet

| Files | Reason |
|---|---|

## Deferred BaseballHelm Duplicates

| Files | Finding | Reason Deferred |
|---|---|---|
```

Look for duplicate cards, metric tiles, dashboards, modals, charts, data tables, loading states, empty states, filters, date helpers, stat calculations, Supabase queries, export/PDF/report code, and mobile/desktop forks.

Do not refactor during audit.

---

## Phase 7: Unused Export Audit

```bash
npx ts-prune > .cleanup/reports/ts-prune.txt 2>&1 || true
```

Create:

```bash
.cleanup/reports/UNUSED_EXPORTS_REPORT.md
```

Format:

```md
# Unused Exports Report

## Safe Candidates

| Export | File | Evidence | Confidence |
|---|---|---|---|

## Manual Review

| Export | File | Risk |
|---|---|---|

## Likely False Positives

| Export | File | Why |
|---|---|---|

## Deferred BaseballHelm

| Export | File | Reason Deferred |
|---|---|---|
```

False-positive areas include Next route files, route handlers, server actions, dynamic imports, generated types, tests, webhooks, Supabase functions, config files, and BaseballHelm.

---

## Phase 8: Dependency Audit

```bash
npx depcheck --json > .cleanup/reports/depcheck.json 2>&1 || true
npx depcheck > .cleanup/reports/depcheck.txt 2>&1 || true
npx npm-check-updates > .cleanup/reports/npm-check-updates.txt 2>&1 || true
npm outdated > .cleanup/reports/npm-outdated.txt 2>&1 || true
```

Create:

```bash
.cleanup/reports/DEPENDENCY_AUDIT.md
```

Format:

```md
# Dependency Audit

## Likely Unused Dependencies

| Package | Evidence | Risk | Proposed Action |
|---|---|---|---|

## Manual Review Dependencies

| Package | Why Manual Review |
|---|---|

## Likely False Positives

| Package | Why |
|---|---|

## Do Not Remove Without Explicit Approval

| Package | Reason |
|---|---|
```

High-risk dependency categories:

- Next.js
- React
- Supabase
- auth/security
- analytics
- monitoring
- AI
- Capacitor/mobile
- Playwright/Vitest
- database tooling
- email
- maps
- charts
- PDFs
- BaseballHelm-related dependencies

Before proposing removal, verify with:

```bash
grep -R "PACKAGE_NAME" . \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=.git \
  --exclude-dir=dist \
  --exclude-dir=build
```

Do not uninstall during first pass.

---

## Phase 9: Import Graph and Architecture Audit

### 9.1 Madge circular dependencies

```bash
npx madge src \
  --extensions ts,tsx \
  --circular \
  > .cleanup/reports/madge-circular.txt 2>&1 || true
```

### 9.2 Madge summary

```bash
npx madge src \
  --extensions ts,tsx \
  --summary \
  > .cleanup/reports/madge-summary.txt 2>&1 || true
```

### 9.3 dependency-cruiser

Initialize if needed:

```bash
npx depcruise --init
```

Run:

```bash
npx depcruise src \
  --output-type err-long \
  > .cleanup/reports/dependency-cruiser.txt 2>&1 || true
```

Create:

```bash
.cleanup/reports/ARCHITECTURE_TANGLES.md
```

Include:

```md
# Architecture Tangles

## Circular Dependencies

| Cycle | Files | Risk | Proposed Fix |
|---|---|---|---|

## Layering Violations

| File | Violation | Risk |
|---|---|---|

## Server/Client Boundary Concerns

| File | Concern | Risk |
|---|---|---|

## Product Boundary Violations

| File | Issue | Risk |
|---|---|---|

## Deferred BaseballHelm Architecture Findings

| Finding | Reason Deferred |
|---|---|
```

Look for UI importing database clients directly, client components importing server-only modules, shared components importing product-specific modules, Golf importing Baseball, Baseball importing Golf, hooks becoming service layers, components with huge business logic, duplicated service logic inside route files, route files directly containing complex queries, and shared utilities with hidden product assumptions.

---

## Phase 10: Frontend Bundle Audit

```bash
npm run analyze
```

Create:

```bash
.cleanup/reports/BUNDLE_BLOAT_REPORT.md
```

Include:

```md
# Bundle Bloat Report

## Largest Client Bundles

| Route/Chunk | Size | Suspected Cause |
|---|---|---|

## Suspicious Client-Side Packages

| Package | Why Suspicious | Recommendation |
|---|---|---|

## Easy Wins

| Fix | Expected Impact | Risk |
|---|---|---|

## Manual Review

| Item | Reason |
|---|---|
```

Look specifically for Mapbox imported too high, PDF tools imported into general pages, chart libraries imported globally, AI/admin tools leaking into client bundles, analytics/monitoring double-loaded, giant icon imports, server-only utilities in client chunks, and pages that need dynamic import boundaries.

Do not change imports during first pass.

---

## Phase 11: Test Coverage and Safety Audit

```bash
npm run test -- --coverage > .cleanup/reports/test-coverage.txt 2>&1 || true
```

If that command does not work, run the repo’s coverage command:

```bash
npm run test:coverage > .cleanup/reports/test-coverage.txt 2>&1 || true
```

Create:

```bash
.cleanup/reports/TEST_COVERAGE_RISK_REPORT.md
```

Include:

```md
# Test Coverage Risk Report

## Areas With Cleanup Risk and Weak Tests

| Area | Cleanup Risk | Test Coverage Concern |
|---|---|---|

## Areas That Need Tests Before Cleanup

| Area | Why |
|---|---|

## Do Not Refactor Without Tests

| Area | Reason |
|---|---|

## BaseballHelm

BaseballHelm tests/findings are deferred.
```

High-risk areas requiring tests before cleanup:

- auth
- team membership
- invites
- payments/subscriptions
- stats calculations
- dashboard aggregations
- Supabase RLS assumptions
- export/PDF reports
- mobile-specific flows
- BaseballHelm

---

## Phase 12: Generated Artifact and Repo Hygiene Audit

Inspect known noisy areas.

```bash
find . -maxdepth 3 -type d | sort > .cleanup/reports/folder-tree-depth-3.txt

du -sh ./* ./.??* 2>/dev/null | sort -hr | head -100 > .cleanup/reports/largest-folders.txt

git status --ignored --short > .cleanup/reports/git-ignored-status.txt 2>&1 || true
```

Create:

```bash
.cleanup/reports/GENERATED_ARTIFACTS_AUDIT.md
```

Format:

```md
# Generated Artifacts Audit

## Likely Generated Folders

| Folder | Evidence | Proposed Action |
|---|---|---|

## Likely Local-Only Folders

| Folder | Evidence | Proposed Action |
|---|---|---|

## Should Be Gitignored

| Path | Reason |
|---|---|

## Needs Human Review

| Path | Reason |
|---|---|

## Do Not Touch

| Path | Reason |
|---|---|
```

Examples of likely generated/local-only artifacts:

- screenshots
- UI atlases
- route dumps
- old review archives
- temp agent outputs
- build folders
- stray compiled JS
- local cache folders
- generated reports
- design sync folders

Do not delete during first pass.

---

## Phase 13: Database-Adjacent Safety Audit

This is not a full database cleanup. It is a codebase audit for database-related risk.

Do not modify migrations, schemas, RLS policies, or database code during this pass.

Run if Supabase CLI is available:

```bash
supabase db lint > .cleanup/reports/supabase-db-lint.txt 2>&1 || true
supabase db diff > .cleanup/reports/supabase-db-diff.txt 2>&1 || true
```

Search for risky patterns:

```bash
grep -RIn "from(\|select(\|insert(\|update(\|delete(\|rpc(" src scripts supabase 2>/dev/null \
  > .cleanup/reports/supabase-query-patterns.txt || true

grep -RIn "service_role\|SUPABASE_SERVICE_ROLE\|service-role" src scripts supabase 2>/dev/null \
  > .cleanup/reports/service-role-usage.txt || true

grep -RIn "rls\|policy\|enable row level security\|using (true)\|with check" supabase 2>/dev/null \
  > .cleanup/reports/rls-policy-patterns.txt || true
```

Create:

```bash
.cleanup/reports/DATABASE_ADJACENT_RISK_REPORT.md
```

Include:

```md
# Database-Adjacent Risk Report

## Supabase CLI Findings

| Tool | Finding | Risk |
|---|---|---|

## Service Role Usage

| File | Usage | Risk |
|---|---|---|

## Query Duplication / Raw Query Hotspots

| File | Pattern | Refactor Candidate? |
|---|---|---|

## RLS / Policy Risk Areas

| File/Table | Concern | Risk |
|---|---|---|

## Do Not Touch Without Approval

| Area | Reason |
|---|---|

## BaseballHelm DB Findings

Deferred.
```

Do not alter database behavior. Only report.

---

## Phase 14: Security and Secret Hygiene Audit

Do not print actual secrets in reports. If a secret-like value is found, redact it.

Run:

```bash
grep -RIn "api_key\|apikey\|secret\|token\|password\|private_key\|service_role\|bearer" . \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=.git \
  --exclude-dir=dist \
  --exclude-dir=build \
  > .cleanup/reports/secret-pattern-scan.txt 2>&1 || true
```

Create:

```bash
.cleanup/reports/SECURITY_HYGIENE_REPORT.md
```

Include:

```md
# Security Hygiene Report

## Potential Secret-Like Findings

Do not include raw secrets. Redact values.

| File | Pattern | Risk | Recommendation |
|---|---|---|---|

## Service Role / Admin Client Risk

| File | Concern | Recommendation |
|---|---|---|

## Environment Variable Hygiene

| File | Issue | Recommendation |
|---|---|---|
```

Do not modify secrets or env files.

---

## Phase 15: Package and Script Hygiene Audit

Inspect package scripts, unused scripts, and dangerous script overlap.

```bash
cat package.json > .cleanup/reports/package-json-copy.txt
npm run > .cleanup/reports/npm-run-list.txt 2>&1 || true
```

Create:

```bash
.cleanup/reports/SCRIPT_HYGIENE_REPORT.md
```

Include:

```md
# Script Hygiene Report

## Existing Scripts

| Script | Purpose | Keep/Review/Remove Candidate |
|---|---|---|

## Potentially Obsolete Scripts

| Script | Why Suspicious |
|---|---|

## Safety-Critical Scripts

| Script | Why Important |
|---|---|

## Suggested Future Scripts

| Script | Purpose |
|---|---|
```

Do not remove scripts during the audit.

---

## Phase 16: Final Master Report

After all audit phases, create:

```bash
.cleanup/reports/CODEBASE_CLEANUP_MASTER_REPORT.md
```

Use this format:

```md
# Helm Codebase Cleanup Master Report

## Executive Summary

Summarize:

- total estimated bloat
- biggest source of bloat
- safest cleanup wins
- highest-risk areas
- BaseballHelm deferred status
- database-adjacent risks
- bundle risks
- architecture risks

## Key Metrics

| Metric | Value |
|---|---|
| App LOC | |
| Repo LOC excluding junk | |
| Largest file | |
| Largest folder | |
| Duplicate percentage | |
| Knip unused files | |
| Knip unused exports | |
| Knip unused dependencies | |
| Circular dependency count | |
| Bundle bloat concern | |
| BaseballHelm deferred findings | |

## Cleanup Categories

### Safe Cleanup Candidates

These are low-risk but still need approval.

| Rank | Item | Type | Expected Benefit | Risk |
|---|---|---|---|---|

### Manual Review Required

| Rank | Item | Reason |
|---|---|---|

### High Risk / Do Not Touch

| Item | Reason |
|---|---|

### Deferred BaseballHelm Findings

Summarize all BaseballHelm findings but do not fix.

## Recommended PR Plan

### PR 1: Reports and cleanup tooling only

No source changes.

### PR 2: Remove obvious generated artifacts

Only if approved.

### PR 3: Remove confirmed unused dependencies

Small batch only.

### PR 4: Remove confirmed dead non-Baseball files

Small batch only.

### PR 5: Deduplicate shared non-Baseball UI/components

Only after review.

### PR 6: Architecture cleanup

Only after review.

### PR 7: Bundle optimization

Only after review.

### PR 8: Test coverage before risky refactors

Only after review.

## Validation Plan

Every cleanup PR must run:

```bash
npm run typecheck
npm run lint
npm run build
npm run test
```

If relevant:

```bash
npm run test:e2e
```

## Rollback Plan

Every cleanup PR should be small enough to revert safely.

No large mixed cleanup PRs.
```

---

## Classification System

Every finding must be classified with one of these statuses:

```text
SAFE_CANDIDATE
MANUAL_REVIEW
LIKELY_FALSE_POSITIVE
HIGH_RISK_DO_NOT_TOUCH
DEFERRED_BASEBALLHELM
GENERATED_ARTIFACT
DEPENDENCY_REVIEW
ARCHITECTURE_REVIEW
BUNDLE_REVIEW
DATABASE_REVIEW
SECURITY_REVIEW
TEST_COVERAGE_REQUIRED
```

Do not use vague classifications like maybe or cleanup later.

---

## Cleanup Approval Gates

No code changes until after the master report is reviewed.

After approval, cleanup must happen in small PRs.

Each PR should:

- have a narrow purpose
- avoid BaseballHelm
- include before/after summary
- list exact files changed
- run validation commands
- avoid mixing formatting with logic changes
- avoid mixing dependency removals with refactors
- avoid touching migrations unless explicitly approved

Prefer:

```text
1 cleanup type per PR
fewer than 30 files changed when possible
fewer than 500 lines changed when possible
```

Avoid:

```text
100+ files changed
formatting + logic together
dependency upgrades + refactors together
BaseballHelm mixed with anything
database changes mixed with UI cleanup
```

---

## Approved Future Cleanup Batches

Only after human approval.

### Batch A: generated artifacts

Can include local reports, old screenshots, build outputs, accidental compiled JS, temporary review folders, old generated route atlases.

Must not include BaseballHelm.

### Batch B: unused dependencies

Remove in small groups.

```bash
npm uninstall package-name
npm install
npm run typecheck
npm run build
```

### Batch C: dead non-Baseball files

Only remove files flagged by multiple tools or manually verified.

Good evidence:

- flagged by Knip
- flagged by unimported
- no route usage
- no dynamic import
- no package script
- no test usage
- no docs reference
- no BaseballHelm relation

### Batch D: duplicate shared UI cleanup

Refactor repeated UI into shared components.

Do not touch BaseballHelm.

Target repeated cards, loading states, empty states, error states, dashboard shells, metric tiles, chart wrappers, and table wrappers.

### Batch E: architecture cleanup

Only after reports are reviewed.

Target circular imports, server/client boundaries, raw database queries inside components, duplicated services, shared hooks with too much business logic.

### Batch F: bundle cleanup

Only after reports are reviewed.

Target dynamic imports, heavy client libraries, page-level bundle splits, accidental server/client leakage.

### Batch G: test-first risky cleanup

Before risky refactors, add tests first.

Target auth, membership, invites, stats calculations, report exports, mobile flows, and database security assumptions.

---

## Full Audit Command Sequence

Run this sequence for the first pass:

```bash
cd helmv3
git checkout main
git pull
git checkout -b cleanup/comprehensive-code-audit
mkdir -p .cleanup/reports

npm install

npm run typecheck > .cleanup/reports/baseline-typecheck.txt 2>&1 || true
npm run lint > .cleanup/reports/baseline-lint.txt 2>&1 || true
npm run build > .cleanup/reports/baseline-build.txt 2>&1 || true
npm run test > .cleanup/reports/baseline-test.txt 2>&1 || true

npm i -D cloc knip jscpd ts-prune depcheck madge dependency-cruiser unimported npm-check-updates npm-package-json-lint prettier

find src -maxdepth 5 -type d | sort > .cleanup/reports/src-folder-map.txt
find supabase -maxdepth 5 -type d | sort > .cleanup/reports/supabase-folder-map.txt
find scripts -maxdepth 4 -type d | sort > .cleanup/reports/scripts-folder-map.txt
find . -maxdepth 3 -type d | sort > .cleanup/reports/repo-folder-map-depth-3.txt

grep -Ril "baseball\|Baseball\|BaseballHelm" src supabase scripts docs 2>/dev/null > .cleanup/reports/baseball-related-files.txt || true
grep -Ril "golf\|Golf\|GolfHelm" src supabase scripts docs 2>/dev/null > .cleanup/reports/golf-related-files.txt || true
grep -Ril "coach\|Coach\|CoachHelm" src supabase scripts docs 2>/dev/null > .cleanup/reports/coach-related-files.txt || true

npx cloc src supabase scripts --include-ext=ts,tsx,sql,mjs,js --by-file --csv --out=.cleanup/reports/cloc-app.csv

npx cloc . \
  --exclude-dir=node_modules,.next,dist,build,coverage,.git,.vercel,out,test-results,ui-intelligence,routes,.full-review,.worktrees,.cache \
  --exclude-ext=json,lock,svg,png,jpg,jpeg,webp,pdf,pptx \
  --by-file \
  --csv \
  --out=.cleanup/reports/cloc-repo.csv

find src supabase scripts \
  -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.sql" -o -name "*.mjs" -o -name "*.js" \) \
  -not -path "*/node_modules/*" \
  -exec wc -l {} + | sort -nr | head -100 \
  > .cleanup/reports/top-100-largest-source-files.txt

du -sh ./* ./.??* 2>/dev/null | sort -hr | head -100 > .cleanup/reports/largest-folders.txt

git rev-list --objects --all \
  | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
  | awk '$1=="blob" {print $3, $4}' \
  | sort -nr \
  | head -100 \
  > .cleanup/reports/largest-git-objects.txt

npx knip --reporter markdown > .cleanup/reports/knip.md 2>&1 || true
npx knip --reporter json > .cleanup/reports/knip.json 2>&1 || true

npx jscpd src supabase scripts \
  --min-lines 20 \
  --min-tokens 100 \
  --reporters console,html,json \
  --output .cleanup/reports/jscpd

npx jscpd src \
  --min-lines 10 \
  --min-tokens 60 \
  --reporters console,json \
  --output .cleanup/reports/jscpd-strict

npx ts-prune > .cleanup/reports/ts-prune.txt 2>&1 || true

npx depcheck --json > .cleanup/reports/depcheck.json 2>&1 || true
npx depcheck > .cleanup/reports/depcheck.txt 2>&1 || true
npx npm-check-updates > .cleanup/reports/npm-check-updates.txt 2>&1 || true
npm outdated > .cleanup/reports/npm-outdated.txt 2>&1 || true

npx unimported > .cleanup/reports/unimported.txt 2>&1 || true

npx madge src --extensions ts,tsx --circular > .cleanup/reports/madge-circular.txt 2>&1 || true
npx madge src --extensions ts,tsx --summary > .cleanup/reports/madge-summary.txt 2>&1 || true

npx depcruise src --output-type err-long > .cleanup/reports/dependency-cruiser.txt 2>&1 || true

npm run test:coverage > .cleanup/reports/test-coverage.txt 2>&1 || true

supabase db lint > .cleanup/reports/supabase-db-lint.txt 2>&1 || true
supabase db diff > .cleanup/reports/supabase-db-diff.txt 2>&1 || true

grep -RIn "from(\|select(\|insert(\|update(\|delete(\|rpc(" src scripts supabase 2>/dev/null > .cleanup/reports/supabase-query-patterns.txt || true

grep -RIn "service_role\|SUPABASE_SERVICE_ROLE\|service-role" src scripts supabase 2>/dev/null > .cleanup/reports/service-role-usage.txt || true

grep -RIn "rls\|policy\|enable row level security\|using (true)\|with check" supabase 2>/dev/null > .cleanup/reports/rls-policy-patterns.txt || true

grep -RIn "api_key\|apikey\|secret\|token\|password\|private_key\|service_role\|bearer" . \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=.git \
  --exclude-dir=dist \
  --exclude-dir=build \
  > .cleanup/reports/secret-pattern-scan.txt 2>&1 || true

npm run > .cleanup/reports/npm-run-list.txt 2>&1 || true

npm run analyze
```

Then manually create the required Markdown summary reports from the raw outputs.

---

## Required Final Deliverables

At the end of the audit, produce these files:

```text
.cleanup/reports/BASELINE_HEALTH.md
.cleanup/reports/PRODUCT_BOUNDARY_MAP.md
.cleanup/reports/LOC_AND_SIZE_SUMMARY.md
.cleanup/reports/KNIP_CLASSIFIED_FINDINGS.md
.cleanup/reports/DUPLICATION_REPORT.md
.cleanup/reports/UNUSED_EXPORTS_REPORT.md
.cleanup/reports/DEPENDENCY_AUDIT.md
.cleanup/reports/ARCHITECTURE_TANGLES.md
.cleanup/reports/BUNDLE_BLOAT_REPORT.md
.cleanup/reports/TEST_COVERAGE_RISK_REPORT.md
.cleanup/reports/GENERATED_ARTIFACTS_AUDIT.md
.cleanup/reports/DATABASE_ADJACENT_RISK_REPORT.md
.cleanup/reports/SECURITY_HYGIENE_REPORT.md
.cleanup/reports/SCRIPT_HYGIENE_REPORT.md
.cleanup/reports/DEFERRED_BASEBALLHELM_FINDINGS.md
.cleanup/reports/CODEBASE_CLEANUP_MASTER_REPORT.md
```

Do not stop at raw tool output.

The final output must explain:

- what matters
- what is noise
- what is safe
- what is risky
- what should wait
- what BaseballHelm findings were deferred
- what database-adjacent risks exist
- what bundle risks exist
- what the first 5 cleanup PRs should be

---

## Final Response Format to Owner

When finished, respond with:

```md
# Cleanup Audit Complete

## Summary

- App LOC:
- Repo LOC:
- Biggest bloat source:
- Safe cleanup candidates:
- Manual review count:
- BaseballHelm deferred findings:
- Database-adjacent risks:
- Bundle risks:
- Build status:
- Typecheck status:
- Lint status:

## Most Important Findings

1.
2.
3.
4.
5.

## Recommended First PRs

1.
2.
3.
4.
5.

## Do Not Touch Yet

- BaseballHelm
- migrations
- high-risk dependencies
- auth/security files
- production stats logic
- database/RLS behavior

## Reports Created

[List all report files]
```

---

## Final Reminder

Do not touch BaseballHelm.

Do not delete anything in the first pass.

Do not fix old/new BaseballHelm conflicts.

Do not alter database behavior.

Do not remove dependencies during the audit.

Only audit, classify, and report.