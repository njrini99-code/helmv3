<!-- markdownlint-disable MD013 -->
# Meridian visual language

The single art-direction reference for GolfHelm's 3D course rendering
(master plan §112–114). Every renderer constant that is a taste decision
lives in `src/lib/golf/course-geometry/visual-style.ts` and is described
here. Changing a value there bumps `styleVersion`; the visual cache key and
every capture carry it (§100–101).

## Doctrine (§4–5)

- **Layer A: canonical truth.** Positions, surfaces, elevation, hole route,
  shot evidence. Compiled by `reconstruction/*`, hash-locked, never mutated
  by rendering. A Meridian visual never moves an edge or invents a height.
- **Layer B: rendered truth.** The same facts drawn through a real camera:
  perspective Terrain and Side, orthographic Top, shadows from one world
  light, display relief 1.0 by default.
- **Layer C: illustrative decoration.** Turf variation, mowing bands,
  bunker bowls, crowns, water surface, haze. Each carries a
  `basis: 'visual_only'` or `illustrative_*` marker in its userData/schema
  and is excluded from picking, framing, and shot math.

North star (§4): a still frame should read like a well-lit late-afternoon
course photograph rendered as a clean model, with the played hole in focus
and everything else quietly supporting it. Not a satellite map, not a game.

## Camera (§9–12)

| Preset | Projection | Pitch | Yaw | FOV | Relief | Orbit target |
| --- | --- | --- | --- | --- | --- | --- |
| Top | orthographic | 90° | 0° | — | 1.0 | tactical centre |
| Terrain | perspective | 44° | 0° | 32° (28–34 allowed) | 1.0 | 45% route mid + 55% green |
| Side | perspective | 20° | 30° | 32° | 1.0 | 45% route mid + 55% green |

- Perspective fit: smallest eye distance on the axis through the target
  whose projected tactical footprint fits the HUD-safe viewport (bisection;
  deterministic). Residual off-centre becomes a shift-lens principal point.
- Zoom narrows the lens about the target (never a dolly through terrain).
- Transitions: 260 ms cubic-out; an orthographic endpoint is approached
  through a 0.5° field of view so projection never pops (§12).
- Orientation: ±70° search about the tee→green upright, maximising fitted
  footprint with a mild upright preference; the green is always the far end.
- Visibility term (§11): every perspective candidate is also scored by the
  woods that would stand between the camera and the green (weight .3) or the
  tee (weight .1). Only the ground strip `12 m / tan(pitch)` in front of the
  target toward the camera is probed against reviewed woods rings (own hole
  plus context), because a 12 m canopy farther away sits under an elevated
  sight line. Recognition wins over bounding-box size; the probe is display
  math and never feeds shot or stat calculations (`woodsOcclusion`).
  Green-label clearance and selected-shot visibility are handled by the
  HUD-safe fit and by `deriveShotCameraTarget` respectively.

## Light (§46–49)

- One world sun, direction `[.47, −.53, .706]` (elevation ≈45°, from the
  south-west of the course frame), warm white `#FFF4E2`, intensity 2.05.
- Hemisphere sky `#CFE0FF` over ground `#5C7050`, intensity 1.05 (cooler,
  slightly lower ambient so shadow sides keep shape, §48–49).
- ACES filmic tone mapping, exposure 1.02. Shadows: PCF 2048, bias −8e−5,
  normal bias .18, radius 2, fitted to the tactical bounds.

## Ground (§17–25, §53, §56)

Surface hierarchy from brightest to darkest: green → tee → fairway →
fringe/collar → surround → rough/ground → woods understory (guarded by
`visual-style.test.ts`). Context holes keep their real surface but are mixed
58% toward rough and desaturated 15%; albedo only, never alpha. The palette
(sRGB albedo, no light baked in) is `MERIDIAN_PALETTE` in `visual-style.ts`.

The ground material is one shader (`attachTurfStyle`) shared by the lit
production material and the unlit `albedo` debug view, fed by the per-vertex
visual artifact (§6):

| Layer | Frame | Scale | Amplitude | Notes |
| --- | --- | --- | --- | --- |
| Macro turf | world XY + package seed | 28 / 44 / 66 m | 2.5% | three directions; greens at 40% |
| Micro turf | world XY + package seed | 0.4 / 1.2 m | 1.2% | fades out by screen derivative before it can shimmer; greens at 55% |
| Mowing | route-local (s along route, t lateral) | 6.5 m bands, 0.16 skew | 3% | played fairway field only; weight ramps to zero over the last 3.5 m before the edge |
| Boundary lip | metres to own feature edge | 0.6 m | −5% | replaces a one-pixel colour step at every feature boundary |
| Roughness | per surface class | — | green .78 … rough .97, water .9 until V5 | MeshStandard roughness attribute |

The seed is derived from the canonical package hash, so every hole of a
course shares one turf world and nothing swims under camera motion. Noise
never exceeds 3% per layer and never encodes a real surface condition. The
lab exposes each layer as a multiplier (`?macro=0&micro=0&mowing=4…`).
- Density cue (renderer redesign §7): the micro field's amplitude scales
  by surface class (rough ×1.6, surround ×1.25, fairway/tee ×1, apron ×.8,
  fringe ×.7, green ×.55) so taller, denser grass reads rougher than mown
  turf. Amplitude only; it never encodes a real turf condition.
- Landing emphasis (fidelity §8–9): on par 4 and 5 holes the mowing band
  contrast rises by 50 % inside a route-local window (±30 m about 235 m from
  the tee, never within 70 m of the route end, 25 m blend). Illustrative
  style like the bands themselves; par 3s get none (`landingWindow`).

## Bunkers (§26–34)

The canonical mesh keeps the reviewed outline and the DEM elevation; nothing
in the source says how deep a bunker is. The visual artifact adds a
render-only bowl per bunker (`layers.bunkerBowl`, `basis: 'visual_only'`,
`depthBasis: 'visual_class'`), recorded as a `VisualBunkerProfile`:

- **Depth by size class** (§29): small < 60 m² → .30–.45 m, medium →
  .45–.70 m, large > 260 m² → .60–.90 m, chosen deterministically inside the
  range from the feature id. Context bunkers take 60% of the class depth.
- **Profile** (§28): `depth(p) = depthM × S(min(1, d(p) / bowlRadius))` with
  `S(u) = 6u⁵ − 15u⁴ + 10u³`, `d` the distance to the bunker's own boundary
  and `bowlRadius = clamp(.85 × inradius, .6, 3.5 m)`. Depth is exactly zero
  on every boundary vertex, so the bowl meets the turf without a crack; the
  profile's gradient is packed too, so display normals follow the bowl under
  one world light.
- **Sand** (§31): palette sand, roughness .82, a 0.15–0.35 m grain field at
  1.5% that fades with distance, the floor darkened up to 8% with depth; the
  compiler's rim ribbons keep their sand-edge and highlight albedo.
- **Contact** (§32): turf within 0.6 m of a rim darkens up to 22%.
- **Honesty** (§30, §33–34): a profile records `effectiveDepthM` (the deepest
  vertex actually lowered; a coarse context bunker with no interior vertex
  stays flat). `createVisualSurfaceSampler` returns elevation minus bowl depth
  and is used only to place drawn markers, badges, segments and tracks on the
  drawn sand; `terrainHeight` answers every pick, outline, framing and metric.
  A future source-supported depth would arrive as a new `depthBasis` with its
  provenance, never by editing the class table.
- Families and overhang (renderer redesign §9): a bunker under 40 m² is a
  pot, one whose centroid lies within 25 m of a green ring is greenside, the
  rest are fairway bunkers; depth scales ×1.25 / 1 / .85 and lip ×1.2 / 1.1 /
  .9 inside the class ranges. The sand within 1.6 m inside a rim that faces the
  sun darkens up to 32 % (falling to zero at the band), so the lip reads as
  casting a shadow. Nothing here changes the canonical rim or any metric.

## Vegetation (§35–41)

Trees are Layer B illustration placed only inside reviewed `woods` masks
(`three-landscape.ts`, values in `MERIDIAN_STYLE.vegetation`). Placement
centres, clearance from playing surfaces and the crown budget are unchanged
from V1; V4 changes what stands on each centre.

- **Families (§36, §40).** Seven silhouette families, each with its own
  designs, proportion range, height ratio, trunk ratio and base → lit colour:
  `broad-oak`, `maple-dome`, `tall-poplar`, `pine-spire` (any depth),
  `young-tree`, `shrub-cluster` (edge only, shrubs have no trunk) and
  `forest-body` (interior only). `pickFamily(edgeM, roll)` weights families by
  distance from the woods edge, so the edge band (24 m) reads as light young
  growth and shrubs, the interior as darker forest body. Crowns within 12 m
  of the edge lean up to 35 % toward the family's lit colour; the interior
  keeps the deep olive base. The palette runs from forest-mass olive
  `#34532F` through forest-body `#37582C` to lit young-tree `#98C34C`, all
  below fairway luminance so the playing surfaces stay the brightest greens.
- **Edge-first crowns (§38).** The crown budget (720) goes edge-first: the
  allocation ranks candidates by nearness to the played hole's surfaces, and
  the forest interior beyond the budget is carried by the mass layer rather
  than by dropped crowns.
- **Forest mass (§39).** Beyond a 16 m inset from every woods boundary, a
  13 m staggered grid places low-poly canopy lobes (`IcosahedronGeometry(1,
  1)`, radius 6.5–10 m, height 8–12 m, sunk 42 % into the ground so no
  underside shows). Lobes never stand inside or within a lobe radius of a
  non-woods feature. Budget 420 lobes, allocated nearest the hole first;
  `counts.massLobes` and the `terrainMassLobes` telemetry field report the
  live count.
- **Trunks (§37).** Every trunked crown carries a cylinder instance in one
  batched trunk mesh, following the crown LOD: 7-sided with a near crown,
  3-sided with the mid crown, hidden with the far silhouette. A perspective
  view judges every crown by its projected radius (`vegetation.lodScreenPx`:
  near at 30 CSS px, far below 6 px) from the lens the renderer hands the
  landscape; an orthographic view keeps the focus-distance bands (150 m near,
  300 m far). `crownLodBasis` reports which rule ran. `counts.trunksVisible`
  and `terrainTrunks` report what is drawn.
- **Batching (§68.2).** All crowns are one `THREE.BatchedMesh`: the eight
  authored designs contribute their near / distant / far geometries once and
  every tree is an instance pointing at the geometry for its LOD
  (`setGeometryIdAt`), so a LOD change never moves a tree or adds a draw.
  Three culls and depth-sorts the instances; the whole canopy is two draw
  calls plus two in the shadow pass. The single call needs
  `WEBGL_multi_draw` (Safari 15+, Chrome 86+); the renderer's
  `multiDrawBasis` reports `per_instance_fallback` where it is missing.
- **Asset breakup (redesign §20).** Each authored crown design also ships
  mirrored across its local X axis, and a tree takes the mirror by seed, so
  the eight designs give sixteen silhouettes. Trees ≥ 3 m inside their mask
  and clear of playing surfaces lean up to 3.5° (`vegetation.lean`), crown
  and trunk together about the ground point; the crown radius gives up the
  horizontal shift so a leaning crown still clears the mask.
- **Dead-space rhythm (redesign §3.4).** Before the crown budget is
  allocated, a seeded mask of 30 m cells clears 14 % of the pattern centres
  in any group of 40 or more, so a woods edge gets notches and an interior
  gets dips (the forest mass still stands there) instead of one uniform
  hedge. Small copses keep every centre. `counts.patternCentres` and
  `counts.rhythmCleared` report the mask; the seed is the tree identity
  seed, so the gaps are as stable as the trees.
- **Path cut and fill (redesign §12).** `contextContact` also writes a signed
  render-only ground offset (`groundLevelMm`, with its gradient in
  `groundLevelSlope`): ground within a ribbon's half width displays at the
  ribbon's own height, the canonical ground at the nearest centreline point,
  feathered to the natural surface over `cutFillBankM` and capped at
  `cutFillMaxM`. Uphill that is a cut bank, downhill a fill slope; the
  canonical vertex never moves, the ribbon stays where it was, and the bank
  shading follows the offset's gradient. `layers.contextContact.levelled`
  counts the vertices it touched.
- **Rim facing and bowl support (audit-v3).** The bunker overhang uses the
  rim's inward normal at the nearest rim point, length-weighted over five
  segments, so a wiggly source rim gives one steady facing per stretch of
  edge; the vertex-to-rim direction flipped between neighbouring vertices
  and painted shading spokes on small pots. A bowl also scales with its
  interior vertex support (`bunker.bowlSupportVertices`, profile
  `bowlSupport`): a pot triangulated as a fan from its rim stays a flat pot
  under its lip rather than a bowl the mesh cannot carry.
- **Ribbon corners.** Context ribbons round every bend sharper than about
  20° with a quadratic fillet within 2 m of the corner (`roundCorners`), so
  the strip never folds back on itself at a sharp source node; the zone
  geometry itself is untouched.
- **Ribbon breaklines (terrain compiler).** `compile-course-terrain.py
  --context` constrains every hole mesh with the reviewed ground ribbons
  (cart paths, service paths, roads at their source width): vertices sit on
  both ribbon edges and cells refine to 4 m along a ribbon within 60 m of the
  played hole. Heights are still sampled from the source raster at those
  vertices, so a breakline adds resolution where a real edge is, never
  relief. Lift lines, fences and polygon zones stay out of the mesh.
- **Identity (§41).** `canopy:<courseFrame>:<packageHash12>:<featureId>:<x>,<y>:<styleVersion>`
  and `mass:<…>` seed every family roll, proportion, colour, yaw and aspect,
  so a tree is the same tree across holes, shared context and sessions, and
  changes only when the package or the style version changes
  (`three-landscape.test.ts`).
- **Lab.** `?crowns=` and `?mass=` scale the two budgets (0 removes the
  layer); `treeFamilies` in the telemetry lists the family counts on screen.

## Water and context (§42–45, §50–55)

- **Water (§42–45).** Water stays a surface class of the one ground material
  (`SURFACE_CLASS_WATER`), so its outline is the canonical polygon and never a
  separate mesh. The artifact's `layers.water` carries
  `depthBasis: 'shoreline_distance'`: the interior darkens toward
  `water.deepColor` with distance from the drawn shoreline (14 m ramp), which
  is a tone convention and never a measured depth. A 0.75 m shoreline band
  darkens the water edge; turf within 0.6 m of a shoreline darkens 8 % in the
  compiler (`contactVertices`). Lit materials add a static ripple normal
  (1.7 m / 4.3 m, 2.5 %, filtered out at distance) and a Fresnel lift toward
  `water.skyColor` (power 3.2, up to 50 %). No animation, no planar
  reflection, roughness 0.32. `?water=` scales the sky/interior/ripple/shore
  terms in the lab.
  v9.2: the sky lift is `skyMix × (skyBase + (1 − skyBase) × Fresnel)` so a
  steep pitch keeps a base share and water never reads darker than rough in
  grayscale; water roughness .68 removes the broad sun lobe that lit the
  phone pitch too brightly; each ripple wave fades by its own pixel
  footprint (a cycle needs ~16 px) under a slow envelope, so the ripple
  never reads as corduroy at desktop scale.
- **Contact shading (§50).** No screen-space AO at the base tier. The
  landscape computes an analytic contact term per display vertex from the
  seeded crown and mass placement (`golfCanopyShade`: soft discs of
  1.15 × crown radius and 0.95 × lobe radius) and the ground shader darkens
  albedo by up to 16 %. Bunker rim/floor shading stays in the compiler (§31–32).
  GTAO/SSAO remain an optional high-tier addition (V7 quality tiers).
- **Haze (§51).** Perspective presets only: linear fog from 180 m that reaches
  28 % of `haze.color` at 900 m and never more inside the package extent.
  Top stays haze-free. `?haze=` scales it (0 removes it); `visualHaze` telemetry
  reports the active mix.
- **Background (§52).** Top keeps the map ground colour. Terrain and Side draw a
  sky dome (`meridian-sky-dome`, horizon → zenith gradient, fog-free, depth-free,
  one draw call) so the world ends in air rather than a flat green void.
  `visualSky` telemetry reports `gradient` or `ground`.
- **Context (§53).** Ground: real surfaces mixed 58 % toward rough and
  desaturated 15 % (V2). Trees: crowns and mass lobes in shared context woods
  lose 30 % saturation and 8 % light; identity and transforms do not change.
- **Cart paths and structures (§54–55).** Not drawn: the canonical package has
  no path or building features yet, and visuals never invent them. They arrive
  with the outside-world context ingestion (production player-view spec,
  2026-09-16, §13–14) as source-backed, reviewed features.
- Ground contact (renderer redesign §16): turf within 1.5 m of a building
  footprint darkens up to 10 % toward the wall, and the ground under a path
  ribbon darkens 6 % with a .8 m shoulder fade, so structures and paths sit
  on the ground. Sand, water and uncertain zones are never touched.
- Bank berm (renderer redesign §13): turf within 1.2 m of a shoreline rises
  as a rounded berm of up to 10 cm (zero on the shared shoreline vertex, so
  the water plane never cracks) and shares the render-only `lipLiftMm`
  attribute with the bunker lip. The canonical shoreline and the water level
  never move.

## Visual artifact (§6, §96–102)

`compileVisualArtifact(scene, mesh)` derives, per terrain vertex: sRGB
albedo, mowing/turf/context weights, surface class, roughness, route-local
`(s, t)`, boundary distance (cm) and the render-only bunker depth (mm, V3).
It is keyed by canonical package hash + terrain hash + style hash, carries
`basis: 'visual_only'`, and `assertVisualArtifact` refuses any artifact whose
keys disagree with the scene (`MERIDIAN_ARTIFACT_MISMATCH`). The compile is
deterministic across engines (Node and Chromium produce the same content
hash; `Math.sqrt` only, millimetre-quantised route coordinates). Cache path:
`geometry/<site>/<packageHash>/visual/<styleHash>/<hole>.visual.json`.

## Failure behaviour (§105)

| Failure | Behaviour | Where |
| --- | --- | --- |
| Visual artifact missing | compiled at runtime from the canonical inputs; `MERIDIAN_ARTIFACT_MISSING` in the canvas dataset | `buildThreeLandscape` → `artifactSource: 'runtime'` |
| Visual artifact mismatch (package, terrain, style, context or content hash) | the stale cache is refused, the hole keeps its canonical terrain visual from a runtime compile; `MERIDIAN_ARTIFACT_MISMATCH` reported, never drawn | `buildThreeLandscape` → `artifactSource: 'recompiled'`, `artifactRefusal` |
| WebGL context lost / shader failure | runtime reports `MERIDIAN_CONTEXT_LOST` / `MERIDIAN_SHADER_FAILED` and calls `onUnavailable`; the frame shows the SVG course outline with "3D view unavailable" | `three-renderer.ts`, `HoleSceneFrame` |
| Terrain missing | the honest schematic (SVG scene) renders; no terrain, no invented relief | `HoleSceneFrame` |
| Texture decode failure | not applicable today: every material is procedural (no KTX2/GLB textures); when assets arrive the flat material path is the fallback | — |

Score entry never depends on the visual layer.

## Asset pipeline (§99)

The current visual system is fully procedural (shader turf, instanced canopy
families, analytic water); there is no GLB or KTX2 asset yet, so the
optimisation chain is a decision, not a build step. When authored assets
arrive they follow: Blender/procedural source → source GLB → glTF Transform
→ gltfpack/meshopt → KTX2 → glTF Validator → content hash → cache under
`geometry/<site>/<packageHash>/visual/<styleHash>/assets/<hash>.glb`. The
content hash joins the style hash so any asset change re-keys captures the
same way a style value does. Until then, the `families` counts and
`geometryMemoryMb` telemetry are the budget line.

## Device verification (§103–104)

Mac Chromium captures prove the pipeline, not the product. Before a real
player binding the following runs on hardware (a human step; the lab URL
`/?lab=1&course=peek-n-peak-upper&hole=<n>&preset=<preset>&quality=<tier>`
exposes every state and the tier override):

- devices: current iPhone, one older supported iPhone, current Android if
  supported, the Capacitor WebView, Safari and desktop Chrome;
- measures: first open, repeated hole switch, background/resume, low
  battery, thermal after 18 holes, forced context loss, memory after
  repeated holes (the `geometryMemoryMb` / `shadowMemoryMb` / `renderTargetMb`
  dataset fields give the expected order of magnitude);
- battery flow: 50% brightness, open Terrain on every hole, pan/zoom 10 s,
  switch shot, close, repeat for 18 holes; record battery delta, thermal
  state, crashes and memory warnings.

The result belongs in the master-plan tracker rows 103–104; the lab and the
canaries cannot stand in for it.

## Canary pixel diff (§106.4)

`scripts/golf/course-geometry/diff-visual-canaries.py <before> <after>
[--out=<dir>] [--tolerance=24] [--max=0.02] [--json=<summary>]` compares two
canary labels (or two lab audit folders, or two files) capture by capture:
changed-pixel fraction, bounding box and a red-highlight image per capture.
It is a review aid; a change is acceptable only when the label note explains
it, and `--max` turns the fraction into an exit code for a gate.

## Style versions (§113)

- `meridian-v5`: perspective camera, lower sun, faceting kit (this plan V0–V1).
- `meridian-v6`: ground material system + visual artifact (V2), bunker bowls (V3), vegetation families, forest mass and trunk bands (V4).
- `meridian-v7`: static water, contact shade, haze, sky dome, context tree toning (V5); shot storytelling (V6).
- `meridian-v8`: rough hierarchy (primary/secondary/outer by distance from the nearest playing surface), classified ground zones from the context layer, slope-only darkening of non-playing ground, outer-rough macro scale. Compiler `meridian-visual-compiler-2` adds `surroundDistanceCm` and the context hash gate.
- `meridian-v9` (fidelity §39–40, same version, new hash; compiler `meridian-visual-compiler-5`, `green-complex-v2`): slope-evidenced green run-offs — within `greenComplex.runoff.reachM` of the hole's own green, rough or surround ground whose smoothed canonical normal falls away from the green (downhill · away ≥ `awayDot`) at ≥ `slopeMin` becomes a short-grass `runoff` surface class (apron tone and roughness, mowing off), full strength at `slopeFull`; flat or rising ground gets none.
- `meridian-v9`: bunker families (pot / greenside / fairway scale depth and lip), overhang shadow inside the sun-facing rim, ground contact shade beside building footprints and along path shoulders (`contextContact`). Compiler `meridian-visual-compiler-4` adds `family` to bunker profiles and the `contextContact` layer.
- `meridian-v8` (fidelity pass, same version, new hash): green complex (`greenComplex` style block: derived apron neck, green/collar edge lip, pad-setting shade), bunker lip/edge variation/floor macro, fairway edge types (`fairwayEdge`), first-cut band, water roughness .52 and calmer sun/sky fill, desaturated fairway/green. Compiler `meridian-visual-compiler-3` adds `lipLiftMm` and the `greenComplex` / `fairwayEdges` layers.

`styleHash()` hashes `MERIDIAN_STYLE` by value (`meridian-v8-<fnv>`); any
change to a value re-keys the artifact cache and appears in every capture's
`visualStyleHash`. Bump the version string when the look changes on purpose.
