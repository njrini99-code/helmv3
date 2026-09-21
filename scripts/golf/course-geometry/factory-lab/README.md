# Immutable factory lab

This local-only viewer loads factory outputs by explicit layout, bundle hash,
and physical hole key. It never reads the fixture course registry, guesses a
course, publishes assets, or admits measurement capabilities.

From the repository root:

```sh
python3 scripts/golf/course-geometry/course-factory.py \
  review-bundle --layout winchester-cc

node_modules/.bin/vite --config scripts/golf/course-geometry/factory-lab.config.ts
```

Open the exact URL printed by the exporter (localhost port 8774). The bundle
contains all retained holes for the selected layout.
It retains content-addressed package, context, terrain and available GLB bytes
under `output/course-geometry/factory/lab`. Rebuilding mutable factory outputs
does not alter the bundle. Re-exporting unchanged inputs creates no duplicates.
To use another factory root, set `GOLFHELM_FACTORY_OUTPUT_ROOT` to its real path
before starting Vite. The root and asset ancestors must not be symlinks.

The viewer shows the production terrain renderer and offers the retained GLB
for download. It displays exact package, terrain, GLB and admission hashes in
its evidence panel. A missing capability report is explicitly **unassessed**.
The lab cannot grant physical measurement authority, even for a retained report.

This is the preferred factory course-review path: one explicit layout per
command, all its retained holes, and no fixture or registry edits. Use the
factory's global `--output` option before `review-bundle` to select another
output root; start the lab with the same root.

With the loopback lab running, export and capture sequentially, one WebGL
context at a time:

```sh
python3 scripts/golf/course-geometry/course-factory.py \
  review-bundle --layout winchester-cc --capture
```

The command verifies that the existing server serves the exact bundle, then
saves captures under the configured factory output root at
`lab/captures/<layout>/<bundle-hash>/`. A missing server, hash mismatch or
capture failure returns a failing exit code. It never starts another server.
This local review does not fulfill the separate legacy player/canary sign-off
matrix and never changes physical admission or release eligibility.

To recapture a previously exported immutable bundle explicitly:

```sh
node scripts/golf/course-geometry/capture-factory-bundle.cjs \
  --layout=winchester-cc --bundle=<full-64-character-hash>
```

The capture report identifies every package and mesh drawn and records render
counters. A static first frame is not an interaction FPS benchmark. Device
field tests, physical approval, and release admission remain separate.

Integrity checks reject unknown layouts/holes, altered manifests/objects,
traversal, symlink escapes, oversized files and foreign objects. The server
binds loopback, refuses cross-origin artifact access and non-read methods,
and cannot be built or preview-published. Next.js does not import this lab.
