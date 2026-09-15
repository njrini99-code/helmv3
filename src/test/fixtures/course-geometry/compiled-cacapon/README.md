# Cacapon compiled terrain candidates

These 18 local artifacts extend the unchanged Cacapon geometry package with
rectangular terrain context, actual neighboring source features, and an independent
2m terrain query grid. They are **source candidates**, not published or independently
accepted course geometry.

Rebuild from the immutable source cache:

```sh
python3 scripts/golf/course-geometry/compile-course-terrain.py --holes all
python3 scripts/golf/course-geometry/test_compile_course_terrain.py
```

Each `cacapon-NN-terrain.json.gz` has a content hash and paired report. Gzip is
deterministic (`mtime=0`); the expanded JSON files are ignored working caches.
`asset-manifest.json` records filenames, compressed/uncompressed lengths and
SHA256 hashes, plus each canonical scene hash. Check both size and hash when
loading, and enforce a bounded decompression limit.

The aggregate
`compilation-report.json` records provenance, topology/display-boundary checks,
metric support, source-derived normal consistency, slopes, clipping, budgets, and
compressed size for every hole. Source bytes and their SHA256 hashes live in
`../sources/cacapon-course-terrain/`.

The terrain comes from one native-1m USGS tile acquired December 4–21, 2021.
The metric grid uses local East/North coordinates in meters and NAVD88 heights.
Grid rows increase northward. A runtime bilinear query requires all four support
samples; unsupported values remain null. Camera tilt, mesh LOD, material splits,
and visual vertical exaggeration cannot modify metric heights.

Render cells are 4m across the played hole, 2m near mapped source green/bunker/tee
shapes, and 16–32m in surrounding context. Green/bunker material bands lie inside
their footprints. The separate outward fairway surround is at most 0.6m and the
green collar at most 0.45m; both are illustrative styling, not mapped rough/fringe.
Actual polygons retain their multipart and hole topology. Neighbor shapes are
renderer-only context and do not change played-hole feature associations.

The original 20,000-triangle envelope was explicitly reviewed and raised to 40,000
for this expanded context rather than simplifying real boundaries. Current meshes
contain 14,179–32,050 triangles. The full course totals approximately 16.5MB gzip;
load individual hole assets as needed, not all 18 through a player entry bundle.

Known limits remain explicit: hole10 has no tee polygon; other tee regions are
approximate references with unknown daily markers. Only hole7 has the existing
reviewed canopy evidence; no extra tree areas, cart paths, cup positions, or rough
classification are synthesized. Source registration, vertical accuracy, renovation
agreement, and currentness remain unverified. Macro terrain does not establish
putting breaks or measured bunker-lip accuracy.

[USGS source products and use](https://www.usgs.gov/3d-elevation-program/about-3dep-products-services).
Physical course geometry remains attributed to © OpenStreetMap contributors,
ODbL 1.0, with package source lineage retained.
