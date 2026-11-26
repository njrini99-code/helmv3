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

Four more followed in repo tidy 6 (2026-11-25), once their
`memory/registry.yml` routes were dropped or re-routed:

- `SECURITY_AUDIT.md` and `PUSH_NOTIFICATION_AUDIT.md` (2026-03-05): the
  App Store submission audits. Team access control now routes to
  `docs/security/S4_TEAMMATE_READ_AUDIT_2026-10-21.md` and Settings to
  `docs/clubhouse/phone/push-opt-in.md`; the other routes were dropped.
- `ADMIN_DASHBOARD_UPGRADE_PLAN.md`, `BI_DASHBOARD_ARCHITECTURE.md`: early
  admin plans; `memory/features/admin-platform.md` is the current doc.
