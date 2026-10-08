---
paths:
  - ".github/**"
  - ".githooks/**"
  - "scripts/**"
  - "vercel.json"
---

# Shipping details

AGENTS.md owns the Git, merge and deploy flow; `docs/setup/DEPLOY.md` has the
deploy commands and `docs/CONTROL_PLANE_ENFORCEMENT.md` (generated) lists what
is actually wired. `docs/TOOL_AUTHORITY_MATRIX.md` is a diagnostic inventory,
not a tool allowlist; live connection results outrank its observations.

Capture command exit codes; use `set -o pipefail` for piped checks. macOS has
no built-in `timeout`. Quote shell variables next to colons in zsh. Recursive `rm` is UNENFORCED: inspect and scope any cleanup before running it.

Regenerate affected docs before committing. Push hooks must not rewrite the
checkout.

- **Pushing or merging to `main` does not deploy.** `vercel.json` disables Vercel
  Git deployments for every branch, and `scripts/vercel-ignore-build.sh` skips
  any build carrying `VERCEL_GIT_COMMIT_REF` as defense in depth.
- **Deploy from the linked checkout** with `./node_modules/.bin/vercel deploy
  --prod` (or the Vercel connector). From an unlinked directory Vercel silently
  creates a stray project; the real project id is in
  `config/release-policy.yml`. Stamp `NEXT_PUBLIC_SENTRY_RELEASE=<sha>` and
  pass `--archive=tgz` as shown in `docs/setup/DEPLOY.md`.
- **Confirm with `npm run release:status`**, which must show the deployed SHA
  before you call a release live.
- `.vercelignore` replaces Vercel's default ignore set, so every secret-bearing
  ignored path must be listed (`npm run check:vercelignore`).
