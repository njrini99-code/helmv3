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

Compile metric truth before creating a visual asset:

```sh
python3 scripts/golf/course-geometry/compile-physical-world.py \
  output/course-geometry/cardinal-spike-v1/normalized.json \
  output/course-geometry/cardinal-spike-v1/physical/world.json
```

`golfhelm-physical-world-v1` preserves the metric terrain field and every
semantic boundary, while attaching explicit claims each source supports. With
the current inputs, a bunker is a source-backed footprint rather than a
measured cavity, and a green is macro-terrain context rather than a
survey-grade putting surface. The compiler refuses to turn either limitation
into a depth, lip, break, or pin claim. Blender can read either the canonical
study or this physical world; new visual compilation should use the latter.
Every surface carries one of four truth classes: `measured`, `derived`,
`estimated`, or `visual_only`. All four can render. Only measured or derived
geometry with recorded boundary uncertainty and human review may drive
authoritative physical measurements; a renderer may add a smooth green mesh,
grass, or a conservative procedural bunker bowl for the other classes, but
those visual additions must never become course truth.

Run the source truth gate before considering a hole playable:

```sh
python3 scripts/golf/course-geometry/course-truth-gate.py \
  output/course-geometry/cardinal-spike-v1/normalized.json \
  output/course-geometry/cardinal-spike-v1/validation/course-truth.json \
  output/course-geometry/cardinal-spike-v1/validation/course-truth.md
```

It requires reviewed measured/derived tee, fairway, green, bunker, water, and
tee-to-green distance geometry. A failure blocks authoritative publication but
does not block a clearly non-authoritative visual review render.
Use `--require-pass` in a publishing/build job so a failed report exits
nonzero after persisting its evidence.

Compile and validate locally with the free Blender toolchain:

```sh
blender --background --python scripts/golf/course-geometry/blender/generate_hole.py -- \
  output/course-geometry/cardinal-spike-v1/physical/world.json \
  output/course-geometry/cardinal-lidar-native-v1/elevation.tiff \
  output/course-geometry/cardinal-spike-v1/rendering/cardinal-green-study.glb \
  output/course-geometry/cardinal-spike-v1/validation/blender-export.json \
  output/course-geometry/cardinal-spike-v1/rendering/cardinal-green-study-preview.png

blender --background --python scripts/golf/course-geometry/blender/validate_glb.py -- \
  output/course-geometry/cardinal-spike-v1/physical/world.json \
  output/course-geometry/cardinal-spike-v1/rendering/cardinal-green-study.glb \
  output/course-geometry/cardinal-spike-v1/validation/glb-roundtrip.json
```

`validate_glb.py` imports the GLB and fails if the terrain span differs from
canonical metres by more than 0.02m, catching unit scaling or axis changes.
This spike creates source-backed terrain plus the available green/bunker
surfaces only. Tree assets, fairways, tees, water, route ownership, visual
review edits, CDN storage, and app exposure wait for reviewed, licensed
full-hole geometry.

During compilation, every source polygon is tessellated and resampled from the
same terrain mesh at four-metre-or-finer horizontal edges. That prevents a
large planar fairway or green triangle from cutting through real terrain in a
static review render. Tee surfaces have their own material role. The bundled
camera is only an authored review default with an explicit far clip; it is not
the runtime interaction controller.
