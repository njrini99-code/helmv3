# Course factory world coverage audit

`audit-course-world-coverage.py` is a read-only, catalog-wide report for the
factory’s operational coverage. It joins the independent evidence that a
course-factory build already retains:

- catalog route and scorecard prerequisites;
- per-hole GLB presence and Blender round-trip validation;
- per-hole source-truth gate evidence;
- per-hole One Tap geometry capabilities; and
- facility-only visual fallback contracts.

Run it against the current workspace without changing factory state:

```sh
python3 scripts/golf/course-geometry/audit-course-world-coverage.py \
  --json \
  --write-json /tmp/course-world-coverage.json \
  --write-markdown /tmp/course-world-coverage.md
```

The report distinguishes `full_hole_visual_candidate` from
`full_hole_physical_candidate`, and `facility_visual_only` from a playable
hole world. A GLB, preview, or facility visual fallback never makes a layout
One Tap geometry eligible or measurement eligible. Those require every expected
hole’s independently recorded capability decision. Physical admission requires
every expected hole’s source-truth gate to pass.
