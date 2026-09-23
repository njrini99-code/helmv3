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
Git deployments are disabled for every branch by `vercel.json`; production is
promoted intentionally from an approved deployment. The ignored-build script
is defense in depth and skips any build carrying `VERCEL_GIT_COMMIT_REF`.
The release path is in AGENTS.md "Production" (`scripts/deploy-prod.sh`,
which checks the tree, branch, link and weekly budget before deploying). After
a release, `npm run release:status` must show the approved SHA.

`.vercelignore` replaces the default ignore set; every secret-bearing ignored
path must therefore be listed explicitly and checked by the repository doctor.
