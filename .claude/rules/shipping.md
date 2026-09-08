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
rewrite the checkout. Pushing does not deploy; `scripts/deploy-prod.sh` is
the production deploy command when the user has requested a release.
Vercel uploads use `--archive=tgz`; `.vercelignore` replaces default ignores.
