#!/usr/bin/env python3
"""Re-verify every item in docs/audits/ISSUE_LEDGER_2026-08-19.md.

    python3 scripts/audit/verify-issue-ledger.py

Prints OPEN / OWNER / DONE per item, with the evidence it measured.

This exists because a hand-maintained backlog rots exactly the way the docs it
tracks do, and this repo was bitten by that three separate ways in one night: a
required CI context that matched nothing that posts, a gitignore rule anchored
to a directory that does not exist, and a rule file naming a check renamed
weeks earlier. Each looked correct and did nothing. An item is closed here only
when a command says so.

Exit code is always 0. This is a report, not a gate.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.chdir(ROOT)

Result = tuple[str, str]


def sh(cmd: str) -> tuple[int, str]:
    """Run a shell command, return (exit code, stripped stdout)."""
    proc = subprocess.run(
        cmd, shell=True, capture_output=True, text=True, check=False
    )
    return proc.returncode, proc.stdout.strip()


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def guard(command: str) -> int:
    """Feed a command to guard-bash.sh; 2 means blocked."""
    proc = subprocess.run(
        ["bash", ".claude/hooks/guard-bash.sh"],
        input=json.dumps({"tool_input": {"command": command}}),
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "CLAUDE_PROJECT_DIR": str(ROOT)},
    )
    return proc.returncode


CHECKS: list[tuple[str, str, object]] = []


def check(cid: str, desc: str):
    def register(fn):
        CHECKS.append((cid, desc, fn))
        return fn

    return register


# --------------------------------------------------------------------------
# OWNER-ONLY — .claude/hooks/ and settings are deliberately not agent-writable
# --------------------------------------------------------------------------
@check("O1", "guard-bash rule 3 misses `; true` exit-code masking")
def _o1() -> Result:
    forms = ("npm test; true", "npm run typecheck; true", "npm test; echo done")
    masked = [c for c in forms if guard(c) != 2]
    state = "OPEN" if masked else "DONE"
    return state, f"{len(masked)}/{len(forms)} masking forms still allowed"


@check("O2", "guard-bash rule 4 says force pushes are enabled")
def _o2() -> Result:
    _, out = sh("grep -c 'allow_force_pushes enabled' .claude/hooks/guard-bash.sh")
    n = int(out or 0)
    return ("OPEN" if n else "DONE"), f"{n} stale claim(s) in the block message"


@check("O5", "Bash(*) makes the scoped allowlist inert")
def _o5() -> Result:
    path = Path(".claude/settings.local.json")
    if not path.exists():
        return "DONE", "no settings.local.json"
    allow = (json.loads(read(str(path))).get("permissions") or {}).get("allow") or []
    state = "OPEN" if "Bash(*)" in allow else "DONE"
    return state, f"Bash(*) among {len(allow)} allow entries"


@check("O3", "credentials exposed in git history")
def _o3() -> Result:
    return "OWNER", "HEAD cleaned in 634af1eda; history needs rotation"


@check("O4", "golf history migration unapplied")
def _o4() -> Result:
    return "OWNER", "20260819200000 complete, trigger verified; apply is a decision"


@check("O6", "migration ledger orphans keep Supabase Preview red")
def _o6() -> Result:
    return "OWNER", "538 orphans; 300 need human judgement (renames)"


# --------------------------------------------------------------------------
# HIGH
# --------------------------------------------------------------------------
@check("H1", "worktrees inside the repo polluting every search")
def _h1() -> Result:
    _, inside = sh("find .claude/worktrees -maxdepth 1 -mindepth 1 2>/dev/null | wc -l")
    _, total = sh("git worktree list | wc -l")
    n = int(inside or 0)
    return ("OPEN" if n else "DONE"), f"{n} inside; {total} registered (work kept)"


@check("H2", "rules that self-declare verified: unverified")
def _h2() -> Result:
    _, out = sh("grep -h '^verified:' .claude/rules/*.md | grep -c unverified")
    _, total = sh("ls .claude/rules/*.md | wc -l")
    n = int(out or 0)
    return ("OPEN" if n else "DONE"), f"{n} of {total} rules unverified"


@check("H3", ".cursorignore hides the schema from Cursor agents")
def _h3() -> Result:
    rc, _ = sh(r"grep -qE '^(src/lib/types/database\.ts|\*\.sql)$' .cursorignore")
    return ("OPEN" if rc == 0 else "DONE"), (
        "database.ts / *.sql blocked" if rc == 0 else "both visible"
    )


@check("H4", "gitleaks blind to sbp_ Supabase tokens")
def _h4() -> Result:
    _, out = sh("grep -c 'sbp_' .gitleaks.toml")
    n = int(out or 0)
    return ("DONE" if n else "OPEN"), f"{n} sbp_ rule line(s)"


@check("H5", "stop-verify goes advisory whenever peers are running")
def _h5() -> Result:
    rc, _ = sh("grep -q 'PEERS' .claude/hooks/stop-verify.sh")
    _, peers = sh("ls /tmp/cc-socks/ 2>/dev/null | wc -l")
    return ("OPEN" if rc == 0 else "DONE"), f"advisory logic present; {peers} sockets"


# --------------------------------------------------------------------------
# MEDIUM
# --------------------------------------------------------------------------
@check("M1", ".cursor/settings.json tracked granting * and mcp_*")
def _m1() -> Result:
    rc, _ = sh("git ls-files --error-unmatch .cursor/settings.json >/dev/null 2>&1")
    return ("OPEN" if rc == 0 else "DONE"), ("tracked" if rc == 0 else "not tracked")


@check("M2", ".cursor/rules/design.mdc contradicts the design system")
def _m2() -> Result:
    if not Path(".cursor/rules/design.mdc").exists():
        return "DONE", "file absent"
    _, out = sh("grep -ciE 'flowbite|!important|google fonts' .cursor/rules/design.mdc")
    n = int(out or 0)
    return ("OPEN" if n else "DONE"), f"{n} contradicting directive line(s)"


@check("M3", "dead CodeRabbit issue-enrichment workflow")
def _m3() -> Result:
    exists = Path(".github/workflows/coderabbit-issue-enrichment.yml").exists()
    return ("OPEN" if exists else "DONE"), ("present" if exists else "deleted")


@check("M4", 'db-migration-reviewer is "MANDATORY" but unenforced')
def _m4() -> Result:
    rc, _ = sh("grep -rq 'db-migration-reviewer' .claude/rules/ .claude/hooks/ 2>/dev/null")
    return ("OPEN" if rc != 0 else "DONE"), (
        "nothing reminds agents to invoke it" if rc != 0 else "referenced by a rule"
    )


@check("M6", "always-loaded rules have no paths: scoping")
def _m6() -> Result:
    unscoped = [
        Path(p).name
        for p in (
            ".claude/rules/autonomy.md",
            ".claude/rules/code-review-tooling.md",
        )
        if "paths:" not in read(p)[:400]
    ]
    return ("OPEN" if unscoped else "DONE"), f"load every session: {unscoped}"


@check("M7", "ruff/pylint only cover tools/**/*.py")
def _m7() -> Result:
    gate = read(".github/workflows/review-gate.yml")
    covers_scripts = "scripts/**/*.py" in gate or "scripts/*.py" in gate
    _, n = sh("find scripts tools -name '*.py' 2>/dev/null | wc -l")
    return ("DONE" if covers_scripts else "OPEN"), (
        f"{n} .py files exist; gate globs only tools/"
    )


# --------------------------------------------------------------------------
# LOW
# --------------------------------------------------------------------------
@check("L2", "stale RESUME.md checkpoint")
def _l2() -> Result:
    exists = Path(".claude/RESUME.md").exists()
    return ("OPEN" if exists else "DONE"), ("present" if exists else "absent")


@check("L4", "skills have no verified: staleness convention")
def _l4() -> Result:
    _, out = sh("grep -L 'verified:' .claude/skills/*/SKILL.md 2>/dev/null | wc -l")
    _, total = sh("ls .claude/skills/*/SKILL.md 2>/dev/null | wc -l")
    n = int(out or 0)
    return ("OPEN" if n else "DONE"), f"{n} of {total} skills lack the field"


# --------------------------------------------------------------------------
# KNOWLEDGE SYSTEM
# --------------------------------------------------------------------------
@check("K1", "src/lib/recruiting routed by no registry entry")
def _k1() -> Result:
    _, out = sh("npm run knowledge:map -- --files src/lib/recruiting/stages.ts 2>/dev/null")
    try:
        payload = json.loads(out[out.index("{") :])
        n = len(payload.get("impactedFeatures", []))
    except (ValueError, json.JSONDecodeError):
        n = -1
    return ("DONE" if n > 0 else "OPEN"), f"impactedFeatures: {n}"


@check("K2", "registry entries with no feature/context doc")
def _k2() -> Result:
    text = read("memory/registry.yml")
    keys = re.findall(r"^  ([a-z0-9_]+):", text, re.MULTILINE)
    blocks = re.split(r"^  [a-z0-9_]+:", text, flags=re.MULTILINE)[1:]
    nodoc = sum(
        1
        for b in blocks
        if "memory/features/" not in b and "memory/context/" not in b
    )
    return ("OPEN" if nodoc else "DONE"), f"{nodoc} of {len(keys)} entries"


@check("K4", "baseball database doc stale with no AUTOGEN block")
def _k4() -> Result:
    path = "memory/context/baseballhelm-database.md"
    if not Path(path).exists():
        return "OPEN", "absent"
    has_block = "AUTOGEN" in read(path)
    _, when = sh(f"date -r {shlex.quote(path)} +%Y-%m-%d")
    return ("DONE" if has_block else "OPEN"), f"modified {when}; AUTOGEN: {has_block}"


@check("K5", "stale-doc-check.mjs exists but no CI job runs it")
def _k5() -> Result:
    rc, _ = sh("grep -rq 'stale-doc-check' .github/workflows/ .circleci/ 2>/dev/null")
    return ("OPEN" if rc != 0 else "DONE"), (
        "no CI job runs it" if rc != 0 else "wired into CI"
    )


@check("K7", "ui/ vs fairway/ boundary undocumented")
def _k7() -> Result:
    rule = read(".claude/rules/design-system.md")
    _, count = sh(
        "grep -rl \"from '@/components/ui/\" src --include='*.tsx' "
        "--include='*.ts' | wc -l"
    )
    # Deliberately counts rather than pattern-matches. The rule mentions
    # components/ui exactly once, as an exception for skeleton.tsx, so a
    # substring test reports "documented" for a single legacy carve-out — it
    # returned DONE twice while its own evidence line said otherwise. A real
    # boundary would name the split across products; one mention cannot.
    mentions = rule.count("components/ui")
    documented = mentions >= 2
    return ("DONE" if documented else "OPEN"), (
        f"{count} files import components/ui; rule mentions it {mentions}x "
        "(a single skeleton.tsx carve-out, not a boundary)"
    )


@check("K9", "code inside agent docs is unlinted and untyped")
def _k9() -> Result:
    _, out = sh(
        "grep -rlE \"from '@/lib/types'\" CLAUDE.md AGENTS.md "
        ".claude/rules/*.md 2>/dev/null | wc -l"
    )
    return "OPEN", f"{out} agent doc(s) carry imports no gate compiles"


@check("K10", "migration version-stamp collision across worktrees")
def _k10() -> Result:
    """Two files sharing a stamp is silent data loss, not a conflict.

    supabase_migrations.schema_migrations keys on VERSION alone. Whichever
    file applies first records the stamp; the other is treated as already
    applied and skipped, with no error.
    """
    _, listing = sh("git worktree list --porcelain | grep '^worktree ' | cut -d' ' -f2")
    seen: dict[str, list[str]] = {}
    for line in listing.split("\n"):
        wt = line.strip()
        if not wt:
            continue
        _, files = sh(
            f"ls {shlex.quote(wt)}/supabase/migrations/*.sql 2>/dev/null"
        )
        for path in files.split("\n"):
            name = Path(path).name
            if not name or "_" not in name:
                continue
            stamp = name.split("_", 1)[0]
            seen.setdefault(stamp, [])
            if name not in seen[stamp]:
                seen[stamp].append(name)
    clashes = {k: v for k, v in seen.items() if len(v) > 1}
    return ("OPEN" if clashes else "DONE"), (
        f"{len(clashes)} stamp(s) claimed by 2+ different filenames"
    )


@check("K11", ".deepsec holds 2x src/ in .ts/.tsx, invisible to git")
def _k11() -> Result:
    _, deep = sh("find .deepsec -name '*.ts' -o -name '*.tsx' 2>/dev/null | wc -l")
    _, src = sh("find src -name '*.ts' -o -name '*.tsx' | wc -l")
    n = int(deep or 0)
    ratio = n / max(int(src or 1), 1)
    return ("OPEN" if n > 0 else "DONE"), (
        f"{n} files ({ratio:.1f}x src/); gitignored so every scanner still reads them"
    )


@check("K12", "orphaned PostgREST fix uncommitted, its test encodes the bug")
def _k12() -> Result:
    _, dirty = sh("git status --porcelain src/app/api/cron/ | wc -l")
    _, asserts = sh(
        "grep -c 'toHaveBeenCalledWith(2000)' "
        "src/test/api/cron/coachhelm-insight-lifecycle-bounds.test.ts 2>/dev/null"
    )
    n = int(dirty or 0)
    stale = int(asserts or 0)
    state = "OPEN" if (n or stale) else "DONE"
    return state, f"{n} cron file(s) uncommitted; test asserts the old 2000 x{stale}"


def main() -> None:
    rows = []
    for cid, desc, fn in CHECKS:
        try:
            state, evidence = fn()
        except (OSError, ValueError, subprocess.SubprocessError) as exc:
            state, evidence = "ERROR", f"{type(exc).__name__}: {exc}"
        rows.append((cid, state, desc, evidence))

    rank = {"OPEN": 0, "OWNER": 1, "ERROR": 2, "DONE": 3}
    rows.sort(key=lambda r: (rank.get(r[1], 9), r[0]))
    width = max(len(r[2]) for r in rows)

    print(f'{"id":<5} {"state":<6} {"item":<{width}}  evidence')
    print("-" * (width + 55))
    for cid, state, desc, evidence in rows:
        print(f"{cid:<5} {state:<6} {desc:<{width}}  {evidence}")

    tally = Counter(r[1] for r in rows)
    print()
    print("  " + "  |  ".join(f"{k}: {v}" for k, v in sorted(tally.items())))


if __name__ == "__main__":
    main()
