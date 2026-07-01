# Security Policy

Helm Sports Labs operates HelmV3 (GolfHelm / CoachHelm / BaseballHelm) as a
commercial SaaS handling coach and player PII on a shared Supabase backend.
We take security reports seriously.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Report privately via GitHub's [private vulnerability reporting](https://github.com/njrini99-code/helmv3/security/advisories/new).
If you cannot use that, email the maintainer at the address on the GitHub profile.

Please include:

- A description of the issue and its impact (auth bypass, RLS gap, exposed
  secret/PII, injection, etc.)
- Steps to reproduce or a proof of concept
- Affected surface (web / iOS, environment, table/route/function)

## What to expect

- **Acknowledgement within 3 business days.**
- A coordinated fix and disclosure timeline; please give us a reasonable window
  to remediate before any public disclosure.

## Scope

In scope: this repository's application code, Supabase migrations and RLS
policies, GitHub Actions / CI workflows, and dependency supply chain.

Out of scope: social engineering, physical attacks, denial-of-service, and
findings that require a compromised end-user device.

## Hardening practices in this repo

- Secret scanning **and push protection** are enabled — committing a key is
  blocked at push time. Do not bypass it; rotate any credential that leaks.
- Row-Level Security is enforced and tested with pgTAP suites under
  `supabase/tests/rls/`; anon access is revoked by default.
- CodeQL, gitleaks, semgrep, and ast-grep run on every pull request.
