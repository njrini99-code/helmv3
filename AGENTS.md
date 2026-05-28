# AGENTS.md

## Feature awareness

- Treat `memory/registry.yml` as the feature routing table for AI work.
- Before changing or reviewing mapped feature code, identify impacted files, map them through `memory/registry.yml`, and read the mapped `memory/features/*.md` current-state docs first.
- Use `npm run knowledge:map -- --files <paths...>` to find impacted features.
- Use `npm run knowledge:context -- --files <paths...> --task "<task>"` to build `/tmp/helmv3-context-pack.md` for larger changes or PR reviews.
- If a feature is missing from `memory/registry.yml`, say so and either add the mapping or explicitly mark the feature-awareness gap.
- Do not silently change business behavior without updating the relevant `memory/features/*` current-state doc or explaining why no doc update is needed.

## Mobile UI rules

- Use the `mobile-app-consistency-system` skill for mobile web screens, responsive app UI, navigation, headers, cards, tabs, filters, buttons, chips, empty states, and layout refactors.
- All mobile screens must use the shared app shell with consistent safe-area handling, page padding, section spacing, and bottom-nav clearance.
- All mobile headers must use either a Standard header or an Action header pattern.
- Standard header: leading nav control, title, optional subtitle or meta, and at most one visible trailing action.
- Action header: leading nav control, title, and one primary CTA on the right.
- Do not stack multiple utility rows in the header unless there is no viable alternative.
- Bottom nav is reserved for primary everyday destinations only.
- Side drawer is reserved for secondary, team, admin, or account destinations.
- Avoid duplicating major destinations across bottom nav and drawer.
- Reuse shared button, chip, tab, card, metric, and empty-state components whenever possible.
- Do not introduce one-off spacing, radius, icon sizes, or control heights.
- Each screen should expose one clear primary action, a small number of secondary actions, and move lower-priority actions into overflow or a bottom sheet.
- Prefer calmer, denser, more scannable mobile layouts over decorative or oversized sections.
- Reduce top-of-screen chrome so users reach content earlier.
- Empty states should stay compact: icon, short title, one sentence, one CTA.
- Every changed mobile screen should feel visually and behaviorally consistent with the rest of the app.

## Automated review

PRs are reviewed by **two AI reviewers in parallel** on every push:

- **CodeRabbit** — line-level static analysis. Config at
  `.coderabbit.yaml` plus `.coderabbit/ast-grep/` and
  `.coderabbit/semgrep/helmv3.yml`. Path-specific instructions cover
  `src/app/**`, `src/components/**`, `src/lib/supabase/**`,
  `supabase/migrations/**`, `supabase/functions/**`, `ios/App/**`,
  `tools/**`, `.github/workflows/**`, and `e2e/**`.
- **Greptile** — whole-codebase view, catches drift from architecture
  docs and duplicated logic. Config at `.greptile/instructions.md`
  (natural-language rules) and `.greptile/config.json` (ignores,
  additional-context docs). Installed via GitHub App at
  https://app.greptile.com.

CI runs across two platforms:

- **GitHub Actions** (`.github/workflows/ci.yml`, `review-gate.yml`)
  — every-PR fast path (typecheck, lint, vitest, build, RLS tests,
  Review Gate static analyzers).
- **CircleCI** (`.circleci/config.yml`, see `.circleci/README.md`)
  — weekly heavy jobs (Knip, Stryker, sqlfluff, npm audit, Squawk)
  scheduled Mondays 06:00 UTC, plus iOS Capacitor compile on
  M-series macOS runners (push to `main`, `release/*`, `ios/*`,
  `capacitor/*`).

Pre-merge gate blocks (must be `error`-clean before merge):
- Service-role key in a client bundle
- New table without RLS + policy in the same migration
- Server action without `supabase.auth.getUser()` before any DB call
- Bare table names without `golf_` / `baseball_` prefix
- DELETE-then-INSERT in any save/submit/sync write path

Static analyzers enabled: ESLint, Biome, oxc, ast-grep, ruff, pylint,
swiftlint, shellcheck, yamllint, actionlint, markdownlint, languagetool,
hadolint, checkov, gitleaks, semgrep, sqlfluff.
