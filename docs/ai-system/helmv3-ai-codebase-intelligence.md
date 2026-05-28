# Helmv3 AI-Native Codebase Intelligence System

Helmv3 already has the hard parts of an AI-native engineering system: `AGENTS.md`, `CLAUDE.md`, CodeRabbit, Greptile, GitHub Actions, CircleCI, Supabase tests, Playwright, and a curated `memory/` folder. This layer makes those parts act like one operating system.

## Source Of Truth

Use `memory/` as the repo intelligence source. Do not create a parallel `/knowledge` tree unless the repo explicitly migrates there later.

| Need | Helmv3 Source |
| --- | --- |
| Feature inventory | `memory/context/golfhelm-features.md` |
| Routes and actions | `memory/projects/golfhelm.md` |
| Tables and enums | `memory/glossary.md` |
| Full database columns | `memory/context/golfhelm-database.md` |
| CoachHelm AI behavior | `memory/context/coachhelm-ai.md` |
| Feature-to-code routing | `memory/registry.yml` |
| Reusable audit prompts | `memory/prompts/` |

## Tool Roles

| Tool | Role |
| --- | --- |
| Codex | Implements fixes, generates context packs, validates locally, updates docs |
| Greptile | Whole-codebase PR review and drift detection |
| CodeRabbit | Line-level review, static analysis, custom security and RLS rules |
| GitHub Actions | Fast PR gate: typecheck, lint, unit tests, build, Supabase lint and RLS |
| CircleCI | Heavy jobs: iOS compile, Lighthouse preview, Knip, Stryker, Squawk, Promptfoo |
| Playwright | Runtime/browser validation, especially mobile and authenticated flows |
| Supabase CLI | Local and linked schema validation, migration safety, RLS tests |
| Sentry Seer and Datadog | Production incident feedback for future `memory/incidents/` entries |
| Linear, Slack, n8n | Later orchestration layer for work intake, notification routing, docs PRs |

## Review Flow

```txt
Changed files
  -> scripts/knowledge/map-changed-files.mjs
  -> memory/registry.yml impacted features
  -> scripts/knowledge/generate-context-pack.mjs
  -> Codex/Claude product-aware review
  -> Greptile whole-codebase review
  -> CodeRabbit line/static review
  -> Playwright/Supabase/CI validation
  -> docs or Linear follow-up if knowledge is stale
```

## PR Workflow

`.github/workflows/feature-awareness.yml` runs on pull requests and uploads three artifacts:

- `feature-map.json` — changed files mapped to `memory/registry.yml` features.
- `summary.md` — human-readable impacted feature summary and suggested checks.
- `context-pack.md` — focused context pack for Codex, Claude, Greptile, or manual review.

This workflow is intentionally advisory for now. Promote it to a required gate only after normal PR traffic shows low noise and registry coverage is strong.

## First High-Risk Feature Set

Start with these because they cross product behavior, UI, database, and trust contracts:

1. CoachHelm AI and insight generation.
2. Golf round save, submit, review, recap, and feedback lifecycle.
3. Team, coach, player, and RLS access control.

## Operating Rules

- Keep `AGENTS.md` short and directive; point to `memory/registry.yml` and existing `memory/context/*` docs.
- Use `memory/registry.yml` to route changed files to feature docs, business rules, UI contracts, tests, and incidents.
- Generate a context pack for PRs and larger local tasks instead of dumping the repo into an LLM.
- Mark unknown behavior explicitly. Do not turn guesses into source-of-truth docs.
- Add docs updates as reviewable changes, not silent generated churn.
- Use Playwright for real browser confidence; TypeScript and tests alone have missed Helmv3 runtime issues before.

## Useful Commands

```bash
npm run knowledge:map -- --files src/lib/coachhelm/v3/llm/compose.ts
npm run knowledge:context -- --files src/lib/coachhelm/v3/llm/compose.ts --task "Review CoachHelm LLM composition"
npm run knowledge:check -- --files src/lib/coachhelm/v3/llm/compose.ts memory/context/coachhelm-ai.md
```

The context pack is written to `/tmp/helmv3-context-pack.md` by default.
