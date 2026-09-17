<!-- markdownlint-disable MD013 -->
# GolfHelm Course Truth Gate

Status: **FAIL**

## peek-n-peak-upper-07 — FAIL

| Feature | Source | Resolution | Truth class | Confidence | Review | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| tee | osm-overpass-2026-09-15 | — | derived | not_physical | review_required | horizontal boundary uncertainty is not recorded; not human reviewed |
| fairway | osm-overpass-2026-09-15 | — | derived | not_physical | review_required | horizontal boundary uncertainty is not recorded; not human reviewed |
| green | osm-overpass-2026-09-15 | — | derived | not_physical | review_required | horizontal boundary uncertainty is not recorded; not human reviewed |
| bunker | osm-overpass-2026-09-15 | — | derived | not_physical | review_required | horizontal boundary uncertainty is not recorded; not human reviewed; Bunker boundary may be authoritative after review; depth/lip/face analytics remain disabled until a source-backed surface is supplied. |
| water | none | — | visual_only | missing | missing | no source feature supplied |
| hole-distance geometry | scorecard only or absent | — | visual_only | not_physical | missing | no source-backed tee-to-green route or endpoint pair supplied |

A failing source truth gate blocks authoritative physical-world publication and analytics. It does not prohibit visual rendering; estimated and visual-only render geometry must remain non-authoritative.
