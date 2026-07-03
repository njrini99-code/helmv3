# Repomix Context Packs

HelmV3 uses Repomix as an on-demand AI context pack generator. It is intentionally not installed as a devDependency because current Repomix releases require Node 22+, while the app engine remains `>=20.16.0`.

## Setup

Use Node 22+ for context generation:

```bash
nvm use 22
```

or install Repomix globally with Homebrew. The repo wrapper calls pinned `repomix@1.16.0` through `npx` so the app dependency graph stays clean:

```bash
bash scripts/context/repomix.sh --version
```

To test a Repomix upgrade before changing the pinned default, set `REPOMIX_VERSION`:

```bash
REPOMIX_VERSION=1.16.0 bash scripts/context/repomix.sh --version
```

## Common Packs

```bash
npm run ctx:repo              # full repo XML
npm run ctx:repo:compressed   # compressed full repo XML
npm run ctx:repo:diff         # repo plus git diff/log context
npm run ctx:repo:md           # full repo markdown
npm run ctx:token-tree        # token distribution only
npm run ctx:db                # migrations, DB types, DB docs
npm run ctx:baseball          # BaseballHelm surface
npm run ctx:golf              # GolfHelm surface
npm run ctx:admin             # Helm Bridge/admin surface
npm run ctx:ui                # page/component/CSS context
npm run ctx:tests             # tests and test config
npm run ctx:changed           # locally modified and untracked files
npm run ctx:staged            # staged files only
npm run ctx:docs              # docs and memory context
```

Outputs go under `.repomix/` and are gitignored. Treat generated packs as sensitive because they can contain broad source context.

## Review Prompts

Prompt templates live in `docs/prompts/repomix/`:

- `repo-cleanup.md`
- `db-audit.md`
- `changed-files-review.md`

## Fresh Context

```bash
npm run fresh:context
```

This runs docs and knowledge checks before generating compressed repo, changed-file, and DB packs. It intentionally does not run `db:types:check` because that command regenerates `src/lib/types/database.ts`; use it only when you are ready to inspect or commit database type drift.

## Architecture Tools

These commands are advisory until the existing dependency baseline is reviewed:

```bash
npm run arch:check
npm run arch:graph
npm run deps:cycles
npm run knip
npm run knip:prod
```

The dependency-cruiser config starts with warnings for cycles, client-to-server/admin imports, shared UI feature imports, sport cross-imports, and legacy `baseball_lift` / `baseball_strength` references. Tighten warning rules into errors only after a baseline report is triaged.
