# Pre-Commit Security Scan — helmv3

**Date:** 2026-05-07 (UTC)
**Branch:** `incidents/2026-05-06-bulk-fixes`
**Verdict:** ✅ SAFE TO COMMIT — 0 new Critical/High findings on staged lines.

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 25 |
| 🟠 High | 299 |
| 🟡 Medium | 230 |
| 🟢 Low | 31 |
| **Total** | **585** |

| Origin | Count |
|--------|-------|
| 🆕 New (this commit's lines) | 0 |
| 📋 Existing (already committed) | 585 |

**Risk score:** 100/100 (Critical Risk) — driven entirely by pre-existing findings.

## Pre-existing findings worth acting on

### 🔴 Leaked Anthropic API key (committed in git history)
- File: `tools/continuous-improvement/run-now-with-test.sh:4`
- Match: `sk-ant-api03-XD8E2ACtgAFCh_XGT…` (3 instances across the file and its worktree copies)
- First introduced: commit `fc3a9da1` ("chore: Complete Cycle 001 verification and fixes")
- **Remediation:** rotate the key at https://console.anthropic.com/settings/keys, then either replace with `${ANTHROPIC_API_KEY}` env-var lookup or remove the file. Consider `git filter-repo` to scrub history if the key is still active and the repo has external collaborators.

### 🔴 npm audit — 1 critical, 10 high (transitive deps)
- jspdf (1 critical), @xmldom/xmldom, flatted, minimatch, next, picomatch, rollup, supabase, tar, undici, vite (10 high)
- **Remediation:** `npm audit fix` (most resolve via direct upgrade; some may need a peer-dep bump on next).

### 🟠 Generic JWTs and API keys in scripts
- semgrep flagged 80+ JWT tokens and 68 generic-api-key strings, mostly in:
  - `scripts/check-policies.ts`, `scripts/check-rls.ts`, `scripts/db-health-check.ts`, `scripts/debug-player-insert.mjs`, `scripts/diagnose-rls.ts` (line 3-9 in each)
  - `.claude/skills/golfhelm-creative-engine/tools/.env`
  - `docs/superpowers/plans/2026-04-21-coachhelm-fix/TEAM-E-DONE.md:51-52`
- **Remediation:** if these are real secrets, rotate and load from env. If they're sample/test JWTs, add a `# nosemgrep` pragma or move to a fixtures dir excluded from scans.

### 🟠 grype — 24 critical / 289 high
- Almost entirely Go-binary CVEs detected inside `node_modules/` (grpc, docker/cli, docker/docker, moby/buildkit, jackc/pgproto3, etc.). These ship as embedded binaries with various Node packages. Likely **not exploitable** in this Node.js codebase since the app doesn't shell out to them — but worth pinning the parent npm packages (e.g. `supabase` CLI) if you want to silence them.

### 🟡 checkov
- 1 medium finding in `/context7.json` (CKV_SECRET_6). Not in staged set; ignore for now.

## Scan coverage

| Tool | Status | Findings |
|------|--------|----------|
| gitleaks | ✅ ran | 151 (3 anthropic-api-key, 80 jwt, 68 generic-api-key) |
| semgrep | ✅ ran | 24 ERROR / 147 WARNING / 42 INFO |
| grype | ✅ ran | 24 critical / 289 high / 230 medium / 31 low |
| npm audit | ✅ ran | 1 critical / 10 high / 6 moderate |
| checkov | ✅ ran | 1 medium |
| hadolint | ✅ ran | 0 (no Dockerfiles in scope) |

## Gate decision

**ALLOW** — zero new Critical/High findings on lines added/modified in the staged diff. All flagged issues pre-date this commit.
