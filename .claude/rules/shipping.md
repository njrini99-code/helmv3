---
paths:
  - ".github/**"
  - ".githooks/**"
  - "scripts/**"
  - "vercel.json"
---

# Shipping details

AGENTS.md owns authorization and Git policy. The generated
`docs/CONTROL_PLANE_ENFORCEMENT.md` describes configured guards;
`docs/TOOL_AUTHORITY_MATRIX.md` is a diagnostic inventory, not an exclusive
tool allowlist. Live connection results outrank its historical observations.

Capture command exit codes; use `set -o pipefail` for piped checks. macOS has
no built-in `timeout`. Quote shell variables next to colons in zsh.
Recursive `rm` is UNENFORCED: inspect and scope any cleanup before running it.

Regenerate affected docs explicitly before committing. Push hooks must not
rewrite the checkout. **Pushing or merging to `main` does not deploy.** Vercel
Git deployments are disabled for every branch by `vercel.json`. The ignored-build
script is defense in depth and skips any build carrying `VERCEL_GIT_COMMIT_REF`.
Production deploys only when the owner says to deploy `main`; the agent then
deploys it (Vercel connector or repo-local CLI) from a clean checkout at the
current `origin/main` SHA, with `NEXT_PUBLIC_SENTRY_RELEASE=<sha>` stamped as
both build and runtime env (AGENTS.md "Production"). After a release,
`npm run release:status` must show the released SHA before anyone calls it
live.

`.vercelignore` replaces the default ignore set; every secret-bearing ignored
path must therefore be listed explicitly and checked by the repository doctor.
