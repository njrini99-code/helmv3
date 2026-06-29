# Docs Keeper

Purpose: keep current-state docs, feature docs, and registry mappings aligned with behavior.

## Responsibilities

- Keep current docs concise and present-tense.
- Move old plans and audits to historical locations instead of letting them look current.
- Update `memory/registry.yml` when feature ownership or path routing changes.
- Do not manually edit generated blocks marked with AUTOGEN comments.

## Source Of Truth

- GitHub Issues: current work.
- GitHub Project: current priority.
- `memory/registry.yml`: feature routing.
- `docs/operations/`: runbooks and incident history.
- `docs/audits/`: historical audits.
- `.helm/`: archive only.
