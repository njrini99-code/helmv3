#!/usr/bin/env python3
"""Emit a non-mutating course-world/One Tap readiness audit."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from factory.world_coverage import audit_catalog, render_markdown  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only Course Geometry Factory coverage audit")
    parser.add_argument("--repo-root", default=str(HERE.parents[2]))
    parser.add_argument("--catalog", default="course-geometry/catalog")
    parser.add_argument("--output", default="output/course-geometry/factory")
    parser.add_argument("--json", action="store_true", help="write JSON to stdout")
    parser.add_argument("--write-json", help="optional report path; does not change factory inputs/artifacts")
    parser.add_argument("--write-markdown", help="optional report path; does not change factory inputs/artifacts")
    args = parser.parse_args(argv)
    repo_root = os.path.abspath(args.repo_root)
    catalog = args.catalog if os.path.isabs(args.catalog) else os.path.join(repo_root, args.catalog)
    output = args.output if os.path.isabs(args.output) else os.path.join(repo_root, args.output)
    report = audit_catalog(repo_root, catalog, output)
    body = json.dumps(report, indent=2, sort_keys=True) if args.json else render_markdown(report)
    if args.write_json:
        Path(args.write_json).expanduser().resolve().write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.write_markdown:
        Path(args.write_markdown).expanduser().resolve().write_text(render_markdown(report) + "\n", encoding="utf-8")
    print(body)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
