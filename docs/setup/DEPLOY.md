# Deploying Helm Sports Labs

Production is one Vercel project (`helmv3`, id in `config/release-policy.yml`).
`vercel.json` disables Vercel Git deployments for every branch, so **merging or
pushing to `main` does not deploy**. A deploy is a CLI (or connector) call you
make when the change should be live. Docs-only changes need no deploy.

## Deploy

Run it from a checkout linked to the real project (canonical
`/Users/ricknini/Downloads/helmv3` is; a worktree is linked only if `.vercel/`
exists in it). From an unlinked directory `vercel deploy` silently creates a
stray project named after the directory (this made two accidental
`helmv3-*-release-*` projects), so check `.vercel/project.json` first and
compare its `projectId` with `production.vercel_project_id` in
`config/release-policy.yml`.

```bash
SHA=$(git rev-parse HEAD)          # a commit that is on origin/main
SCOPE=$(node -p 'require("./.vercel/project.json").orgId')
./node_modules/.bin/vercel deploy --prod --yes --archive=tgz --scope "$SCOPE" \
  --build-env "NEXT_PUBLIC_SENTRY_RELEASE=$SHA" \
  --env "NEXT_PUBLIC_SENTRY_RELEASE=$SHA"
```

- The Vercel connector (`create_deployment`) works too; stamp the same release.
- `NEXT_PUBLIC_SENTRY_RELEASE` puts the commit in the served bundle. Without it
  the release tag on production Sentry events is a stale SHA from an earlier
  deploy, and `release:status` cannot match the served commit.
- `--archive=tgz` avoids the Vercel file-count and request-size limits that
  rejected plain uploads before.
- Use the repo-local CLI (`./node_modules/.bin/vercel`); a bare `vercel` may not
  be on `PATH`.
- Deploy from `main`'s tip when you can, so what is live is what is merged.
- Worktrees from `scripts/new-worktree.sh` hold symlinks to the canonical
  checkout's env and tool files (`scripts/lib/shared-workspace-runtime.mjs`:
  `.env*`, `.codex/config.toml` and similar local files). Vercel
  rejects absolute symlinks at extraction (seen 2026-10-21: ".codex/config.toml
  is not a valid symlink"). Deploy from the canonical checkout, or from a
  symlink-free export. The export has no `.git` and no `node_modules`, so
  capture the SHA, scope and CLI path from the checkout first, then run the
  deploy from the export:

  ```bash
  SHA=$(git rev-parse HEAD); SCOPE=$(node -p 'require("./.vercel/project.json").orgId')
  VERCEL="$PWD/node_modules/.bin/vercel"   # or the canonical checkout's copy
  DIR=$(mktemp -d); git archive HEAD | tar -x -C "$DIR"
  mkdir -p "$DIR/.vercel" && cp .vercel/project.json "$DIR/.vercel/project.json"
  (cd "$DIR" && "$VERCEL" deploy --prod --yes --archive=tgz --scope "$SCOPE" \
    --build-env "NEXT_PUBLIC_SENTRY_RELEASE=$SHA" --env "NEXT_PUBLIC_SENTRY_RELEASE=$SHA")
  ```

  `.vercel/project.json` is a real file with the same project id. That route
  built a Turbopack preview of main cleanly. The `.codex/config.toml` entries
  in `.vercelignore` are the attempted root-cause fix and are unproven until a
  worktree deploy succeeds; keep this workaround until then.
- `.vercelignore` replaces Vercel's default ignore list: every secret-bearing
  ignored path must be listed (checked by `npm run check:vercelignore`).

## Verify

```bash
npm run release:status
```

It reads the served bundle and reports whether production is at `origin/main`.
Call a release live only after it shows the SHA you deployed. If the CLI
crashes after the upload finished, the deploy may still be fine: check
`release:status` before redeploying.

Also glance at runtime errors after a deploy (Vercel connector
`get_runtime_errors`, or Sentry; see the `helm-sentry` skill).

## Roll back

Promote the previous production deployment (Vercel dashboard, the connector's
`request_rollback`, or `./node_modules/.bin/vercel promote <deployment-url>`),
then run `release:status`. A rollback does not undo migrations; a schema change
is rolled back with a forward migration (`docs/operations/APPLY_PATH.md`).

## Environment and Supabase

Required variables are listed in `.env.example` and checked by
`npm run check:env`. Core ones: `NEXT_PUBLIC_SUPABASE_URL`
(`https://qmnssrrolpinvwjjnufo.supabase.co`),
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (falls back to
`NEXT_PUBLIC_SUPABASE_ANON_KEY`; see `src/lib/supabase/keys.mjs`) and
`NEXT_PUBLIC_APP_URL`. Set them in Vercel (Project, Settings, Environment
Variables) or with `vercel env add`. `vercel env pull` writes sensitive values
as empty strings, so an empty pulled value is not proof a variable is unset
(`memory/context/agent-operations.md`).

Supabase auth redirect URLs must include the production domain (Authentication,
URL Configuration). Schema changes reach production through
`docs/operations/APPLY_PATH.md`, not a deploy.

## Troubleshooting

- **Build fails:** `npm run typecheck`, `npm run lint`, then `npm run build`.
- **Auth not working:** check the redirect URLs and the Supabase env vars.
- **Deploy "skipped":** `scripts/vercel-ignore-build.sh` skips any build that
  carries `VERCEL_GIT_COMMIT_REF` (Git-triggered builds); CLI deploys do not.
- **Cost:** each production deploy uses Vercel build minutes; batch ready PRs
  before deploying.
