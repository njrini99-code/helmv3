#!/usr/bin/env python3
"""Check design-refresh/MANIFEST.md against the files on disk.
Run from the repo root: python3 design-refresh/tools/verify_manifest.py
Exit 0 when every listed file exists with the listed size and SHA-256 and no unlisted file exists."""
import os, re, sys, hashlib

root = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
man = open(os.path.join(root, 'MANIFEST.md'), encoding='utf-8').read()
listed = {}
for m in re.finditer(r'^\| `([^`]+)` \| (\d+) \| `([0-9a-f]{64})` \|$', man, re.M):
    listed[m.group(1)] = (int(m.group(2)), m.group(3))
on_disk = set()
for d, dirs, files in os.walk(root):
    for f in files:
        rel = os.path.relpath(os.path.join(d, f), root).replace(os.sep, '/')
        if rel != 'MANIFEST.md':
            on_disk.add(rel)
problems = []
for rel, (size, digest) in sorted(listed.items()):
    p = os.path.join(root, rel)
    if not os.path.exists(p):
        problems.append(f'missing: {rel}')
        continue
    if os.path.getsize(p) != size:
        problems.append(f'size differs: {rel}')
        continue
    h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    if h != digest:
        problems.append(f'content differs: {rel}')
for rel in sorted(on_disk - set(listed)):
    problems.append(f'not in manifest: {rel}')
if problems:
    print('\n'.join(problems))
    print(f'FAIL: {len(problems)} problem(s); {len(listed)} files listed')
    sys.exit(1)
print(f'OK: all {len(listed)} files match MANIFEST.md')
