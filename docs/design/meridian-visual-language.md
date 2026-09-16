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
  south-west of the course frame), warm white, intensity 2.0.
- Hemisphere sky `#DDEBFF` over ground `#5C7050`, intensity 1.2.
- ACES filmic tone mapping, exposure 1.02. Shadows: PCF 2048, bias −8e−5,
  normal bias .18, radius 2, fitted to the tactical bounds.

## Ground (§17–25, §56)

Surface hierarchy from most to least saturated: green → tee → fairway →
fringe/collar → surround → rough/ground → woods understory. Context holes
are dimmed toward rough. Palette (sRGB albedo, no light baked in) is in
`DEFAULT_THREE_LANDSCAPE_PALETTE`.

Variation rules: macro turf variation 25–70 m at 2–4% luminance; micro
0.25–1.5 m at ≤1.5%; mowing bands 5–8 m at 1.5–2.5% along the route
bearing; all seeded from package hash + style version, all in world-space
XY so nothing swims under camera motion. Noise never appears on greens at
Top, never exceeds 4%, and never encodes a real surface condition.

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

## Style versions (§113)

- `meridian-v5`: perspective camera, lower sun, faceting kit (this plan V0–V1).
- `meridian-v6`: ground material system + bunker bowls (V2–V3).
- `meridian-v7`: vegetation families, water, context, shot storytelling (V4–V6).

Any change to a value in `visual-style.ts` bumps the version; captures and
cache keys carry it.
