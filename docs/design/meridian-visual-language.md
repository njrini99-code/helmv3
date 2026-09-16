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

## Bunkers (§26–34)

Render-only bowl: smoothstep depth from the boundary inward, zero at the
boundary, `visualDepthM` by size class (small .30–.45, medium .45–.70,
large .60–.90 m), sand material with contact darkening. The visual sampler
`visualSurfaceHeight` exists only to place markers on the drawn sand;
`terrainHeight` remains the canonical elevation everywhere else.

## Vegetation (§35–41)

Seven silhouette families; trunks only within the near band; forest mass
beyond the edge-first crown budget; palette from deep forest olive at the
mass to cooler green at the lit edge; seed = package hash + feature id +
instance id + style version.

## Water and context (§42–45, §51–55)

Static Fresnel water with a 0–0.75 m shoreline band; atmospheric haze by
depth in perspective presets; a sky/horizon gradient behind Terrain and
Side; cart paths and simple structures as quiet context.

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

## Style versions (§113)

- `meridian-v5`: perspective camera, lower sun, faceting kit (this plan V0–V1).
- `meridian-v6`: ground material system + visual artifact (V2); bunker bowls (V3).
- `meridian-v7`: vegetation families, water, context, shot storytelling (V4–V6).

`styleHash()` hashes `MERIDIAN_STYLE` by value (`meridian-v6-<fnv>`); any
change to a value re-keys the artifact cache and appears in every capture's
`visualStyleHash`. Bump the version string when the look changes on purpose.
