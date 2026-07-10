<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: Completed-wave planning doc; the AI codebase-intelligence report it planned now lives at docs/ai-system/helmv3-ai-codebase-intelligence.md, the current reference.
KEPT FOR HISTORY -- do not delete this file.
-->

# Helmv3 AI Codebase Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Helmv3-native codebase intelligence layer that maps changed files to features, business rules, UI contracts, tests, and context docs without duplicating the existing `memory/` system.

**Architecture:** Keep `AGENTS.md`, `CLAUDE.md`, Greptile, and CodeRabbit as the instruction/review front door. Add `memory/registry.yml` as the routing table and lightweight Node scripts under `scripts/knowledge/` to produce review context packs and documentation coverage checks.

**Tech Stack:** Node.js stdlib, Markdown, YAML-like registry format, GitHub Actions/CircleCI-ready CLI scripts.

---

### Task 1: Add The Intelligence Layer Docs

**Files:**
- Create: `docs/ai-system/helmv3-ai-codebase-intelligence.md`
- Create: `memory/registry.yml`
- Create: `memory/templates/feature.md`
- Create: `memory/templates/flow.md`
- Create: `memory/templates/business-rule.md`
- Create: `memory/templates/ui-contract.md`
- Create: `memory/prompts/master-feature-audit.md`
- Create: `memory/prompts/pr-review.md`
- Create: `memory/prompts/docs-update.md`

- [x] **Step 1: Document the Helmv3-specific setup**

Create `docs/ai-system/helmv3-ai-codebase-intelligence.md` with the operating model: `memory/` is the source of truth, Greptile and CodeRabbit remain PR reviewers, Codex generates context packs and fixes, and n8n/Linear/Slack become later orchestration layers.

- [x] **Step 2: Seed `memory/registry.yml` with the first high-risk features**

Add entries for CoachHelm AI, golf round lifecycle, and team access control. Each entry maps docs, code paths, database paths, tests, integrations, and criticality.

- [x] **Step 3: Add templates and prompts**

Add reusable templates for future feature audits and prompt files for feature audit, PR review, and docs update passes.

### Task 2: Add Context-Pack Scripts

**Files:**
- Create: `scripts/knowledge/lib/registry.mjs`
- Create: `scripts/knowledge/map-changed-files.mjs`
- Create: `scripts/knowledge/generate-context-pack.mjs`
- Create: `scripts/knowledge/check-doc-coverage.mjs`
- Create: `scripts/knowledge/stale-doc-check.mjs`
- Modify: `package.json`

- [x] **Step 1: Implement registry parsing and glob matching**

Create a small stdlib parser for the intentionally simple `memory/registry.yml` format. It supports nested scalar values and list values under `docs`, `code`, `integrations`, `systems`, and `review`.

- [x] **Step 2: Implement changed-file mapping**

`map-changed-files.mjs` accepts explicit files or derives changed files from Git, then prints impacted feature mappings as JSON.

- [x] **Step 3: Implement context-pack generation**

`generate-context-pack.mjs` builds a Markdown context pack with changed files, impacted features, docs excerpts, rules, and open questions.

- [x] **Step 4: Implement coverage/staleness checks**

`check-doc-coverage.mjs` fails when critical registry docs are missing. `stale-doc-check.mjs` warns when feature code changes without a corresponding `memory/` or `docs/` update.

- [x] **Step 5: Wire package scripts**

Add `knowledge:map`, `knowledge:context`, and `knowledge:check` to `package.json`.

### Task 3: Validate

**Files:**
- No new files.

- [ ] **Step 1: Run coverage validation**

Run: `npm run knowledge:check -- --files src/lib/coachhelm/v3/llm/compose.ts`

Expected: coverage succeeds; stale-doc check warns only if no docs file is included in the changed-file set.

- [ ] **Step 2: Generate a context pack**

Run: `npm run knowledge:context -- --files src/lib/coachhelm/v3/llm/compose.ts --task "Review CoachHelm LLM composition change"`

Expected: `/tmp/helmv3-context-pack.md` contains the CoachHelm AI docs and review rules.
