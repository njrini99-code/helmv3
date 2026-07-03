# HELM — The Entry World
### Landing · Login · Onboarding as one continuous experience
*Fable's design spec · 2026-07-02 · synthesized from 4-stream research (cinematic patterns / real-glass cookbook / art direction / scroll narrative) + Nick's brief + his 4 references. Companion doc: docs/baseball/ENTRY_SCENES_DESIGN.md (the painterly SVG scenes).*

---

## ⚠ AMENDMENT — SAGE & CREAM (2026-07-02, Nick directive — OVERRIDES all palette language below)

Nick: *"I want sage and cream on the landing page."* The page moves from dusk-pine drama to **morning sage-and-cream calm** — lighter, airier, quieter. Same choreography, same glass, same serif; new light.

**Palette v2 (the only two colors that matter, plus their supports):**

| Role | Token | Value | Replaces |
|---|---|---|---|
| Cream field (unchanged) | `--fl-cream` (alias of `--fl-ecru`) | `#F5F1E6` | — |
| Cream high (glass highlights) | `--fl-cream-high` | `#FBF9F2` | white |
| Sage mist (section tints, glass tint) | `--fl-sage-mist` | `#E4E9DD` | — |
| Sage (rules, icons, decorative, large type) | `--fl-sage` | `#94A38A` | — |
| Sage deep (CTAs, emphasis, hover) | `--fl-sage-deep` | `#5C6E58` | kelly `#16A34A` on landing chrome |
| Sage ink (dark bands, body/display ink) | `--fl-sage-ink` | `#2E3A2C` | deep pine `#143527` |
| Brass hairlines (kept) | `--fl-brass` | `#B08D57` | — |

**Global read-mapping — wherever the spec below says:**
- **deep pine `#143527`** (M3 band, M5 gradient end, M9 footer) → read **sage-ink `#2E3A2C`**
- **kelly `#16A34A` CTA / accent** → read **sage-deep `#5C6E58`** (cream text). Kelly is DEMOTED to product-only: it appears exclusively *inside* app screenshots and the M5 signal-card replica (that's the product's chrome, i.e. content — honest). Landing chrome never uses it.
- **clay `#B0703C`** → demoted to trace: the baseball half of the M4 diptych grade + nothing structural.
- **photo grade "pine→amber duotone"** → **sage→cream grade**: shadows toward sage-ink, mids toward sage, highlights lifted to cream. Airy morning, never murky.

**Implementation note (saves the in-flight lanes):** the respec lands at the token layer in `src/components/marketing/first-light/first-light.css` — `--fl-pine` and `--fl-green` keep their names but are REPOINTED to `#2E3A2C` / `#5C6E58`, and the new `--fl-sage-*` / `--fl-cream*` tokens are added as first-class names. Existing lane work referencing the old vars recolors automatically; new work uses the sage names. Never hardcode the old hexes.

**Contrast rules:** body + display ink on cream = sage-ink (≈10:1). Sage `#94A38A` is decorative/large-display only. Cream-on-sage-deep ≈ 4.8:1 (AA normal text) — verify per surface.

**Mood sentence for every builder:** *the page lives in daylight now — if a frame reads dark, moody, or murky, it's off-spec.*

---

## ⚠ AMENDMENT 2 — IMMACULATE (2026-07-02 PM, Nick directive: "I don't want basic cards and basic components… we did research on this, we need to use it. Same with the backdrop and gradient. The landing page needs to be immaculate.")

This amendment applies the repo's own premium research — `docs/redesign/marketing-overhaul-2026-06-18/research/04_premium_aesthetic_system.md` (THE reference; § numbers below cite it) and the built vocabulary in `docs/redesign/marketing-overhaul-2026-06-18/mockups/_kit/helm-kit.css` — to the First Light landing, translated to sage & cream (research says helm-green/kelly → read **sage-deep**; research §4.4's italic accent word is **overridden by Nick's standing no-italic rule** — never italicize).

### A. Backdrop & gradient system (§3 — "the cream should never be a flat fill")
New shared utilities in `first-light.css` (foundation lane owns; moments consume):
1. **`.fl-aurora`** — the cream field of the page (behind M2/M5/M6/M7) becomes a low-chroma sage aurora: `background-color: var(--fl-cream)` + 4 radial blobs — `radial(40% 50% at 15% 20%, rgba(sage,0.10))`, `radial(45% 55% at 85% 15%, rgba(sage-mist,0.55))`, `radial(50% 60% at 75% 85%, rgba(sage-deep,0.07))`, `radial(40% 45% at 25% 90%, rgba(cream-high,0.9))` — all `transparent ~70-75%`. Optional 32s `aurora-drift` keyframe (background-position only), killed by reduced-motion; no `background-attachment: fixed` on mobile.
2. **`.fl-light-pool`** — soft radial pool behind hero copy and each section anchor (M2 statement, M5 card, M7 stats): `radial(ellipse at center, rgba(cream-high,0.9), transparent 60%)` + `blur-2xl`, `pointer-events-none -z-10` (§3.3).
3. **`.fl-cta-glow`** — sage bloom under primary CTAs only: `::after inset -40% -20%, radial rgba(sage-deep,0.28) → transparent 65%, blur(28px)`, opacity 0 → 1 on hover/focus (§3.4). **≤2 glows per viewport, ever.**
4. **Grain stays** (recipe already correct) but flip `.fl-grain` on cream sections to `mix-blend-mode: multiply` (§3.2 — multiply sinks grain into cream warmly; overlay reads digital).

### B. Card & component craft (§1.3, §2, §5 — kills "basic cards")
5. **The specular recipe on every elevated light surface** (THE 80% move, §1.3A): `box-shadow: inset 0 1px 0 rgba(cream-high,0.9), <layered shadow>` + `ring-1` hairline (`sage-mist/60` on cream, `sage-ink/6` for glass edges). Add shadow tokens to first-light.css: `--fl-shadow-sm/md/lg` = the research's stacked warm shadows with `--fl-sage-ink-rgb` in place of ink (never a single hard `rgba(0,0,0,.1)`).
6. **Glass discipline (§2.4):** glass = chrome only. **M6's three vignettes convert from `fl-glass-2` to solid cards** — `bg cream-high`, specular + ring + `--fl-shadow-sm`, hover-lift (−4px + shadow swell, §5.3). M5's signal card stays glass (it floats over the gradient band = atmosphere) but gains the specular lip + dark hairline edge; M4's portal cards stay glass over photography (chrome over scene) with the double-bezel.
7. **The ONE featured element (§5.6):** M5's signal card gets the masked 1px conic gradient ring — `conic from 180deg: rgba(sage-deep,0.5) → rgba(sage,0.15) → rgba(brass,0.4) → rgba(sage-deep,0.5)` — the page's single gradient-ring moment. Nothing else gets one.
8. **CTAs become button-in-button (§5.1 + helm-kit `.btn`):** every primary CTA (M1, M8, GlassNav) carries the trailing icon in its own `h-7 w-7 rounded-full bg-[rgba(cream-high-rgb),0.15]` circle that translates diagonally on group-hover; press physics `active:scale-[0.98]`; spring easing `cubic-bezier(0.34,1.56,0.64,1)`; `.fl-cta-glow` under M1 + M8 primaries.
9. **M8 primary goes magnetic (§5.2):** cursor-follow translate ×0.25 with spring return — desktop pointer-fine only, dead under reduced-motion.
10. **Links get the underline wipe (§5.5):** footer + nav text links — sage-deep 2px `background-size 0%→100%` wipe, `--ease-cine`.

### C. Photography (§1.4 — anti-stock rules)
11. Every photo (hero, golf, baseball, mist) gets `filter: saturate(0.92) contrast(1.02)` under its grade.
12. **Hero must dissolve into the page at rest** — add a static bottom veil (last ~14% of frame: `linear-gradient(to top, var(--fl-cream), transparent)`) so M1 hands into M2 with no hard seam even before the exit-scrub; keep the scrub brighten on top.
13. One directional corner light per photo moment (`h-96 w-96 radial rgba(sage,0.18) blur-2xl`, one corner, off-center) — the "morning sun you never see."

### D. Typography details (§4)
14. `text-wrap: balance` on all display headlines; `text-wrap: pretty` on leads. Body `leading-[1.65]`, `max-w-[68ch]`. Stats/numerals `tabular-nums`. Serif never below ~h3 size. **No italic accent words (Nick rule — overrides research §4.4).**

### D2. MORE CREAM, NO WHITE (Nick directive 2026-07-02 ~16:20 — overrides anything lighter elsewhere)
Nothing larger than a hairline/specular highlight may render at or near white (#FFFFFF or #FBF9F2 as a FILL). `--fl-cream-high` is demoted to: 1px specular lips, text-on-dark, and ≤2px accents ONLY. All larger light surfaces use `--fl-cream` (#F5F1E6) or warmer:
- `.fl-card` background: NOT cream-high — use `linear-gradient(180deg, rgba(var(--fl-cream-high-rgb),0.55) 0%, var(--fl-cream) 18%)` so only the top edge catches light and the body is true cream.
- `.fl-light-pool` + the aurora's bright blob: cream (rgba(--fl-cream-rgb,…)), never cream-high.
- Auth panel glass + any glass fills: cream-tinted (--fl-cream/--fl-ecru rgba), never cream-high, never white.
- Input wells: cream-tinted per the scenes amendment (already spec'd — reaffirmed).
- The page field itself should read richly cream, not pale — where a section looks washed/blank-white in frames, deepen toward cream, add the aurora, or warm with sage-mist; never resolve toward white.

### E. The final gate (§7 — run before any frame reaches Nick)
Grayscale test · effects-off test · squint test · ≤2 glass per viewport · ≤2 sage glows per viewport · exactly one hero moment per viewport-story · 8px audit · reduced-motion audit. Fable judges rendered frames against this gate — code review alone does not pass a moment.

## ⚠ AMENDMENT 3 — BRAND & ARCHITECTURE (2026-07-02 ~16:30, Nick: "really work hard on this… integrate branding, golf and baseball, and the helm. It looks sleek but need better looking components and architecture.")

### ⚠ A-OVERRIDE (Nick, 2026-07-02 ~18:00, after seeing frames: "That's not my logo… and doesn't give sports on landing. I like other pages tho.")
1. **THE REAL LOGO, NOT LINE-ART.** The traced HelmMark does NOT represent the brand to Nick. Nav lockup + auth masthead use the ACTUAL logo asset (public/Helm-Logo-New-Main.png family — pick the correct crop/transparent variant per surface, next/image, proper alt). **The logo is exempt from the kelly demotion — a logo is content, not chrome.** HelmRosette may remain as abstract section punctuation (it doesn't claim to be the logo); the footer watermark may use the real mark at low opacity.
2. **SPORTS HIT BY VIEWPORT ~3.** Moment order becomes M1 → M2 → **M4 (two fields)** → M3 → M5 → M6 → M7 → M8 → M9. Hero gains a quiet two-sport chip row under the CTAs (real sport sub-marks or SportGlyph + "GolfHelm / BaseballHelm", linking to #fields / the portals). M3's placeholder screens become sport-obvious replicas (golf leaderboard w/ SG numbers; baseball box score) until real captures swap in. Login/onboarding/auth pages: LOCKED — Nick approves them as-is; no further changes without his ask.

### A. The Helm mark — the brand thread
The real mark exists: `public/Helm-Logo-New-Main.png` — an 8-spoke ship's-helm wheel with a ship silhouette inside (kelly, flat). Kelly raster NEVER appears on landing/auth chrome. Instead:
1. **`brand/HelmMark.tsx`** (foundation owns): a faithful SVG **line-art** tracing of that wheel+ship geometry — stroke-based ~1.5px, `currentColor`, sizes via prop. Renders sage-ink on cream, brass where jewelry, cream on sage-ink bands.
2. **`brand/HelmRosette.tsx`**: the wheel simplified to ring+8 spokes (no ship), 10–14px — the section punctuation. The eyebrow hairlines of M2/M5/M7 meet a brass rosette at center instead of bare line ends.
3. **GlassNav**: lockup = HelmMark (18–20px, sage-ink) + "Helm Sports Labs". No more type-only brand.
4. **M9 footer**: the wheel as a large quiet watermark — ~280px, brass at 5–7% opacity, right-anchored behind the link columns.

### B. Golf + baseball woven through (not just named)
1. **M4 halves carry their sport's line-motif** over the photo grade, cream at ~8%: golf = horizon + flag + green-contour arcs (the coastal scene language); baseball = the chalk foul-line V + base-path arc (EntryField's exact geometry — continuity into the login the visitor is about to meet).
2. **M4 portal cards** carry small line-art sport marks derived from `public/helm-golf-logo*` / `public/helm-baseball-logo*` geometry (builder inspects the PNGs, traces simplified stroke versions — wheel-plus-sport, never the kelly raster).
3. **M6 vignette headers** get a tiny sage sport glyph each (passport→baseball, lift→barbell/plate circle, readiness→neutral rosette).

### C. The gold thread (brass = brand gold)
1. One brass. Audit every gold-ish value to rgba(var(--fl-brass-rgb),…) — no ad-hoc ambers.
2. **One signature gold moment on the page**: M7's founder line sits on a brass rule that draws in and carries a single slow glint sweep on first entry (1px traveling highlight, once, then still). The ONLY animated gold.
3. On sage-ink bands (M3/M9) brass hairlines run ~+10% opacity so the gold reads against depth.

### D. Architecture — kill centered-everything (research §6.2; the page alternates)
Set pieces earn center (M1, M3, M8 stay centered). Editorial moments break the axis:
1. **M2 → asymmetric editorial split**: serif statement left (1.1fr), the ledger right (0.9fr, translate-y-8 stagger). Mobile stacks clean.
2. **M6 → asymmetric 6-col bento**: one dominant tile (col-span-4 — readiness, with a small real sparkline idiom from animated-number/ledger language) + two stacked col-span-2 tiles. Sizes deliberate, one job per tile, no equal-thirds row. No new glows (budget spent).
3. **M7 → left-weighted**: founder + refusals left column; the 1–2 real stats right as a tabular ledger block.
4. **M5 → off-axis**: the signal card sits right-of-center; "No signal ships without its source." becomes a large serif margin-note anchored left. The gradient-ring stays on the card.
Every moment must still pass §E (grayscale/squint/8px) after the re-architecture.

---

## The concept — **"First Light"**
One Helm. Two fields. The visitor arrives at dawn — quiet, cinematic, unhurried (the Teevo "slow you down" register) — and the page *earns* belief by showing the real product, staged like it matters. The landing is photographic cinema; the login/onboarding are the hand-painted scene world; **glass, light, serif, and green** tie every step into one material system. Door → hallway → house.

**The reaction we're designing for:** *"wow — they put a lot of time and effort into this."* Achieved through restraint + craft density, never spectacle.

## Design decisions (made, with reasoning)
1. **Type: Fraunces display + Space Grotesk UI** — the product IS Living-Annual now; the marketing site must open into it without a costume change. (Honest flag: the retired 2026-06-18 "Heritage" docs claim Fraunces was once rejected — that ban belonged to a golf-club-crest concept that's now dead. Product coherence wins. Nick can veto.)
2. **Palette — the bridge:** ecru/bone field `#F5F1E6` · deep pine bands `#143527` · warm clay accent (baseball) `#B0703C` · **kelly green `#16A34A` as the ONLY saturated accent** (the product's green — used for CTAs + live signals only) · brass hairlines `#B08D57` for glass edges. Muted-organic (his refs) meeting the app's cream+green.
3. **Hero medium: graded photography** (portrait-tall, dusk/dawn field — sport-ambiguous light + turf + sky). The painterly SVG world starts at login. Film poster vs title sequence.
4. **Glass grammar** (from the cookbook, 3 grades): G1 hairline glass nav pill (always) · G2 floating glass cards over photography (the Nordic-Greens move — product proof, sport portals) · G3 deep glass panels (auth forms). Every glass surface: blur+saturate, top edge-light, inner grain, WKWebView fallbacks. Budget: ≤2 blurring layers per viewport.
5. **Scroll: the spine of the experience (Nick's mandate — Apple-grade, buttery, never basic).** Lenis inertial scroll at root (lerp 0.08–0.1 — the weighted-glide feel), tuned per the repo's own apple_scroll_playbook. **The choreography doctrine:** 3 scrubbed MASTERPIECE sequences (M1→M2 exit, M3 product cinema, M4 diptych) where scroll drives the animation timeline 1:1 — everything between them stays calm (staggered mask reveals on entry only) so the set pieces land. Scrubbed sequences use transform/opacity only, GPU-safe, pinned sections via position:sticky. Mobile + reduced-motion: full static DOM with simple fade-up reveals — the story reads perfectly with zero motion.

**The scroll choreography map:**
- **M1 → M2 exit:** as you leave the hero, the photograph scales to 1.06 and darkens while the headline lifts and dissolves; M2's serif statement writes itself in line-by-line (masked reveal) timed to arrival. One continuous camera move.
- **M3 (pinned scrub, ~250vh):** the glass frame holds; app screens travel through it under scroll control (spec in M3 below).
- **M4 diptych:** the two fields slide in from opposite edges under scrub and meet at the center seam; the seam flashes a hairline of brass when they meet.
- **Numerals:** every stat rolls (the kit's StatRoll) on first entry. Buttons: press physics + magnetic-subtle hover from the interaction layer.

## The page — 9 moments (~8–9 viewports)
**M1 · HERO (100dvh, portrait cinema).** Full-bleed dawn-field photograph, graded to palette. Centered stack (Linear-confidence): eyebrow `HELM SPORTS LABS` → Fraunces headline, one italic accent word — *"The program, **seen** clearly."* (copy TBD w/ Nick) → one quiet line → two CTAs: **See it in action** (green, coach) + **Join your team** (ghost, player). G1 glass nav floating. Motion: near-still — slow 1.02 scale drift on the photo, grain, staggered mount reveal. No parallax circus.

**M2 · CLARITY (ecru editorial).** The what-is-it moment the old page never had. One serif statement: *"Helm is the operating system for college programs — roster, schedule, stats, and an AI that reads the game with you."* Three hairline-ruled ledger lines (not cards): Run the program / See every number / Know what matters. Graphite numerals, green rules — the app's own idiom, pre-echoed.

**M3 · PRODUCT CINEMA (deep pine band) — THE scroll set piece.** Pinned Apple-style scrubbed sequence (~250vh of scroll driving one scene): the G2 glass desktop frame holds center while REAL Living-Annual screens glide through it under scroll control — Command Center → Stats Center → Decision Room — each screen sliding up inside the glass as a caption ledger line writes itself in below (masked line reveal, scrub-linked). A phone frame arcs in from the right at the midpoint carrying Lift Lab. Scroll velocity maps to screen travel 1:1 — scrub back and it reverses. This is the "they put SO much effort in" moment.

**M4 · TWO FIELDS (the portal fork).** Sport-agnostic answered Apple-two-models style: a full-width diptych — golf dawn left, baseball dusk right (graded to one light language), each a G2 glass card: GolfHelm / BaseballHelm, one line each, enter-arrows. Hover: the field brightens, the other dims slightly. Mobile: stacked portals.

**M5 · THE INTELLIGENCE (ecru → pine gradient).** CoachHelm/signals showcase: one real signal card (source drawer, confidence score, limitation — the honesty IS the flex) rendered large in glass. Line: *"No signal ships without its source."*

**M6 · FOR THE PLAYER (warm moment).** The player is an audience, not an afterthought: passport completeness, lift-lab check-in, readiness — three small glass vignettes. Copy speaks to the athlete, not the buyer.

**M7 · HONESTY BAND (pre-revenue social proof).** No fake logos. The founder line (two former collegiate athletes), what Helm refuses to claim (promoted from the About research), a live-product stat or two. Quiet confidence.

**M8 · FINAL CTA (full-bleed misty photo inset).** Centered serif ask + the dual CTA pair again. Demo path = calendar link; player path = invite-code entry.

**M9 · FOOTER.** Pine field, both sports, both logins, real links (fix: current footer hardcodes golf-first paths; dead "Request Demo" button gets a real handler).

## CTA architecture (fixes the current page's zero-signup problem)
- **Coach (buyer):** "See it in action" → demo request w/ calendar; secondary "Explore the platform" scrolls to M3.
- **Player (user):** "Join your team" → invite-code flow (roster joins are invite-based — never "Start free" for unknown visitors).
- Nav pill: Log in (sport chooser popover) + See it in action. Every CTA has a real handler — no dead buttons.

## Continuity into the app (the whole point)
Landing M1's dawn light → login's painterly scene (ENTRY_SCENES_DESIGN.md: baseball "Yard at Dusk" / lift "Iron Room at Dawn" / golf's existing coastal) → onboarding's scene-comes-alive arc → the cream Living-Annual app. Same glass, same serif, same green, four brightness stops. A visitor never feels a seam.

## Build plan (Sonnet wave, after Nick's nod)
1. `landing-hero+nav` (M1 + G1 glass nav + Lenis root) · 2. `landing-editorial` (M2, M5, M6, M7) · 3. `landing-cinema` (M3 product staging + screenshot pipeline) · 4. `landing-portals+cta` (M4, M8, M9 + CTA handlers + demo/invite flows) · 5. `entry-scenes` (YardScene/HomePlateScene/IronRoomScene per the scenes spec) · 6. `auth-reskin` (glass panels + scenes wired into login/onboarding/lift-lab flows from the Front Door wave). File-disjoint; PRs into batch; design-bar checklists; desktop+390px proof shots required in every PR.
**Asset needs from Nick (or AI-gen approved):** 2 portrait dawn/dusk field photographs (or approve AI-generated cinematic stills, graded to palette).
