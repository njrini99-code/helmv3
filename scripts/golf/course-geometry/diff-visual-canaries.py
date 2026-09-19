"""Pixel diff between two canary labels or two capture files (master plan §106.4).

Meridian canaries are frozen captures; a visual change must be intentional and
reviewed. This tool makes the change visible: for every capture present in both
labels it reports the fraction of pixels that moved beyond a per-channel
tolerance, the bounding box of the change, and writes a highlight image.
No mismatch is a failure by itself; the reviewer decides. `--max` turns a
mismatch fraction into an exit code for CI-style gates.

Usage:
  python3 diff-visual-canaries.py <before-dir|before.png> <after-dir|after.png> \
      [--out=<dir>] [--tolerance=24] [--max=0.02] [--json=<summary.json>]

Directories are matched by relative *.png name (canary labels, lab audits).
Exit code 0 = all diffs within --max (or no --max), 1 = a capture exceeded it,
2 = nothing to compare.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict(a[2:].split('=', 1) if '=' in a else (a[2:], 'true') for a in sys.argv[1:] if a.startswith('--'))
if len(args) != 2:
    print(__doc__); sys.exit(2)
before, after = Path(args[0]), Path(args[1])
tolerance = int(opts.get('tolerance', 24))
limit = float(opts['max']) if 'max' in opts else None
out = Path(opts['out']) if 'out' in opts else None


def pairs():
    if before.is_file():
        yield before.name, before, after
        return
    for file in sorted(before.rglob('*.png')):
        rel = file.relative_to(before)
        other = after / rel
        if other.exists() and not rel.name.startswith('diff-'):
            yield str(rel), file, other


def diff(a_path, b_path):
    a = np.asarray(Image.open(a_path).convert('RGB'), dtype=np.int16)
    b = np.asarray(Image.open(b_path).convert('RGB'), dtype=np.int16)
    if a.shape != b.shape:
        return {'sizeMismatch': [list(a.shape[:2]), list(b.shape[:2])], 'mismatch': 1.0}, None
    changed = np.abs(a - b).max(axis=2) > tolerance
    count = int(changed.sum())
    total = changed.size
    ys, xs = np.nonzero(changed)
    bbox = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if count else None
    highlight = (b // 3 + 170).astype(np.uint8)
    highlight[changed] = [230, 40, 60]
    return {'mismatch': count / total, 'changedPixels': count, 'bbox': bbox}, Image.fromarray(highlight)


results = []
worst = 0.0
for name, a_path, b_path in pairs():
    report, image = diff(a_path, b_path)
    report['capture'] = name
    if out is not None and image is not None:
        target = out / ('diff-' + name.replace('/', '-'))
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target)
        report['diffImage'] = str(target)
    results.append(report)
    worst = max(worst, report['mismatch'])
    flag = ' OVER' if limit is not None and report['mismatch'] > limit else ''
    print(f"{name}: {report['mismatch'] * 100:.2f}% changed bbox={report.get('bbox')}{flag}")
if not results:
    print('No matching captures'); sys.exit(2)
summary = {'before': str(before), 'after': str(after), 'tolerance': tolerance, 'max': limit, 'worst': worst, 'captures': results}
if 'json' in opts:
    Path(opts['json']).write_text(json.dumps(summary, indent=2) + '\n')
sys.exit(1 if limit is not None and worst > limit else 0)
