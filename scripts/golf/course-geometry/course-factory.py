#!/usr/bin/env python3
"""Course Geometry Factory v2 — `doctor | plan | run | status | why | invalidate`.

    python3 scripts/golf/course-geometry/course-factory.py plan --layout cacapon
    python3 scripts/golf/course-geometry/course-factory.py why --layout peek-n-peak-upper --task hole.terrain.compile --hole 7

See scripts/golf/course-geometry/README.md ("Course factory") and
docs/plans/2026-09-19-course-geometry-factory-v2-next.md §5.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from factory.cli import main  # noqa: E402

if __name__ == '__main__':
    sys.exit(main())
