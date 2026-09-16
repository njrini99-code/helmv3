# Structure GLB authoring convention

V2 plan §56-58 ("structures"), §100-103 (Blender / GLB optimization / KTX2 /
meshoptimizer); Ruling R8; Task 17.

This is the convention `src/lib/golf/course-geometry/structure-glb.ts`
validates and places against. It governs one thing: an authored Blender
model of a real Peek'n Peak building (clubhouse, other buildings,
maintenance structures — the context-layer classes that render as
`extrude` today, `context-taxonomy.ts` `CONTEXT_RENDER`), exported as a
GLB, that will eventually replace that building's footprint-extrusion
placeholder (`three-context.ts` `extrusion()`).

**Nothing here is required today.** No Peek'n Peak building has been
modeled yet — `report-structure-glb.mts` normally scans an empty folder —
and constraint 14 ("do not invent objects... just because a region feels
empty") means a structure zone with no authored, validated GLB keeps its
existing extruded-footprint placeholder. This document exists so that when
a model *is* authored, it is authored once, correctly, keyed to the right
zone, and machine-checkable rather than eyeballed.

## 1. Units and scale

glTF/GLB is always metres — there is no unit field to set. Model at true
1:1 scale (1 world unit = 1 metre, global constraint 2): a door should be
about 2 m tall, a single-story eave about 3-4 m, a clubhouse footprint on
the order of tens of metres. `structure-glb.ts` cannot detect a "wrong
unit" flag (none exists), but it does check the model's own bounds against
a generous sanity envelope (0.5 m - 120 m footprint span, 0.5 m - 60 m
height, the same 60 m ceiling `three-context.ts`'s extrusion already
clamps to) and flags anything outside it — the usual symptom of an
accidentally-centimetre- or accidentally-decametre-scaled export.

## 2. Axes, up direction and origin

- Author in Blender's own native convention: **Z up**, meaning the
  vertical axis is Z while you model. Do not fight this to "pre-convert"
  to Y-up — export normally.
- Use Blender's default glTF export setting **"+Y Up"** (checked — it is
  the default). Blender then converts the exported vertex data to glTF's
  Y-up convention for you; the exported node itself should carry **no**
  extra rotation.
- **Origin at ground contact.** The object's local origin `(0, 0, 0)` must
  sit exactly where the building meets the ground — the lowest point of
  its footprint, not its centroid and not an arbitrary corner. This is
  mechanically checked: after conversion back to the project's frame, the
  model's own lowest vertex must be within 0.2 m of `z = 0`
  (`origin_not_ground_contact`, an error). This is what lets a placement
  simply be "put the model's origin at the terrain height under the
  footprint" (`structure-glb.ts` `buildStructurePlacements`).
- **Forward axis: local +Y.** Orient the model so a viewer standing at
  `(0, −d, 0)` for some `d > 0`, looking toward `+Y`, sees the building's
  primary/entrance-facing elevation. This is this project's own convention
  (the plan does not name one) and only matters because
  `structure-glb.ts`'s placement rotates the model so local `+Y` points
  away from the footprint polygon's own centroid, perpendicular to its
  longest edge — a reasonable "faces outward from the site" default for a
  building whose real entrance orientation was never surveyed (constraint
  15: no fabricated micro-detail; this is a display default, not a claim
  about the real entrance).

Why this works out cleanly: `glb-writer.ts`'s own writer
(`Z_UP_TO_Y_UP_ROTATION`) and a Blender "+Y Up" export both end up as the
same on-disk shape — Y-up vertex data — and `structure-glb.ts`'s reader
inverts that one mapping (`gltfToProjectFrame`, exactly the algebraic
inverse of `Z_UP_TO_Y_UP_ROTATION`) regardless of which tool produced the
file.

## 3. Naming — keyed by context structure id

A file's name, minus the `.glb` extension, **must equal the context-layer
zone id** it represents (`context-layer.ts` `ContextZone.id`, e.g.
`ctx-osm-way-820004560.glb`). This is the only linkage between an authored
model and a real building: `structure-glb.ts`'s catalog is keyed by this
id, and `buildStructurePlacements` looks a zone up by exactly this string.
Find a hole's structure ids in that hole's context-layer fixture/export
(`src/test/fixtures/course-geometry/<course>-context.json`, zones whose
`class` is `clubhouse`, `building` or `maintenance`).

A `MultiPolygon` zone (rare — a building recorded as more than one
disjoint footprint under one id) still gets one file; the same model is
placed once per polygon part (mirroring `three-context.ts`'s own extrusion,
which also extrudes every part), each instance's own id suffixed
`#0`, `#1`, ….

## 4. Scene graph

- Keep it simple: typically one mesh, one node, in the file's default
  scene. `structure-glb.ts`'s reader walks the *default scene's* node
  graph (not every node in the file), so an object not reachable from
  the default scene is invisible to it.
- TRS nodes (translation/rotation/scale) or an explicit `matrix` are both
  read correctly, including non-uniform scale — but **apply scale in
  Blender before export** (Object > Apply > Scale) regardless; an
  unapplied scale is flagged (`node_scale_unapplied`, a warning) because
  it is a known source of export/import surprises across tools, even
  though this reader itself computes bounds correctly either way.
- Do not use vertex/GPU instancing extensions (`EXT_mesh_gpu_instancing`)
  — they place geometry outside any single node's own transform, which
  this pipeline's one-transform-per-structure placement model cannot
  represent (`unsupported_extension`, an error).
- Draco or meshoptimizer geometry compression is fine either way: the
  reader never decodes the binary buffer, only JSON-declared accessor
  counts and bounds, so a compressed file validates identically to an
  uncompressed one.

## 5. Materials and textures (§58)

- **Base color**, **normal** (where it earns its polygon-triangle
  budget — a flat wall rarely needs one), and a packed **ORM**
  (occlusion/roughness/metalness) texture per material, matching glTF's
  own PBR material model.
- **Few material slots** (§100): keep it to 4 or fewer per structure —
  typically wall / roof / trim / glazing. More than that is flagged
  (`material_budget`, a warning).
- At most 3 distinct textures per material in use (base color + normal +
  ORM) — more is flagged (`texture_budget`, a warning).
- A vertex-colored, textureless building (matching the current flat-shaded
  V1 aesthetic) is completely valid — these checks only fire when
  materials/textures are actually present.

## 6. Triangle budget (§57)

Recommended LOD ranges by prominence (a hard product decision this plan
leaves to a later LOD-selection task — Task 17 validates a single authored
file, not a multi-LOD set):

| LOD  | Triangles   | Use                                    |
|------|-------------|-----------------------------------------|
| LOD0 | 1,000-8,000 | close/prominent (clubhouse near a green) |
| LOD1 | 300-2,000   | mid-distance                             |
| LOD2 | 100-500     | silhouette-only, far                     |

`structure-glb.ts` checks a single authored file against the union of all
three, 100-8,000 triangles (`triangle_budget`, a warning — the plan calls
these numbers "Recommended", so a miss reports rather than blocks, the
same judgment call `v2-budgets.ts` makes for the base terrain's own LOD
ranges).

## 7. Optional optimization pipeline (§101-103)

```text
Blender
  -> GLB (export)
  -> glTF-Transform        (dedupe, prune, general cleanup)
  -> meshoptimizer/gltfpack (vertex cache/fetch optimization, LOD simplification)
  -> KTX2 (ETC1S for base color, UASTC for normal/ORM — §102)
  -> glTF Validator        (Khronos conformance)
  -> content hash
```

**These four CLI tools — `gltf-transform`, `gltfpack`, `toktx`,
`gltf-validator` — are not installed in this environment.**
`report-structure-glb.mts` probes `PATH` for each one and prints exactly
what it finds; it never assumes a tool is present and never invokes any of
them (Ruling R8). Where they *are* available (a workstation or CI image
that has installed the `@gltf-transform/cli`, `gltfpack`, `libktx`'s
`toktx`, and the Khronos `gltf-validator` npm packages), the commands are:

```sh
gltf-transform optimize source.glb optimized.glb
gltfpack -i optimized.glb -o packed.glb -si 0.5   # optional extra LOD simplification
toktx --genmipmap --t2 --encode etc1s   basecolor.ktx2 basecolor.png
toktx --genmipmap --t2 --encode uastc   normal.ktx2    normal.png
gltf-transform ktx-compress packed.glb final.glb --uastc-slots '*normal*|*occlusion*|*roughness*' --slots '*'
gltf-validator final.glb
```

Running this pipeline is optional and never a prerequisite for
`structure-glb.ts` to read, validate or place a file — it reads plain,
uncompressed GLBs exactly as well as optimized/KTX2 ones. It does flag an
uncompressed texture (`texture_compression`, a warning) as a reminder to
run this pipeline before shipping, once the tools exist here.

## 8. Validation and placement, in one sentence each

- **Validate**: `structure-glb.ts` `readStructureGlbGeometry` +
  `validateStructureGlbGeometry` check everything above that is
  mechanically checkable — origin at ground contact, plausible scale,
  §57's triangle range, §58/§100's material/texture ceilings, KTX2 use,
  and (when the zone's own footprint is supplied) whether the model's
  footprint actually agrees with the zone it is keyed to.
- **Place**: `buildStructurePlacements` turns every zone with a matching,
  *validated* (no error-level violation) catalog entry into a world-scale
  placement — position and ground-contact height from the footprint's own
  terrain samples, yaw from its longest edge — and records why every other
  structure zone was skipped (`no_authored_glb`, `glb_invalid:<rule>`,
  `no_ground_height`, …) rather than silently doing nothing or inventing a
  placeholder.

## 9. Checklist before naming a file `<zone-id>.glb`

- [ ] Metres, true 1:1 scale.
- [ ] Blender Z-up while modeling; exported with "+Y Up" (default), no
      extra node rotation.
- [ ] Origin at ground contact (the footprint's lowest point).
- [ ] Local +Y is the building's front/entrance-facing direction.
- [ ] File name is exactly the context-layer zone id + `.glb`.
- [ ] One mesh, reachable from the file's default scene; scale applied.
- [ ] ≤ 4 material slots, ≤ 3 textures/material, base color/normal/ORM only.
- [ ] Triangle count inside 100-8,000 (§57).
- [ ] Run `node_modules/.bin/tsx scripts/golf/course-geometry/report-structure-glb.mts --dir <folder>` — 0 error-level violations.
