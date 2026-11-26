# Audits, August to September 2026

Archived 2026-11-25 (repo tidy 1) from `docs/audits/`, moved with `git mv`; the
files are verbatim. 67 files: dated audit snapshots from 2026-08-03 to
2026-09-08 (health, data integrity, RLS, dead code, iOS premium and
BaseballHelm reads), two data folders (`data-2026-08-20/`, `data-2026-08-25/`),
the iOS evidence screenshots (`evidence/`) and two audit tracker workbooks.

These are point-in-time findings. Several still read "active" or "current" in
their own headers; read each against its date, and check live state before
acting on one. Current truth lives in `memory/features/`, the generated files
under `docs/generated/`, and the code.

Two audits stayed in `docs/audits/` because `memory/registry.yml` routes
features to them and `knowledge:check` forbids routing to an archived
document: `BASEBALLHELM_CANONICAL_SPEC.md` and
`IOS_PREMIUM_NATIVE_AUDIT_2026-08-25.md`. Their evidence folder is here:
`evidence/ios-premium-2026-08-25/`.
