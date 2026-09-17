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
rewrite the checkout. Pushing a branch does not deploy; merging to `main`
does — the Vercel Git integration builds and promotes every `main` commit
(`scripts/vercel-ignore-build.sh` skips every other branch). Never deploy
from the CLI; `scripts/deploy-prod.sh` is retired and refuses to run. After
landing a PR, check that Vercel's deployment for the merge commit is READY.
`.vercelignore` replaces default ignores.
