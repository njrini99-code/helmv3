# Stale top-level docs, archived 2026-11-25

Archived 2026-11-25 (repo tidy 1) from the top of `docs/`, moved with
`git mv`; the files are verbatim. Each carries a STALE, PARKED or RETIRED
header, or had not been touched since early 2026:

- `BASEBALL_RLS_SECURITY_AUDIT.md` (2026-02-21) and `UIUX_AUDIT.md`
  (2026-03-05): audits of the app as it stood for the first App Store
  submission.
- `fairway-coachhelm-insight-rebuild.md`, `LANDING_ENTRY_WORLD_DESIGN.md`:
  parked designs; the landing design was rejected in favour of #650.
- `v3-design-language.md`: retired; `src/styles/design-tokens.css` and
  `.claude/rules/design-system.md` replaced it.

Four more stale docs were meant to move here and did not, because
`memory/registry.yml` still routes features to them and `knowledge:check`
forbids routing to an archived document: `docs/ADMIN_DASHBOARD_UPGRADE_PLAN.md`,
`docs/BI_DASHBOARD_ARCHITECTURE.md`, `docs/PUSH_NOTIFICATION_AUDIT.md` and
`docs/SECURITY_AUDIT.md`. Drop those registry routes first, then archive them.
