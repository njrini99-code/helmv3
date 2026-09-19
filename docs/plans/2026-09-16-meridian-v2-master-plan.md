<!-- markdownlint-disable MD013 -->
# Meridian V2 — Ultra-High-Fidelity 3D Course Rendering Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Date: 2026-09-16
Pilot course: Peek’n Peak Resort — Upper Course
Repository: njrini99-code/helmv3
Baseline branch: agent/golf-course-geometry
Goal: Turn Meridian into a premium, high-fidelity 3D architectural representation of the actual Peek’n Peak Upper Course — with course-specific terrain form, sculpted green complexes, physically convincing bunkers, layered turf, believable forest structure, grounded paths/structures, and camera-aware detail allocation — without compromising canonical geometry, mobile performance, or product readability.

Architecture: Preserve the existing canonical course model as immutable truth. Compile a separate, hash-locked display world composed of multi-resolution base terrain, local hero meshes, high-resolution field atlases, deterministic instanced/batched assets, and a compact semantic ground shader. Use real geometry only where physical silhouette/form matters, and use source-derived shading fields where extra triangles would add little value. Keep the current Three.js/WebGL2 renderer, event-driven rendering model, capability tiers, and visual-artifact hash gate.

Tech Stack: TypeScript, Three.js/WebGL2, current Meridian visual compiler, USGS/terrain source pipeline, QGIS/GDAL/PROJ, optional raw LiDAR/PDAL processing where actually available, Blender, glTF/GLB, glTF Transform, meshoptimizer/gltfpack, KTX2/Basis Universal, Khronos glTF Validator, Spector.js, Playwright/browser capture tooling.

Supersedes: Peek_n_Peak_Meridian_High_Fidelity_3D_Rendering_Master_Plan_2026-09-16.md

Execution tracker: `docs/plans/2026-09-16-meridian-v2-status.md`.

────────

## Global constraints

1. Canonical truth stays authoritative.
2. 1 world unit = 1 meter.
3. Canonical XY boundaries never move to improve appearance.
4. Canonical terrain Z never receives decorative displacement.
5. Any render-only height offset must live behind visualSurfaceHeight() or an equivalent display-only contract.
6. Rendering data never feeds shot distance, lie truth, GPS resolution, canonical picking, or analytics.
7. Top view remains orthographic and metrically readable.
8. Production Terrain / Approach / Green views remain true perspective.
9. No Google Maps dependency.
10. No migration to Unity, Unreal, React Three Fiber, or a second production renderer.
11. No WebGPU migration in this phase.
12. No continuous animation loop while the world is idle.
13. All variation is deterministic from package/style hashes.
14. Do not invent objects or landcover just because a region feels empty.
15. Do not fabricate micro-topography unsupported by the source.
16. Dense display triangulation may interpolate source terrain more smoothly; it must never be described as additional measured terrain detail unless a higher-resolution source actually exists.
17. Green/bunker/fairway/path/water boundaries always outrank decorative detail.
18. Mobile GPU budgets are first-class product requirements.
19. One material system should carry most ground surfaces to avoid draw-call/material explosion.
20. Every premium effect must either improve course identity, physical form, or golf readability.
21. Every expensive effect needs a measurable fallback.
22. Production artifacts should be precompiled whenever possible; runtime compilation is a fallback/lab path.
23. The result remains stylized Meridian — not photoreal texture soup.
24. The final scene must be recognizable as Peek’n Peak, not merely recognizable as “a golf course.”

────────

## Part I — The new fidelity target

### 1. V2 definition

V1 aimed for:

> accurate course geometry + premium stylized 3D.

V2 should aim for:

> **course-specific architectural realism with perceptually allocated detail.**

The course should have three qualities simultaneously:

```text
TRUTH
the physical layout is credible

FORM
the land feels sculpted and dimensional

CRAFT
surfaces, shadows, vegetation and transitions feel authored
```

The result should withstand:

• full-hole Terrain view,
• close approach view,
• green-complex view,
• selected-shot review,
• screenshots without UI.

If the UI is removed, the course should still look premium.

### 2. Why simply adding more polygons is not enough

The current renderer already has:

• perspective production cameras,
• source-derived terrain normals,
• DEM slope textures,
• relative sky occlusion/exposure,
• rough hierarchy,
• fairway edge logic,
• green-complex logic,
• bunker depth/lip profiles,
• water treatment,
• authored vegetation families,
• vegetation LOD,
• context classes,
• quality tiers,
• GPU timing,
• draw-call budgets,
• hash-locked visual artifacts.

The next limit is information placement.

A uniform 100,000-triangle hole can still look worse than a 50,000-triangle hole that spends geometry correctly.

The new hierarchy is:

```text
GREEN COMPLEX
    >
BUNKER RIMS / BOWLS
    >
APPROACH / FAIRWAY EDGE
    >
CART PATH / WATER EDGE
    >
STRATEGIC FOREST EDGE
    >
GENERAL TERRAIN
    >
FAR CONTEXT
```

### 3. The three fidelity channels

Every visual improvement belongs in one of three channels.

3.1 Geometry fidelity

Use when silhouette or physical form changes.

Examples:

• bunker bowl,
• bunker lip,
• green edge,
• cart-path shoulder,
• retaining wall,
• bridge,
• structure roof,
• near tree trunk/branch.

3.2 Shading-field fidelity

Use when the physical surface already exists but needs richer light/material response.

Examples:

• curvature,
• sky visibility,
• bent normal,
• static shadow,
• roughness,
• mowing direction,
• SDF edge treatment,
• subtle wetness/native variation.

3.3 Object fidelity

Use when the real world contains discrete visible things.

Examples:

• trees,
• buildings,
• path structures,
• bridges,
• fences where meaningful.

This separation prevents the project from wasting polygons on effects that belong in shading.

────────

## Part II — Meridian V2 world architecture

### 4. Six-layer render world

Layer 1 — canonical truth

Immutable:

```text
reviewed surface polygons
source terrain
course routes
context geometry
source metadata
uncertainty
```

Used by golf logic.

Layer 2 — base display terrain

A faithful triangulated terrain representation.

Purpose:

• cover the entire visible hole/context,
• maintain source shape,
• provide a low-cost base.

Contains LOD0/1/2.

Layer 3 — hero patches

Local, higher-density, non-overlapping display meshes for areas where physical detail matters.

Hero patch types:

```text
green_complex
bunker
path_intersection
water_edge
landing_edge
structure_pad
```

The base terrain underneath may be excluded/stitched to avoid z-fighting.

Layer 4 — field atlas

Source-derived and visual-only scalar/vector fields sampled per fragment.

Contains:

• source slope,
• multi-scale curvature,
• sky visibility,
• bent normal,
• exposure,
• semantic boundary SDF,
• static shadow,
• material variation,
• context class.

This layer is a major V2 upgrade.

Layer 5 — static objects

Instanced/batched:

• vegetation,
• forest mass,
• structures,
• bridges,
• small context assets.

Layer 6 — presentation layer

• camera,
• atmosphere,
• shot markers,
• live player/ball,
• illustrative shot paths,
• UI-safe composition.

### 5. Why hero patches are better than one huge terrain mesh

A green complex might occupy only 5–10% of the visible land but deserves 30–50% of the local terrain detail.

Instead of:

```text
whole hole at 0.5 m triangles
```

use:

```text
whole hole base
+
dense green patch
+
dense bunker patches
+
selective path / water patches
```

Benefits:

• substantially higher visible quality,
• lower total triangle count,
• less memory,
• simpler mobile LOD,
• easier debug,
• independent fidelity control.

────────

## Part III — Source pyramid and true detail

### 6. Source pyramid

Create an explicit source hierarchy.

```text
LEVEL S0
canonical source terrain used by metrics

LEVEL S1
same source resampled for display

LEVEL S2
higher-resolution source-derived terrain where actually available

LEVEL V
visual-only shading fields / offsets
```

Never confuse S2 with V.

### 7. Current 1 m terrain source

If the authoritative source is approximately 1 m raster terrain:

• retain it as physical ground truth,
• interpolate it smoothly for display,
• compute slopes/curvature from it,
• densify local meshes for smoother interpolation and boundaries.

Densification does not create new measured landform.

Document:

```text
sourceResolutionM = 1.0
displayVertexSpacingM = 0.25
basis = interpolated_source
```

That distinction matters.

### 8. Optional raw LiDAR enhancement

Where raw source point clouds are available and licensed:

use them to build a higher-resolution source-backed display terrain in hero zones.

Possible workflow:

```text
LAZ
↓
PDAL classify / filter
↓
ground points
↓
local TIN / raster
↓
registration QA
↓
hero patch terrain
```

Potential target:

```text
0.25–0.5 m hero-surface samples
```

only if:

• point density supports it,
• vertical registration checks pass,
• source date/provenance is recorded.

Do not create a 0.25 m grid from a 1 m raster and call it 0.25 m truth.

### 9. Source registration gate

Before higher-resolution terrain enters production:

measure:

```text
horizontal alignment residual
vertical bias
surface continuity against canonical base
coverage gaps
```

At patch edge:

Δz_edge = z_hero − z_base

Require a bounded seam.

If there is a constant vertical datum/bias issue, fix source registration upstream rather than hiding it with a visual blend.

────────

## Part IV — Adaptive terrain and hero geometry

### 10. Base LOD targets

Starting budgets.

LOD2 — distant / matrix

```text
15k–25k triangles
```

LOD1 — standard Terrain

```text
25k–45k triangles
```

LOD0 — close player view

```text
35k–60k base triangles
```

Hero patches are counted separately.

### 11. Hero patch triangle budgets

Typical upper targets for standard tier:

```text
green complex total     8k–20k
all bunker patches      3k–12k
path/water hero edges   1k–5k
near structure pads     0.5k–2k
```

A close Green frame may therefore reach:

```text
~55k–90k visible terrain triangles
```

while the rest of the hole stays cheaper.

### 12. Screen-space error

For world geometric error e_w, focal length f_px, depth z:

e_px ≈ f_px · e_w / z

Target display error:

```text
green / bunker edge    <= 0.5 px
approach               <= 0.75 px
main fairway           <= 1.0 px
near context           <= 1.5 px
far context            <= 2–3 px
```

LOD is selected by projected error, not arbitrary distance.

### 13. Refinement importance

For candidate triangle T:

R(T) = w_h·E_h + w_n·E_n + w_c·E_c + w_b·B + w_s·S + w_v·V

Where:

• E_h: height interpolation error,
• E_n: normal angular error,
• E_c: curvature variation,
• B: semantic boundary proximity,
• S: strategic surface weight,
• V: view/camera importance.

Example relative weights:

```text
green boundary            5.0
bunker rim                5.0
fringe/apron boundary     4.0
green terrain form        3.5
landing fairway edge      2.5
path/water edge           2.5
terrain curvature         2.0
general fairway           1.5
outer context             0.5
```

### 14. Constrained boundaries

The display triangulation must treat important boundaries as constraints.

Lock:

• green,
• fringe,
• apron where real,
• bunker,
• water,
• critical fairway edges,
• cart paths,
• structure footprints.

If simplification is used, boundary vertices are either:

• locked,
• priority preserved,
• simplified only along the boundary within explicit Hausdorff tolerance.

### 15. Hausdorff boundary gate

For canonical boundary C and display boundary D:

H(C,D) = max( sup_{c∈C} inf_{d∈D} |c−d|, sup_{d∈D} inf_{c∈C} |d−c| )

Suggested display tolerances:

```text
green / bunker        <= 0.10–0.20 m
fringe/apron          <= 0.20–0.30 m
fairway close view    <= 0.30–0.50 m
outer context         <= 1.0 m
```

These are display approximation tolerances, not source accuracy claims.

────────

## Part V — V2 field atlas

### 16. Why a field atlas is the biggest V2 upgrade

Triangles should define shape.

A high-resolution field atlas should define local visual response.

This provides:

• higher apparent detail,
• stable material transitions,
• better landform readability,
• low draw-call cost,
• less vertex bloat.

### 17. Atlas architecture

Use two levels.

Whole-hole field

Typical:

```text
512 × 512
```

covers the hole/context.

Provides approximately 0.5–1.5 m/texel depending on bounds.

Hero field

Typical:

```text
512 × 512
```

covers green complex or current focal patch.

If hero bounds are 100 m:

```text
~0.195 m/texel
```

This is excellent for SDF/material transitions even if physical terrain remains coarser.

### 18. Proposed packed fields

Avoid too many texture samplers.

Relief texture — RGBA16F

```text
R = dz/dx
G = dz/dy
B = normalized curvature / landform
A = sky visibility / occlusion
```

Bent-light texture — RGBA8 or RG16F

```text
R,G = octahedral bent-normal XY
B   = exposure
A   = static shadow
```

Semantic texture — RGBA8

```text
R = surface class
G = nearest important boundary class
B = normalized boundary distance
A = context/material mask
```

Optional hero SDF texture — RG16F / R16F layers

Contains high-resolution distances for:

```text
green edge
bunker edge
fairway edge
path/water edge
```

Do not allocate every field to every hole when unused.

### 19. DataArrayTexture option

Three.js DataArrayTexture can pack multiple 2D field layers into one texture-array object under WebGL2.

Possible layers:

```text
0 green SDF
1 bunker SDF
2 fairway SDF
3 path SDF
4 water SDF
```

Advantages:

• one texture object,
• consistent coordinates,
• specific layers can be updated.

But do not use array textures if a simpler RGBA packing satisfies the shader.

Sampler simplicity wins.

### 20. Field memory example

512×512:

```text
RGBA16F  = ~2 MB base level
RGBA8    = ~1 MB base level
R16F     = ~0.5 MB base level
```

Approximate and driver-dependent.

A practical standard-tier target:

```text
whole-hole field set     <= ~4 MB
active hero field set    <= ~3–5 MB
```

Do not keep hero fields for all 18 holes resident.

────────

## Part VI — terrain mathematics beyond slope

### 21. Multi-scale curvature

One curvature scale is insufficient.

Compute at least:

```text
local curvature    ~2–3 m radius
landform curvature ~8–15 m radius
```

Local helps:

• bunker tie-ins,
• green shoulders,
• small swales.

Landform helps:

• hills,
• valleys,
• exposed shelves.

### 22. Laplacian approximation

For grid spacing h:

∇²z ≈ ( z(x+h,y) + z(x−h,y) + z(x,y+h) + z(x,y−h) − 4z(x,y) ) / h²

Smooth/source-scale before using visually.

Do not amplify DEM noise.

### 23. Curvature normalization

Use robust percentile bounds rather than raw min/max.

Example:

```text
p05 -> -1
p95 -> +1
```

Clamp outside.

This prevents one noisy cell from destroying the entire field range.

### 24. Bent normal from horizon visibility

For directions ω_i around a terrain point, compute approximate open-sky visibility v_i.

Bent direction:

b = normalize( Σ_i v_i · ω_i )

Sky visibility:

V = (1/N) Σ_i v_i

Use 8–16 azimuth directions for offline compilation.

The bent normal is not a physical surface normal.

It answers:

> which direction is the open sky?

This helps valleys/woods feel naturally enclosed.

### 25. Horizon visibility

For azimuth direction θ:

α_h(θ) = max_r arctan( (z(r,θ) − z_0) / r )

Approximate visibility:

v(θ) = 1 − max(0, α_h) / (π/2)

Use a limited radius:

```text
20–60 m
```

depending on local/landform field.

Current relative-sky work is a good base.

V2 extends it into bent direction + packed field output.

### 26. Source normal must remain primary

Display normal stack:

```text
source terrain normal
+
visual deformation gradient
+
very small procedural micro-normal
```

Order matters.

Do not derive primary terrain normal from the display triangle.

────────

## Part VII — green-complex hero system

### 27. Green complex patch

Generate a dedicated patch bounded approximately:

```text
green polygon + 30–45 m influence
```

Clip to practical context.

This patch may include:

• green,
• fringe,
• apron,
• runoffs,
• nearby bunkers,
• green-side rough,
• path.

### 28. Green edge resampling

Display edge spacing:

Standard Green view

```text
0.25–0.6 m
```

Normal Terrain

```text
0.75–1.5 m
```

Important:

Dense edge samples improve smooth silhouette.

They do not increase source accuracy.

### 29. Green interior triangulation

Interior density depends on:

• source terrain curvature,
• proximity to edge,
• nearby bunker tie-ins,
• current camera.

Typical standard close spacing:

```text
0.5–1.5 m
```

If source is only 1 m, values below 1 m are interpolated display geometry.

### 30. Green material BRDF

Green should have the quietest material.

Use:

• high roughness,
• low macro variation,
• tiny directional mowing response,
• low-amplitude micro-normal,
• source slope lighting.

Avoid:

• obvious checkerboard,
• glitter,
• neon color,
• fake break map.

### 31. Green micro-normal

World-space scalar field:

h(x,y) = A_1·n_1(x,y) + A_2·n_2(x,y)

Then:

∇h = (h_x, h_y)

Visual normal:

n' = normalize( n + λ·(−h_x, −h_y, 0) )

Suggested wavelengths:

```text
0.25–0.45 m
0.8–1.4 m
```

Amplitude extremely small.

Fade by fwidth.

### 32. Fringe

Fringe must feel like a cut-height transition, not a colored outline.

Relative to green:

```text
slightly darker
slightly rougher
slightly stronger micro-normal
```

Use boundary SDF to create a clean but not perfectly digital transition.

### 33. Apron

Apron uses fairway-family response but calmer mowing.

The green/fairway/apron sequence should read:

```text
fairway
→ approach
→ apron
→ fringe
→ green
```

when the course actually supports those distinctions.

### 34. Runoffs

Only create runoff logic when canonical slope supports it.

For green boundary point and nearby outside point:

• compute slope direction,
• determine whether terrain falls away from green,
• use close-mown visual class only when the real terrain behavior supports it.

Do not create picturesque shaved banks everywhere.

────────

## Part VIII — bunker V2 hero system

### 35. Bunker patch topology

Each bunker receives:

```text
outer turf ring
rim ring
inner wall ring(s)
floor interior
```

Example ring offsets:

```text
outside +0.75 m
rim       0.00 m
inside    0.25 m
inside    0.60 m
inside    1.20 m
```

Adapt by bunker size.

This is vastly better than one coarse polygon fan.

### 36. Bunker signed-distance field

Interior distance:

d_i(p) = distance(p, ∂B)

Exterior distance:

d_o(p) = distance(p, ∂B)

Signed:

d_s(p) = +d_i(p) if p ∈ B, −d_o(p) if p ∉ B

Use both geometry and material from the same field.

### 37. Bowl

Normalized interior:

u = clamp(d_i / R, 0, 1)

Quintic:

S(u) = 6u⁵ − 15u⁴ + 10u³

Visual bowl:

z_b = z_t − D·S(u)

This provides zero slope at floor center and a controlled rim tie-in.

### 38. Better bowl shape

Simple radial SDF bowls can look too symmetrical.

Add a low-amplitude shape field q(p) derived from:

• bunker elongation axis,
• terrain downhill direction,
• deterministic seeded variation.

Example:

D(p) = D_0 · [ 1 + 0.12·cos(2φ + φ_0) + 0.08·q(p) ]

Clamp.

This is visual-only.

Do not imply measured bunker depth.

### 39. Lip cross-section

Outside ring lift:

L(q) = L_max · sin²( π·q / W )

for 0 < q < W.

Inside edge can simultaneously begin bowl descent.

This creates:

```text
turf
small crest
rim
sand wall
floor
```

instead of a paper cutout.

### 40. Bunker normals

From display height field:

n = normalize(−z_x, −z_y, 1)

At rim:

blend with source terrain normal over a narrow band.

No faceted fan normals.

### 41. Sand grain

Do not use a literal sand photo.

Use two visual frequencies:

```text
macro  2–6 m
grain  0.12–0.30 m
```

Very low amplitude.

Sand variation should mostly come from:

• bowl orientation,
• rim shadow,
• static sky exposure,
• subtle grain.

### 42. Bunker contact shadow

Bake a soft static contact term from the lip/terrain relationship.

Near sun-facing/overhanging lip:

• darker sand,
• subtle.

This can be part of the hero field.

Do not require a separate dynamic shadow caster for every bunker lip.

────────

## Part IX — fairway V2

### 43. Mowing becomes material direction, not just color bands

Use route tangent t and surface normal n.

Construct lateral direction:

b = normalize(n × t)

Use t to modulate grazing response.

A cheap stylized response:

g = pow(1 − |v·t|, p)

Then modulate roughness/albedo by a very small band-dependent factor.

The result should only become obvious when the camera angle catches it.

### 44. Band signal

m(s,t) = sin( 2π · (s + α·t) / W )

Band modulation:

```text
albedo      ±1–2%
roughness   ±0.02–0.04
```

More physical-feeling than ±5% color stripes.

### 45. First cut

Use a distinct narrow first-cut visual layer.

Typical:

```text
2–3 m
```

with:

• slightly darker albedo,
• higher micro response,
• less directional mowing.

If not canonical, mark basis visual_only.

### 46. Fairway edge SDF

SDF makes transition stable at any triangle size.

For distance d from fairway edge:

w = smoothstep(0, W, d)

Use to blend:

• albedo,
• micro amplitude,
• mowing weight,
• roughness.

This eliminates “painted polygon edge” artifacts.

### 47. Landing-area emphasis

Keep subtle.

Boost only:

• mowing response,
• local ground clarity,
• possibly static shadow contrast.

Never add a glowing gameplay target.

────────

## Part X — rough, fields, landcover

### 48. Non-playing ground must become a semantic material system

Classes:

```text
first_cut
primary_rough
secondary_rough
outer_rough
native
open_field
buffer_grass
ski_slope
wetland
recreation
woods_floor
parking
```

Do not let ground become the visual fallback for all uncertainty.

### 49. Multi-scale rough variation

Primary rough:

```text
small micro
moderate macro
```

Outer rough/native:

```text
higher micro
broader macro
slightly less saturation
```

Keep variation in world space so camera movement does not swim.

### 50. Curvature-aware ground

Concave:

• tiny dark/cool shift.

Convex/exposed:

• tiny light/warm exposure.

Use:

```text
1–4% luminance
```

This makes large open areas feel sculpted.

### 51. Dry/wet appearance

Only when source/context supports it.

A wetland/drainage class can alter:

• saturation,
• roughness,
• hue.

Do not infer moisture from terrain concavity alone and present it as real.

────────

## Part XI — paths, roads, water, structures

### 52. Cart paths become physical ribbons

Path geometry should include:

```text
top
shoulder
bank blend
```

Use path centerline/edge source where available.

### 53. Cross-section

For lateral coordinate t:

```text
flat-ish center
small crown/crossfall if desired visually
rounded/soft shoulder
terrain blend
```

Do not create road-engineering precision unsupported by source.

### 54. Bank blend

If local path top plane z_p and terrain z_t:

z = (1−w)·z_p + w·z_t

where:

w = smoothstep(0, W, d)

with:

```text
W ~0.5–1.5 m
```

### 55. Water

Use:

• accurate shoreline,
• subtle Fresnel,
• static/environment reflection cue,
• shoreline contact darkening,
• tiny normal motion only if event-driven animation policy permits.

Recommendation:

Keep water static in V2 production.

The player does not need animated ripples enough to justify a continuous frame loop.

### 56. Structures

Structures should be:

• footprint-correct,
• scale-correct,
• roof-correct,
• silhouette-correct,
• material-simple.

A distant clubhouse with the correct silhouette is more valuable than an over-textured generic building.

### 57. Structure LODs

Recommended:

```text
LOD0   1k–8k triangles
LOD1   300–2k
LOD2   silhouette / 100–500
```

depending on building prominence.

Use GLB.

### 58. Texture discipline

Use texture assets only where shader-generated material is inadequate.

Structures:

• base color,
• normal where meaningful,
• ORM packed texture.

Compress:

• ETC1S for color,
• UASTC for normals/ORM.

KTX2 keeps runtime GPU memory/bandwidth under control.

────────

## Part XII — vegetation V2

### 59. Forests need four structural layers

```text
1 edge specimens
2 edge understory
3 mid-depth crowns
4 interior mass
```

This is more important than simply increasing tree count.

### 60. Edge specimens

Near visible forest edge:

• full near crown,
• 7–10 sided trunk,
• optional 2–4 primary branch silhouettes on select families,
• individual yaw/aspect/height,
• contact shadow.

Do not put branch geometry on every tree.

### 61. Primary branch geometry

For important near trees only.

A branch can be:

```text
tapered 5–7 sided cylinder
1–3 segments
```

Use 2–4 branches.

Budget:

```text
+40–150 triangles per hero tree
```

Only for trees projected large enough to matter.

### 62. Hero tree threshold

Use projected crown radius.

Example:

```text
>= 32 px
```

may qualify for branch-enhanced LOD.

Still respect a hard budget:

```text
20–40 hero trees
```

depending on frame.

### 63. Trunk grounding

At root point:

```text
z = visual surface
```

Add a tiny dark radial contact field.

No floating trunks.

### 64. Understory

Create deterministic low clusters near edge.

Geometry:

```text
8–40 triangles
```

Use only within:

```text
~5–12 m inside edge
```

and where visibility matters.

### 65. Mid forest

Use current cheaper crowns.

Reduce:

• trunks,
• internal variation.

Increase:

• forest mass contribution.

### 66. Interior forest

Use mass geometry.

The interior should read as:

```text
dark continuous canopy volume
```

not 400 individually recognizable balls.

### 67. Distant forest impostors — experimental

For very distant context, benchmark octahedral/billboard impostors.

Do not replace the current mass system by default.

Potential value:

• less triangle cost.

Risks:

• billboard feel,
• alpha overdraw,
• sorting,
• visual mismatch.

Keep experimental until an A/B proves it.

### 68. Static forest shadow field

A major V2 opportunity.

Since:

• sun is fixed,
• trees are mostly static,

bake broad far-tree shadow influence into the ground field.

Dynamic shadow map then focuses on:

• nearby trees,
• structures,
• hero objects.

This can increase grounding while reducing shadow-map burden.

────────

## Part XIII — lighting V2

### 69. Lighting stack

Recommended production stack:

```text
fixed directional sun
+
hemisphere/environment diffuse
+
terrain sky visibility
+
bent-sky direction
+
static contact/shadow field
+
limited dynamic shadow map
```

No need for full real-time GI.

### 70. Bent-sky ambient

Instead of hemisphere light affecting every terrain point identically:

modulate ambient using:

```text
sky visibility
bent normal
```

Concept:

L_a = V_sky · E_sky(b)

This makes:

• valley floors darker,
• exposed shelves brighter,
• forest edges feel enclosed.

### 71. Static shadow bake

For far static objects:

1. project fixed sun,
2. rasterize approximate occluders offline,
3. blur with world-space radius,
4. store R8 shadow field.

This is art-directed static shading.

Do not call it physically exact.

### 72. Dynamic shadows

Use for:

• terrain,
• near trees,
• near structures,
• moving visual markers if needed.

Current single fitted shadow map is strong.

Before replacing it, optimize:

```text
shadow.autoUpdate = false
shadow.needsUpdate = true only when needed
```

Three.js explicitly supports this.

### 73. Cascaded Shadow Maps — high-tier benchmark

Three.js currently provides a WebGLRenderer CSM addon.

Potential benefit:

• sharper shadows over long whole-hole perspective.

Costs:

• multiple shadow renders,
• more texture memory,
• more CPU/GPU work.

Recommendation:

```text
standard = fitted single sun shadow
high     = benchmark 2-cascade CSM
```

Do not ship CSM on standard until physical iPhone measurement proves value.

### 74. Light probe grids — experiment only

Three.js now provides LightProbeGridWebGL with position-dependent L2 spherical-harmonic diffuse irradiance.

This is technically interesting.

But it is not a V2 baseline.

Reasons:

• bake/runtime complexity,
• GPU storage,
• extra shader work,
• unclear value for a largely outdoor course.

Test only on a building-heavy/wooded hero frame.

Keep if it creates obvious depth not already achieved by sky visibility/bent normal.

### 75. PMREM environment

A restrained environment map can improve:

• water,
• sand,
• building surfaces.

Keep intensity low.

Do not let turf become glossy.

────────

## Part XIV — shader V2

### 76. Keep one semantic ground program

Continue extending MeshStandardMaterial / current ground material.

Avoid:

```text
material per surface
material per hole
material per LOD
```

One program with packed fields is preferable.

### 77. Shader program key

The material must implement a stable:

```ts
customProgramCacheKey()
```

based only on actual shader-structure switches.

Do not include:

• per-hole numbers,
• color tweaks,
• runtime intensity.

Those should be uniforms.

This prevents unnecessary program variants.

### 78. Precompile

Before first player render:

```ts
await renderer.compileAsync(world, camera);
```

Three.js uses parallel shader compile where supported.

Precompile:

```text
Terrain
Green
Top
```

camera/material combinations while the round screen is preparing.

Avoid first-use stutter.

### 79. Shader work placement

MDN recommends doing work in the vertex shader when visually acceptable.

Use vertex:

• large-scale semantic interpolation,
• some world transforms,
• route coordinates.

Use fragment:

• SDF edges,
• micro normal,
• material response,
• field atlas.

Do not move high-frequency edge logic to vertices.

### 80. Fragment sampler budget

Do not create a 12-texture ground material.

Target:

```text
2–4 field samplers
1 optional environment
shadow samplers managed by Three
```

Pack data aggressively.

### 81. Precision

Terrain/course coordinates are local meters.

Highp fragment should be used where supported for:

• world-space fields,
• SDF,
• large coordinate arithmetic.

Prefer subtracting local origin before shader calculations.

────────

## Part XV — LOD V2

### 82. Geometric LOD hysteresis

If switching thresholds:

```text
LOD0 enter 0.7 px
LOD0 leave 1.0 px
```

example.

Separate enter/leave thresholds stop flicker.

### 83. No visible LOD pop during static viewing

Prefer LOD switches:

• during camera transition,
• after camera settles but outside central attention,
• with hysteresis.

Do not switch every minor pinch/zoom.

### 84. Dithered LOD fade — optional

If terrain LOD pop remains visible, test an ordered-dither crossfade.

But dual rendering during fade doubles geometry briefly.

Keep fade:

```text
120–200 ms
```

and only during major camera transitions.

If artifacts are worse than the pop, remove it.

### 85. Vegetation LOD

Use current projected-size system.

Add:

```text
hero
near
distant
far
mass
```

instead of only near/distant/far.

Hero is capped.

────────

## Part XVI — streaming and residency

### 86. Active-hole residency

Maximum detail resident:

```text
current hole
```

Prefetch:

```text
next hole
previous hole if review likely
```

Do not hold all 18 hero atlases/meshes on GPU.

### 87. Active focal residency

Within current hole:

```text
whole-hole base field
+
one active hero field
```

Hero field changes among:

```text
tee/landing
approach
green
```

if necessary.

Green can be prefetched early.

### 88. Texture upload discipline

Do not upload field textures during the critical interaction frame.

Load:

• at hole transition,
• during camera transition,
• while UI is idle.

Three.js DataArrayTexture can update specific layers if that architecture is used.

### 89. Geometry residency

Dispose previous-hole hero geometry after transition and sync review requirements permit.

Keep:

• compact canonical package,
• base adjacent-hole context.

────────

## Part XVII — mobile performance budgets V2

### 90. Do not optimize one metric

Track:

```text
draw calls
triangles
fragment cost
DPR
shadow render cost
texture bytes
geometry bytes
program count
CPU P95
GPU P95 where available
```

### 91. Standard-tier frame target

During interaction:

```text
P95 <= 16.7 ms
```

Fallback:

```text
<=33 ms
```

Idle scene has no animation loop.

### 92. Standard-tier visible targets

Starting targets:

```text
base terrain              25k–50k
hero terrain               8k–30k
vegetation                80k–180k
structures/context         5k–40k
total                     ~150k–300k
```

This is not a hard “quality score.”

If fill/shadow cost dominates, triangle reduction may not help.

### 93. Draw calls

Terrain view:

```text
target <= 160
hard budget <= 180
```

Better:

```text
<= 120
```

after batching if visually unchanged.

### 94. Field texture budget

Standard active hole:

```text
whole-hole fields   ~3–5 MB
hero fields         ~2–5 MB
```

Target:

```text
<=10 MB field textures
```

before mip/driver overhead.

### 95. Asset texture budget

Current-hole visible authored structure/context textures:

```text
target <= 8–16 MB compressed GPU footprint
```

Use KTX2.

### 96. DPR / pixel budget

Keep current pixel-budget concept.

Standard:

```text
~4 MP back buffer
```

Measure physical iPhone.

Do not automatically use device DPR 3.

MDN specifically recommends smaller back buffers when appropriate.

────────

## Part XVIII — asset and tool pipeline

### 97. QGIS

Use for:

• spatial truth inspection,
• surface/context overlays,
• feature QA.

### 98. GDAL / PROJ

Use for:

• reprojection,
• raster preparation,
• field generation inputs.

### 99. PDAL / CloudCompare

Use only when actual point clouds are part of the source pipeline.

PDAL:

• ground filtering,
• classification,
• raster/TIN prep.

CloudCompare:

• source QA,
• cross-section inspection,
• alignment sanity checks.

### 100. Blender

Use for:

• buildings,
• bridges,
• authored vegetation source shapes,
• special course structures.

Conventions:

```text
meters
Z-up
origin at ground contact
few material slots
clean names
no unapplied scale
```

### 101. GLB optimization

Pipeline:

```text
Blender
↓
GLB
↓
glTF Transform
↓
meshoptimizer / gltfpack
↓
KTX2
↓
glTF Validator
↓
content hash
```

### 102. KTX2 policy

Use:

```text
ETC1S
base-color / low-frequency color
```

Use:

```text
UASTC
normal / roughness / precision-sensitive maps
```

Three.js KTX2Loader transcodes Basis Universal textures to supported GPU formats.

### 103. meshoptimizer policy

Use:

• vertex cache optimization,
• vertex fetch optimization,
• explicit LOD simplification.

For protected boundaries:

• SimplifyLockBorder,
• priority vertices,
• absolute error.

This is ideal for preserving green/bunker/path boundaries.

### 104. Spector.js

Development-only.

Use to inspect:

```text
actual draw calls
program switches
texture bindings
shadow passes
unexpected duplicate draws
```

No production bundle dependency.

────────

## Part XIX — compiler architecture

### 105. Precompile production worlds

Production should not build heavy V2 artifacts on the player’s phone unless something is missing.

Build pipeline:

```text
canonical package
+
terrain source
+
context layer
+
style version
↓
display mesh compiler
↓
field compiler
↓
vegetation allocator
↓
asset resolver
↓
budget validator
↓
hash
↓
deploy artifact
```

Runtime:

```text
validate hash
upload buffers/textures
render
```

### 106. New V2 artifact contract

```ts
interface MeridianVisualArtifactV2 {
  schemaVersion: 2;
  kind: 'meridian_visual_artifact_v2';

  canonicalPackageHash: string;
  terrainHash: string;
  contextLayerHash: string | null;
  styleHash: string;

  meshes: {
    base: {
      lod0: PackedDisplayMesh;
      lod1: PackedDisplayMesh;
      lod2: PackedDisplayMesh;
    };
    heroPatches: PackedHeroPatch[];
  };

  fields: {
    wholeHole: PackedFieldAtlas;
    heroes: PackedHeroField[];
  };

  objects: {
    vegetation: PackedVegetationSet;
    structures: PackedStaticObjectSet;
    ribbons: PackedRibbonSet;
  };

  provenance: {
    canonicalBasis: 'source_backed';
    displayBasis: 'derived_visual';
    highResolutionTerrainSources: SourceRef[];
  };

  budget: {
    trianglesByClass: Record<string, number>;
    geometryBytes: number;
    textureBytesEstimate: number;
    expectedDrawCalls: number;
  };

  contentHash: string;
}
```

### 107. Hero patch contract

```ts
interface PackedHeroPatch {
  id: string;
  kind:
    | 'green_complex'
    | 'bunker'
    | 'path'
    | 'water_edge'
    | 'landing_edge'
    | 'structure_pad';

  boundsM: [number, number, number, number];

  basis:
    | 'interpolated_canonical'
    | 'higher_resolution_source'
    | 'visual_only_deformation';

  positions: Float32Array;
  indices: Uint32Array;

  canonicalHeightReference: Float32Array;
  visualOffsetMm: Int16Array;

  edgeErrorMaxM: number;
}
```

### 108. Field atlas contract

```ts
interface PackedFieldAtlas {
  width: number;
  height: number;

  boundsM: [number, number, number, number];

  reliefRGBA16F: Uint16Array;
  bentRGBA8: Uint8Array;
  semanticRGBA8: Uint8Array;

  sdfLayers?: {
    layerNames: string[];
    data: Uint16Array;
  };

  basis: 'source_derived_visual';
}
```

────────

## Part XX — debug/QA system V2

### 109. Required debug views

```text
Final
Canonical Surface
Display Surface
Visual Offset
Base LOD
Hero Patches
Wireframe
Triangle Density
Screen Error
Source Normal
Display Normal
Slope
Local Curvature
Landform Curvature
Sky Visibility
Bent Normal
Static Shadow
Surface Class
Boundary SDF
Mowing Field
Roughness
Vegetation LOD
Dynamic Shadow Only
Static Shadow Only
No Shadows
```

### 110. Why this matters

When a scene looks wrong, the team must be able to answer:

```text
geometry?
source?
normal?
field?
shader?
shadow?
LOD?
camera?
asset?
```

without guessing.

### 111. Canary hole set

Use:

```text
Hole 7
water / woods / green / live UI

Hole 9
performance stress

Hole 11
fairway/context source complexity

Hole 15
green shape canary

Hole 16
approach transition

Hole 18
clubhouse / finishing context
```

### 112. Visual reference board

For every canary:

store a small reference set of:

• official/credible course imagery,
• source orthographic context,
• Top view,
• Terrain view,
• Green view.

The question is not:

> “Does the render look pretty?”

It is:

> “Does the render preserve the visual identity of this real hole?”

### 113. Automated topology checks

Fail compiler if:

```text
degenerate triangle
flipped triangle
non-finite normal
hero/base crack > tolerance
critical boundary mismatch
duplicate seam normal mismatch
unbounded visual offset
```

### 114. Normal seam check

For duplicate vertices at same world point:

θ = arccos( n_1 · n_2 )

For a smooth terrain seam require:

```text
theta <= ~1–2°
```

unless intentionally hard.

### 115. Hero seam height check

For patch boundary:

|Δz| ≤ ε

Suggested:

```text
source-backed patch  <= 0.02–0.05 m
visual patch         exactly continuous at rim
```

### 116. Screenshot regression

Every renderer PR captures:

```text
6 canary holes
× relevant view states
× standard/high
× phone viewport
```

Use pixel diff as a regression detector, not an art-quality score.

Human review remains required.

### 117. GPU regression

Hole 9 standard Terrain must report:

```text
draw calls
triangles
program count
textures
geometry bytes
CPU P95
GPU P95 where available
shadow render count
```

No fidelity PR ships without before/after numbers.

────────

## Part XXI — implementation plan

### Task 1 — V2 artifact schemas

Files

• Create: src/lib/golf/course-geometry/visual-artifact-v2.ts
• Test: `src/lib/golf/course-geometry/__tests__/visual-artifact-v2.test.ts`

Produces

• MeridianVisualArtifactV2
• PackedHeroPatch
• PackedFieldAtlas

- [ ] Write failing parse tests for valid/invalid V2 artifact.
- [ ] Test hash fields are mandatory.
- [ ] Test hero basis enum.
- [ ] Implement V2 schemas/types.
- [ ] Run targeted tests.
- [ ] Commit:

```text
feat(meridian): define v2 display artifact contract
```

### Task 2 — terrain multi-scale curvature compiler

Files

• Create: src/lib/golf/course-geometry/terrain-curvature.ts
• Test: terrain-curvature.test.ts

Produces

```ts
compileCurvature(grid, radiusM): Float32Array
```

- [ ] Planar grid test → near zero.
- [ ] Bowl test → concave sign.
- [ ] Hill test → convex sign.
- [ ] Add robust percentile normalization.
- [ ] Add local and landform scales.
- [ ] Commit.

### Task 3 — bent-sky compiler

Files

• Create: terrain-sky-field.ts
• Tests.

Produces

```ts
compileSkyField(grid, options): {
  visibility: Float32Array;
  bentXY: Float32Array;
  exposure: Float32Array;
}
```

- [ ] Flat plane test.
- [ ] Artificial valley test.
- [ ] Artificial ridge test.
- [ ] 8/16-direction deterministic output test.
- [ ] Commit.

### Task 4 — semantic boundary SDF compiler

Files

• Create: surface-distance-field.ts
• Tests.

Produces

```ts
buildSignedDistanceField(rings, frame, resolution)
```

- [ ] Circle/polygon signed-distance tests.
- [ ] Inside positive / outside negative convention test.
- [ ] Green/bunker/fairway layers.
- [ ] Quantization error test.
- [ ] Commit.

### Task 5 — base display LOD compiler

Files

• Create: display-mesh-v2.ts
• Create build script.
• Tests.

- [ ] Lock semantic boundaries.
- [ ] Refine by elevation error.
- [ ] Refine by normal error.
- [ ] Refine by curvature.
- [ ] Generate LOD0/1/2.
- [ ] Add Hausdorff boundary measurement.
- [ ] Add degenerate/flipped checks.
- [ ] Commit.

### Task 6 — hero patch extraction

Files

• Create: hero-patches.ts
• Tests.

- [ ] Green influence region generation.
- [ ] Bunker patch generation.
- [ ] Path/water edge patch generation.
- [ ] Base exclusion/stitch mask.
- [ ] No overlap/z-fighting test.
- [ ] Commit.

### Task 7 — green-complex hero mesh

Files

• Create: green-display-mesh.ts
• Tests.

- [ ] Preserve exact canonical edge samples.
- [ ] Resample display edge.
- [ ] Refine interior by terrain error.
- [ ] Stitch patch boundary.
- [ ] Record basis as interpolated/source-high-res.
- [ ] Commit.

### Task 8 — bunker V2 topology

Files

• Create/replace: bunker-display-mesh.ts
• Tests.

- [ ] Generate ring hierarchy.
- [ ] Constrained triangulation.
- [ ] Zero displacement at rim.
- [ ] Bowl reaches expected depth.
- [ ] Lip continuous outside.
- [ ] Family-specific parameters.
- [ ] Commit.

### Task 9 — bunker analytic normal field

Files

• Modify bunker compiler.
• Modify field atlas.
• Tests.

- [ ] Gradient direction test.
- [ ] Smooth rim blend.
- [ ] No duplicate-rim normal seam.
- [ ] Pack gradient.
- [ ] Commit.

### Task 10 — field atlas packer

Files

• Create: field-atlas.ts
• Tests.

- [ ] Pack relief RGBA16F.
- [ ] Pack bent/static RGBA8.
- [ ] Pack semantic RGBA8.
- [ ] Optional SDF layers.
- [ ] Byte-size report.
- [ ] Commit.

### Task 11 — V2 ground shader

Files

• Modify: three-landscape.ts
• Create focused shader helpers if needed.
• Modify: visual-style.ts
• Tests/captures.

- [ ] Read V2 fields.
- [ ] Preserve V1 fallback.
- [ ] Add curvature response.
- [ ] Add bent-sky ambient.
- [ ] Add static shadow multiplier.
- [ ] Add SDF transitions.
- [ ] Add custom program cache key.
- [ ] Commit.

### Task 12 — fairway directional material

Files

• Ground shader.
• Tests/captures.

- [ ] Route tangent response.
- [ ] Roughness modulation.
- [ ] Edge fade.
- [ ] Fwidth anti-aliasing.
- [ ] Top-view moiré test.
- [ ] Commit.

### Task 13 — green/fringe/apron material pass

Files

• Ground shader/style.
• Tests/captures.

- [ ] Green quiet micro-normal.
- [ ] Fringe cut-height response.
- [ ] Apron bridge.
- [ ] No fake contour/break shading.
- [ ] Hole 15 visual capture.
- [ ] Commit.

### Task 14 — cart-path hero ribbon

Files

• Create: path-display-mesh.ts
• Context renderer.
• Tests.

- [ ] Top/shoulder/bank cross-section.
- [ ] Visual-only cut/fill.
- [ ] Continuous terrain blend.
- [ ] Path material.
- [ ] Commit.

### Task 15 — forest edge V2

Files

• Modify tree-assets.ts
• Modify three-landscape.ts
• Tests/captures.

- [ ] Hero tree LOD.
- [ ] Optional primary branches.
- [ ] Understory.
- [ ] Mid/interior mass transition.
- [ ] Hero hard cap.
- [ ] Commit.

### Task 16 — static tree/contact shadow bake

Files

• Create: static-shadow-field.ts
• Tests.

- [ ] Fixed-sun projection.
- [ ] Blur radius.
- [ ] Tree/context occluder categories.
- [ ] Pack to atlas.
- [ ] Compare with dynamic shadow.
- [ ] Commit.

### Task 17 — structure GLB pipeline

Files

• Asset scripts/docs.
• Context renderer.

- [ ] Blender convention doc.
- [ ] GLB optimization command.
- [ ] KTX2 conversion.
- [ ] glTF Validator command.
- [ ] triangle/material/texture report.
- [ ] load with correct world scale.
- [ ] Commit.

### Task 18 — InstancedMesh/BatchedMesh allocation

Files

• Create static-object-batches.ts
• Tests/benchmarks.

- [ ] identical assets → InstancedMesh.
- [ ] heterogeneous same-material candidates → BatchedMesh.
- [ ] measure draw calls.
- [ ] keep only measured win.
- [ ] Commit.

### Task 19 — artifact residency manager

Files

• Create: visual-residency.ts
• Tests.

- [ ] current-hole base resident.
- [ ] next-hole prefetch.
- [ ] one active hero field.
- [ ] previous resources disposed.
- [ ] memory counter.
- [ ] Commit.

### Task 20 — shader precompile

Files

• Runtime.
• Tests/telemetry.

- [ ] compileAsync() after world setup.
- [ ] precompile Terrain/Green/Top relevant programs.
- [ ] measure first-frame hitch before/after.
- [ ] commit.

### Task 21 — shadow update discipline

Files

• runtime.
• tests.

- [ ] set shadow autoUpdate false where safe.
- [ ] explicit needsUpdate events.
- [ ] no stale LOD shadow.
- [ ] no stale structure/tree shadow.
- [ ] measure saved shadow renders.
- [ ] commit.

### Task 22 — CSM benchmark

Files

• isolated experimental module.
• benchmark only.

- [ ] 2-cascade high-tier implementation.
- [ ] Hole 9/18 compare.
- [ ] GPU P95.
- [ ] texture memory.
- [ ] keep only if visually meaningful and within high-tier budget.

Do not enable standard.

### Task 23 — light-probe benchmark

Files

• isolated experiment.

- [ ] wooded/structure scene only.
- [ ] low-resolution grid.
- [ ] compare against bent-sky ambient.
- [ ] measure.
- [ ] remove if incremental value is weak.

### Task 24 — debug passes V2

Files

• meridian-debug-passes.ts
• Lab UI.

- [ ] Hero patch.
- [ ] field layers.
- [ ] screen error.
- [ ] static shadow.
- [ ] bent normal.
- [ ] LOD.
- [ ] wireframe.
- [ ] commit.

### Task 25 — V2 budget validator

Files

• render-metrics.ts
• validate-render-budget.mjs

- [ ] artifact byte budgets.
- [ ] triangle class counts.
- [ ] expected draw-call estimate.
- [ ] runtime calls/triangles/programs.
- [ ] CPU/GPU P95.
- [ ] regression output.
- [ ] commit.

### Task 26 — canary visual suite

Files

• capture script.
• baseline assets.

- [ ] Hole 7.
- [ ] Hole 9.
- [ ] Hole 11.
- [ ] Hole 15.
- [ ] Hole 16.
- [ ] Hole 18.
- [ ] standard/high.
- [ ] phone viewport.
- [ ] commit.

### Task 27 — physical iPhone calibration

Test on actual target hardware.

Record:

```text
Terrain frame P95
Green frame P95
camera transition P95
draw calls
visible triangles
field memory
shadow cost
thermal behavior
load time
shader compilation hitch
```

Tune:

```text
hero density
field resolution
DPR
shadow map
tree hero cap
LOD thresholds
```

No desktop-only signoff.

────────

## Part XXII — execution sequence

### 118. Stage A — foundation

Build:

```text
V2 schema
curvature
sky/bent field
SDF
base display LOD
```

Goal:

terrain alone already looks richer.

### 119. Stage B — hero green/bunker

Build:

```text
green hero mesh
bunker hero mesh
bunker normals
hero field
```

Goal:

Hole 15 should produce the first “wow” improvement.

### 120. Stage C — turf/material

Build:

```text
fairway directional material
fringe/apron
rough hierarchy
SDF transitions
```

Goal:

remove “painted polygons.”

### 121. Stage D — context

Build:

```text
paths
forest edge
understory
structures
static contact/shadow
```

Goal:

remove “course floating in generic green.”

### 122. Stage E — performance/polish

Build:

```text
residency
precompile
shadow update discipline
batching
quality tiers
```

Then benchmark experimental:

```text
CSM
light probes
far impostors
```

────────

## Part XXIII — research-backed technology decisions

Three.js DataTexture / DataArrayTexture

Three.js supports raw typed-array textures and texture arrays. V2 uses these for precompiled terrain/material fields because the information is dense, deterministic, and not an authored color image.

compileAsync()

Three.js WebGLRenderer exposes compileAsync() and uses the parallel shader compile extension where available. V2 should precompile expected programs to avoid the first Green/Terrain view hitch.

InstancedMesh

Three.js explicitly recommends InstancedMesh for repeated geometry/material because it reduces draw calls.

BatchedMesh

Three.js provides BatchedMesh for many objects that share a material but may use different geometries. Use only where measured.

CSM

Three.js ships a WebGLRenderer CSM addon. Treat it as high-tier experimental until mobile measurement proves it.

LightProbeGridWebGL

Three.js now has position-dependent L2 spherical harmonic diffuse GI grids for WebGLRenderer. Interesting, but optional — the simpler source-derived bent-sky system is the production recommendation first.

meshoptimizer

Its simplifier supports locked borders and priority vertices, which directly maps to Meridian’s requirement to preserve green/bunker boundaries while reducing surrounding mesh complexity.

KTX2/Basis

KTX2 supports universal Basis textures that can transcode into GPU-native compressed formats. UASTC is better suited to precision textures such as normals; ETC1S is useful for compact color textures.

MDN WebGL guidance

The architecture follows the major mobile-WebGL recommendations:

• batch draw calls,
• control back-buffer size,
• think in per-pixel VRAM,
• use compressed textures,
• use mipmaps where appropriate,
• parallelize shader compilation,
• avoid unnecessary blocking API calls,
• move work to vertex stage when acceptable.

────────

## Part XXIV — source links

Three.js DataArrayTexture
<https://threejs.org/docs/pages/DataArrayTexture.html>

Three.js DataTexture
<https://threejs.org/docs/pages/DataTexture.html>

Three.js WebGLRenderer / compileAsync / renderer info
<https://threejs.org/docs/pages/WebGLRenderer.html>

Three.js InstancedMesh
<https://threejs.org/docs/pages/InstancedMesh.html>

Three.js BatchedMesh
<https://threejs.org/docs/pages/BatchedMesh.html>

Three.js CSM
<https://threejs.org/docs/pages/CSM.html>

Three.js LightProbeGridWebGL
<https://threejs.org/docs/pages/LightProbeGridWebGL.html>

Three.js LightShadow
<https://threejs.org/docs/pages/LightShadow.html>

Three.js KTX2Loader
<https://threejs.org/docs/pages/KTX2Loader.html>

MDN WebGL best practices
<https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices>

meshoptimizer
<https://meshoptimizer.org/>

glTF Transform
<https://gltf-transform.dev/>

KTX 2.0 specification
<https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html>

three-mesh-bvh
<https://github.com/gkjohnson/three-mesh-bvh>

────────

## Part XXV — final design doctrine

Meridian V2 should follow this rule:

> **Geometry carries form. Fields carry nuance. Objects carry identity. The canonical course carries truth.**

That produces the correct investment pattern.

Not:

```text
more polygons everywhere
more textures everywhere
more shaders everywhere
```

But:

```text
more triangles at bunker rims
more vertices at green edges
more terrain fidelity at real landform transitions

high-resolution SDF where edge precision matters
bent-sky lighting where terrain enclosure matters
static shadow where grounding matters

more tree structure at the visible edge
less geometry inside deep forest

correct buildings where the property actually has buildings
no invented filler

one premium ground shader
few draw calls
controlled texture residency
event-driven rendering
```

The visual target is:

> **A golfer should be able to recognize Peek’n Peak from Meridian’s landform and course architecture before reading the hole number.**

That is the grade.

────────

## Final acceptance checklist

Truth

- [ ] Canonical geometry unchanged by visual improvements.
- [ ] Canonical terrain remains separate from display surface.
- [ ] Higher-resolution terrain is labeled source-backed only when a real higher-resolution source exists.
- [ ] Visual SDF/fringe/bunker fields never feed lie truth.
- [ ] Display pick cannot silently become canonical pick.

Geometry

- [ ] Base LODs generated.
- [ ] Green hero patch generated.
- [ ] Bunker hero patches generated.
- [ ] Critical boundary Hausdorff gates pass.
- [ ] Hero seams are crack-free.
- [ ] No terrain normal seams.
- [ ] No visible green/bunker faceting.

Material

- [ ] Fairway no longer reads as color striping only.
- [ ] Green is quiet and premium.
- [ ] Fringe/apron read as cut-height transitions.
- [ ] Rough hierarchy is visible but restrained.
- [ ] No anonymous green ground in reviewed context.
- [ ] Sand feels sculpted and grounded.

Lighting

- [ ] Sky visibility field active.
- [ ] Bent-sky response active or explicitly rejected by benchmark.
- [ ] Static shadow field validated.
- [ ] Dynamic shadows update only when needed.
- [ ] CSM remains high-tier only unless measured otherwise.

Vegetation

- [ ] Forest edge has specimen variation.
- [ ] Understory exists where useful.
- [ ] Deep forest relies on mass.
- [ ] Tree roots/trunks do not float.
- [ ] Hero-tree budget enforced.

Assets

- [ ] Structures are course-specific where visible.
- [ ] GLBs optimized.
- [ ] KTX2 used where appropriate.
- [ ] glTF Validator passes.
- [ ] material slots controlled.

Runtime

- [ ] compileAsync() removes first-view shader hitch.
- [ ] program count stable.
- [ ] current-hole residency bounded.
- [ ] previous hero resources dispose.
- [ ] event-driven rendering retained.
- [ ] standard phone pixel budget retained.

QA

- [ ] Six canary holes captured.
- [ ] GPU metrics compared before/after.
- [ ] Hole 15 Green view passes fidelity review.
- [ ] Hole 9 passes performance budget.
- [ ] Physical iPhone pass completed.
- [ ] No feature ships solely because it sounds technically advanced.

────────

## Final recommendation

The next leap should not be “increase the terrain triangle limit.”

It should be:

```text
BASE TERRAIN PYRAMID
        +
HERO PHYSICAL MESHES
        +
HIGH-RES SOURCE-DERIVED FIELD ATLAS
        +
SEMANTIC TURF BRDF
        +
FOREST EDGE STRUCTURE
        +
STATIC + DYNAMIC LIGHTING HYBRID
        +
STRICT MOBILE RESIDENCY
```

That combination is how Meridian can look 2–3 generations more refined without becoming a 3D game engine that melts an iPhone.

The strongest individual investments are:

1. green-complex hero patches
2. bunker V2 topology
3. boundary SDFs
4. multi-scale curvature + bent-sky fields
5. directional fairway material
6. static forest/contact shadow field
7. forest-edge hierarchy
8. course-specific structures
9. shader precompile and residency
10. physical-device QA as a design gate

Execute those in that order.

If done well, the product will stop reading as:

> “a very good 3D golf map.”

It will read as:

> **“a deliberately modeled digital version of this exact golf course.”**
