# Overnight remediation audit — 2026-08-18/19

Point-in-time working record of a multi-lane audit run overnight on
2026-08-18 into 2026-08-19. Committed on 2026-08-19 by owner decision.

**This is an archive, not current-state documentation.** It is a snapshot of
what was believed at the time. Where it disagrees with the live database, the
workflows, or `memory/`, those are right and this is stale. Several findings
here were fixed within hours of being written — read it as history.

It lives under `docs/archive/` deliberately: that directory is excluded from
the markdown-lint ratchet (`scripts/markdown-lint-ratchet.mjs` skips any
directory named `archive`). These 20 files carry roughly 1,200 long lines,
which would otherwise push `MD013` past its baseline of 20,425 and turn the
`Review Gate / markdownlint` check red. Do not "clean up" the formatting here;
reflowing it buys nothing and the exclusion makes it free.

## Redaction — read before adding anything to this directory

**This repository is PUBLIC.** `OVERNIGHT_REPORT.md` sections 3 and 4 have had
their mechanism, predicates and reproduction removed, because both describe
role-escalation gaps that were **still live in production** when this was
committed. The section headings and numbering are left in place so the omission
is visible rather than silent, and a notice in the body explains why.

The rule that produced that edit, for anyone adding files here later:

> Do not publish exploit detail for a defect that is not yet fixed.

Fixed defects are fine — better than fine, they are the useful part of an
audit. The distinction is whether a reader can act on it *today*.

Full unredacted text stays in the owner's local packet
(`~/helm-remediation-2026-08-18/`), which also holds the `.sql`, `.json`,
`.py`, `.patch` and `.csv` working artifacts that were not committed.

## What was verified before committing

- **Secrets:** none. Every `service_role` occurrence is the Postgres role
  *name* or a `${{ secrets.* }}` workflow reference, never a value.
- **PII:** the owner's own address, plus `@helm.test` fixtures. No third-party
  personal data.
- **Live defects:** one file carried exploit detail for two unfixed gaps;
  redacted as above. Neither policy is named anywhere in this directory.

## Status of the headline findings, as of 2026-08-19

| # | Finding | Status |
|---|---|---|
| 2 | Role-blind coach predicate on round/shot/hole DELETE | **FIXED** — `20260819060000` applied to production 2026-08-19 |
| 3 | Team join-code rotation | **OPEN** — detail withheld |
| 4 | Roster eviction | **OPEN** — detail withheld |
| 5 | Account deletion cascades through round history | **OPEN** — `20260819050000` written, deliberately not applied |

Finding 5 is left described in full on purpose: it is self-service data loss
affecting the acting user's own records, not a way to reach anyone else's, so
publishing it enables no attack.

Also applied 2026-08-19, from the same run: `20260819080000` (course-image
upload scoping) and `20260819190000`, the forward fix for a column-capture bug
in it.
