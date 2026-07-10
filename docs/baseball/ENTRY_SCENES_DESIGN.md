<!--
STATUS: PARKED
DATE: 2026-07-10
PARKING DECISION: Companion "painterly SVG scenes" doc to docs/LANDING_ENTRY_WORLD_DESIGN.md. The Entry World / First Light landing was rejected and parked; #650 merged the flush-diamond login instead. Filed inside docs/baseball/ but is not actually a baseball doc — it is a homepage design that never shipped.
KEPT FOR HISTORY -- do not delete this file.
-->

# Helm Entry Scenes — Baseball & Lift Lab
### Fable's design spec · 2026-07-02 · for the login/onboarding worlds
*Sibling system to golf's `CoastalScene`/`CourseScene` (src/components/golf/scenes/) — same craft DNA, new sports, new moods. Painterly layered SVG, no photography, no people. This is the "svg type thing," grown up.*

---

## ⚠ AMENDMENT — THE PAINTERLY STADIUM IS DEAD (2026-07-02, Nick: *"the svg baseball login looks terrible"* — OVERRIDES Scenes 1–2 below)

Fable saw the built frames and confirms the verdict. Two distinct failures, both fatal:
1. **The illustration failed.** At hero scale the Yard reads as flat clip-art — the infield is a big orange blob, the towers are smudges, the mobile crop is a murky green field with a stray white "V". Golf's coastal scene survives because water/sky/dunes are *abstract gradients by nature*; a baseball stadium demands literal drawing, and literal drawing at 1600×900 in flat SVG paths will always look like a kid's poster. Do not attempt a better stadium. **No literal illustration, ever.**
2. **The panel failed.** Dark-on-dark labels (illegible), stark WHITE input rectangles punched into dark glass (direct violation of family rule 5 — inset glass wells), default-kelly button, dark murky mood — the exact opposite of the landing's new sage-and-cream daylight (see LANDING doc amendment).

### Replacement — **"The Practice Field at First Light"** (one system, light, abstract)

**One responsive component `EntryField`** replaces `YardScene` + `HomePlateScene` (delete both, and delete the painterly `IronRoomScene` — its replacement is below). It is *atmosphere + chalk geometry*, not a picture:

**Layers (back → front):**
1. **Morning air** — layered cream→sage gradient washes: cream `#F5F1E6` field lifting through sage-mist `#E4E9DD` to sage `#94A38A` at the top edge. Abstract sky-light, no horizon line, no objects.
2. **Warm bloom** — one soft radial cream-high `#FBF9F2` bloom off the upper corner (the sun you never see). Dawn variant: warmer, larger; dusk variant: cooler, sage-deeper cast. **Both variants stay LIGHT — the page never goes dark.**
3. **The chalk geometry (the ONLY motif)** — the field as a groundskeeper's blueprint: two foul lines rising from the bottom corners toward a far vanishing point + the faint arc of the base path + a whisper of the batter's-box rectangles. Drawn as 1.5–2px sage-ink `#2E3A2C` lines at 6–10% opacity with the existing slight chalk blur. Precise, architectural, dignified — closer to a Bauhaus field diagram than a stadium drawing. On mobile the same geometry recomposes portrait (lines converge higher).
4. **Grain** — the family feTurbulence recipe unchanged (numOctaves=1, baseFreq=1.2, static, opacity .05).
5. **The living detail** — a single slow chalk-dust drift along one foul line OR a 20s breath in the bloom's radius (pick one, `data-scene-animated`, reduced-motion kills it).

**The glass panel (light glass on light field — fix every named defect):**
- Panel: warm **cream glass** (`rgba` of cream-high, blur+saturate, brass top edge-light, faint grain) — never a dark panel.
- Labels: sage-ink on the cream glass, WCAG AA minimum, always legible.
- Inputs: **inset glass wells** — cream-tinted, soft inner shadow, sage-deep focus ring/glow. **NEVER white rectangles.**
- Button: sage-deep `#5C6E58`, cream text, press physics from the shared vocabulary.
- Links (Forgot password / Sign up): sage-deep, legible, underline on hover.
- Serif Fraunces welcome in sage-ink — copy unchanged (*"Welcome back to the Yard."*), time-aware greeting + remembered-name mechanic unchanged.

**The onboarding arc, respecced — "the field gets chalked":** stage 0 = bare morning air (washes + bloom only) → 1 = first foul line draws in (stroke-draw, 1.2s) → 2 = second foul line → 3 = base-path arc completes → 4 = batter's boxes + the bloom warms one step → serif finish moment unchanged (*"Your program is on the board, Coach {lastName}."*). Same `stage` prop contract (0–4 | 'full'), same crossfade discipline, reduced-motion swaps instantly.

**Lift Lab "Iron Room", respecced (concept kept, painterliness removed):** the plates-load-the-bar mechanic SURVIVES — it was always abstract geometry. The room does not: no windows, no light shafts, no interior illustration. New field: quiet warm-graphite→sage-ink vertical wash (this one surface may sit darker than the auth pages — it lives inside the app, not the front door — but it must read *considered*, not murky), the bar as one clean brass-hairline horizontal, plates as precise concentric circles with brass rims, the single kelly `#16A34A` collar kept (in-app surface — product green is at home here). Chalk-dust motes cut; the plate-glint IS the living detail.

**Golf's coastal scene: untouched.** It works; it stays.

*Everything below is superseded where it conflicts: Scene 1 and Scene 2 layer lists are VOID; the family rules, the arc mechanics, the greeting system, and the build notes survive with the substitutions above.*

---

## The family rules (shared with golf — what makes it HELM)
1. **Painterly layered SVG** — gradients + paths, `viewBox 1600×900` desktop / portrait mobile pair, `preserveAspectRatio slice`
2. **The mow-stripe motif** — alternating grass tones. Golf has it; baseball's outfield inherits it. Family signature.
3. **The grain** — same perf-tuned `feTurbulence` recipe (numOctaves=1, baseFreq=1.2, static, opacity .05)
4. **One living detail per scene** — golf flutters a flag; every Helm scene breathes exactly one slow loop (all `data-scene-animated`, reduced-motion kills it)
5. **Serif welcome + glass form panel** floating over the scene (per Nick's no-white-card rule) — fields as inset glass wells, focus glow in the scene's accent color
6. **Time-aware personalization** — greeting ("Good morning" / "Good evening" + remembered first name via localStorage: "Welcome back, Nick") AND the scene itself tints dawn/dusk by local clock (two sky-gradient states, subtle)

---

## Scene 1 — Baseball login · **"The Yard at Dusk"** (desktop)
The empty ballpark, golden hour just gone, lights coming on. Quiet, reverent, yours.

**Layers (back → front):**
1. **Dusk sky** — vertical gradient `#14261F → #3E5C4B → #E8D9B0` (horizon glow); dawn variant warms the horizon to `#F2E4C4`
2. **Tree-line silhouette** — deep pine `#143527`, soft irregular path
3. **Outfield wall** — low arc, `#1C3A2C`, painterly distance marker "398" in chalk-cream at 8% opacity
4. **Outfield grass** — mow stripes, alternating `#2E5C43` / `#27523B` (the family motif)
5. **Infield** — warm clay arc `#B0703C → #9A5F32` radial, base paths, mound; bases as small cream diamonds
6. **Chalk foul lines** — converging from home plate (bottom-center) to the corners; cream `#F5EDD8`, slight blur
7. **Two stadium light towers** — silhouetted masts; heads carry soft radial halation glows (`#F7EAC8` at low alpha, large radius) — *the signature detail*
8. **The living detail:** dust motes drifting through the light beams (5–7 tiny circles, 14–20s float loops, staggered) + the foul-pole flag flutters (golf's exact keyframe, inherited)
9. Grain + gentle vignette

**Mobile pair · "Home Plate"** — portrait crop: plate low-center, two chalk lines converging upward into the dusk sky, one light-tower glow bleeding in from the top corner. Minimal, iconic.

**Glass panel:** right-floating on desktop, full-width bottom-sheet feel on mobile. Warm glass (blur 20 + saturate 1.3, top edge-light, faint grain in the glass). Serif: *"Welcome back to the Yard."*

---

## Scene 2 — Lift Lab · **"The Iron Room at Dawn"**
Interior. Empty gym, 6 a.m., light shafts through high windows. Reverence for the work.

**Layers:**
1. **Room** — warm graphite field `#2A2622 → #1F1C19`, floor platform lines in `#3A342E`
2. **High windows** — three pale panes upper-left; **volumetric light shafts** cut diagonally (soft cream gradients `#F5EDD8` at 8–14% alpha, feathered)
3. **The barbell** — clean geometric silhouette on a rack, center-right: bar as a single line, plates as concentric circles with **brass rims** `#B08D57`, one **Helm-green collar** `#16A34A` (the only saturated accent in the room)
4. **Chalk dust motes** floating inside the light shafts — *the living detail* (slow drift, 16–24s)
5. **Dawn shift** — by local time the shaft angle/intensity eases (morning: strong shafts; evening: low amber sidelight)
6. Grain + deep vignette

**Glass panel:** darker glass (blur 24, brightness .9, brass hairline edge). Serif: *"The work starts quiet."*

---

## The onboarding arc — personalization as THE mechanic
Onboarding isn't screens; it's **the scene coming alive as you build your program.**

**Baseball coach onboarding (4 steps, existing flow preserved):**
- Step 1 (program): the Yard sits dark, lights off
- Step 2 (account): **first light tower blinks on** (halation fades in)
- Step 3 (team): second tower on; bases appear on the infield
- Step 4 (done): **full lights, flag rises up the foul pole, chalk lines complete** → serif moment: *"Your program is on the board, Coach {lastName}."*
Each transition = one slow crossfade (1.2s, `[0.22,0.7,0,1]`), never a hard swap. Reduced-motion: states swap without animation.

**Player onboarding:** same Yard from the batter's-box angle (mobile scene), plate brightens per step.

**Lift Lab first-run (3–4 steps, from the Front Door wave's flow):**
- The bar starts **empty** → each completed step **loads a plate** (concentric circle slides on, brass rim glint) → final step: **the green collar clicks on** → *"Racked and ready, {firstName}."*
Progress = weight on the bar. No progress bar needed — the bar IS the progress bar.

---

## Build notes (for the Sonnet wave)
- Components: `src/components/baseball/scenes/{YardScene,HomePlateScene}.tsx`, `src/components/baseball/scenes/IronRoomScene.tsx` — mirror golf scenes' props (`className`, `idSuffix`), perf notes copied verbatim (no mix-blend grain, willChange only on the fastest loop, WKWebView-safe)
- Scene states driven by a `stage` prop (0–4) for the onboarding arc; login uses `stage="full"` 
- Time tint: one `variant: 'dawn' | 'dusk'` prop computed client-side from local hour
- Glass grammar per the landing research cookbook (in flight) — same tokens across landing/login/onboarding
- Wire into: `(auth)/login`, `(auth)/signup`, `(auth)/complete-signup`, `(onboarding)/coach-onboarding`, Lift Lab first-run — replacing the Front Door wave's structural output's backgrounds, keeping its flows/validation verbatim
- Greeting personalization: localStorage `helm:lastFirstName` written on successful login; time-of-day greeting util shared
- All scenes `aria-hidden`, decorative, zero pointer events
