# Real-course source-study spike

This is an offline, bounded one-study pipeline. Geographic source data remains
the authority, the canonical local-metre JSON is the compiler input, and the
GLB is a replaceable static rendering product. Player shots, balls, cups,
labels, replay, and analytics are never written into the GLB.

## Cardinal green-complex study

The current Cardinal package is explicitly `source_candidate_partial`. It is
an OSM green/bunker complex with LiDAR terrain, not Cardinal Hole 1 and not a
playable course binding. It has no reviewed tee, fairway, route, pin, observed
ball coordinate, or historical shot coordinate. Do not serve its output from
the product or attach it to a round.

Acquire inputs into ignored local output:

```sh
python3 scripts/golf/course-geometry/fetch-nc-ortho-study.py \
  src/test/fixtures/course-geometry/cardinal-study.json cardinal-green-study \
  output/course-geometry/cardinal-ortho-native-v1

python3 scripts/golf/course-geometry/fetch-nc-lidar-study.py \
  src/test/fixtures/course-geometry/cardinal-study.json cardinal-green-study \
  output/course-geometry/cardinal-lidar-native-v1
```

The orthophoto tool requests native 0.5 US-survey-foot cells (about 0.1524m)
from NC OneMap with nearest-neighbour export and records exact bounds, pixel
dimensions, bands, selected source and hashes. It tries the four-band analysis
service first. A transparent raster fails the quality gate; the three-band
visual fallback is labelled `visual_rgb_only`, never NIR or analysis data.
Its PNG has no embedded CRS, so the immutable manifest/export metadata supplies
its source CRS and affine extent. Do not call it a GeoTIFF.

Normalize the source study into GolfHelm's invariant local frame:

```sh
python3 scripts/golf/course-geometry/normalize-study.py \
  src/test/fixtures/course-geometry/cardinal-study.json cardinal-green-study \
  output/course-geometry/cardinal-lidar-native-v1 \
  output/course-geometry/cardinal-ortho-native-v1 \
  output/course-geometry/cardinal-spike-v1/normalized.json
```

The result has `x=east`, `y=elevation up`, `z=north`; one world unit is one
metre. It retains source WGS84 geometries alongside derived positions and
rejects missing LiDAR samples rather than filling them.

Compile and validate locally with the free Blender toolchain:

```sh
blender --background --python scripts/golf/course-geometry/blender/generate_hole.py -- \
  output/course-geometry/cardinal-spike-v1/normalized.json \
  output/course-geometry/cardinal-lidar-native-v1/elevation.tiff \
  output/course-geometry/cardinal-spike-v1/rendering/cardinal-green-study.glb \
  output/course-geometry/cardinal-spike-v1/validation/blender-export.json \
  output/course-geometry/cardinal-spike-v1/rendering/cardinal-green-study-preview.png

blender --background --python scripts/golf/course-geometry/blender/validate_glb.py -- \
  output/course-geometry/cardinal-spike-v1/normalized.json \
  output/course-geometry/cardinal-spike-v1/rendering/cardinal-green-study.glb \
  output/course-geometry/cardinal-spike-v1/validation/glb-roundtrip.json
```

`validate_glb.py` imports the GLB and fails if the terrain span differs from
canonical metres by more than 0.02m, catching unit scaling or axis changes.
This spike creates source-backed terrain plus the available green/bunker
surfaces only. Tree assets, fairways, tees, water, route ownership, visual
review edits, CDN storage, and app exposure wait for reviewed, licensed
full-hole geometry.
