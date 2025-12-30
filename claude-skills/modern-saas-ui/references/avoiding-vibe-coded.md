# How to Avoid Vibe-Coded UI

Research-backed recommendations for building a premium look and feel.

**Definition**: "Vibe-coded" = effects applied first, structure solved later. Research describes the same failure: weak hierarchy, inconsistent standards, visual noise that fights usability.

**Premium UI** feels calm and inevitable—built on a coherent system of hierarchy, spacing, typography, and conventions.

---

## 1. Start with Hierarchy, Not Effects

NN/g defines visual hierarchy as guiding the eye to the most important elements through scale, contrast, spacing, placement, and grouping. When hierarchy is weak, teams compensate with gradients, glow, blur, motion—creating a template skin rather than an intentional product.

**Actions**:
- **Make one thing dominant per screen** — Use size, weight, placement to create clear primary action/information
- **Use grouping and proximity** — Tell users what belongs together; forms look premium when fields are grouped with whitespace
- **Do a grayscale test** — If meaning collapses when color/effects removed, hierarchy is doing too little

---

## 2. Systematize Spacing and Density

Premium UIs feel calmer because density is deliberate. Whitespace expresses grouping, priority, and breath. Material Design recommends systematic spacing (8dp grid) for visual balance.

**Actions**:
- **Adopt a spacing scale** — Pick 4/8/12/16/24/32 and use everywhere (cards, modals, tables, empty states). Eliminates "random padding" smell.
- **Control density by surface type** — Dense tables/forms on solid surfaces with clear row rhythm; atmospheric treatments for chrome only
- **Use whitespace to separate meaning levels** — Major sections get visibly larger spacing than minor groupings

---

## 3. Consistency Is What Makes UI Feel "Expensive"

"Vibe-coded" often means inconsistency: mixed radii, one-off shadows, buttons that behave differently per page. NN/g's "Consistency and Standards" heuristic: users shouldn't wonder whether different words/actions mean the same thing.

**Actions**:
- **Match patterns to intent** — One button hierarchy (primary/secondary/tertiary) used consistently. No "special" CTA style per page.
- **Standardize component geometry** — Pick 1-2 radii (e.g., 12 for containers, 10 for inputs) and stick to them. Random radius changes = template tell.
- **Follow conventions unless you have measurable reason not to** — Novel UI reads as risky, not premium.

---

## 4. Legibility Is Non-Negotiable

Trendy visuals become "vibe" when they reduce legibility. WCAG requires sufficient contrast for text (1.4.3) and UI components (1.4.11). Glass effects are risky because background visibility means contrast changes with content.

**Actions**:
- **Design for worst-case backgrounds** — Test glass panels over busiest plausible content; if you squint, increase opacity, calm background, or go solid
- **Make interactive states obvious** — Hover/focus/selected states must have contrast that survives different backgrounds
- **Limit glass to chrome and overlays** — Translucency for layering (nav bars, toolbars, sheets); dense content on solid surfaces

---

## 5. Motion Should Add Meaning, Not Noise

Motion easily creates template look: too many bouncy transitions, inconsistent easing, ambient effects that don't clarify anything. Material Design frames motion as describing spatial relationships, functionality, intention. WCAG 2.3.3: interaction-triggered non-essential motion should be reducible.

**Actions**:
- **Use a motion budget** — Pick 2-4 recurring transitions (fade/slide for overlays, subtle hover lift, expand/collapse) and reuse them
- **Respect reduced-motion preferences** — Disable non-essential animation when requested
- **Prioritize responsiveness over spectacle** — Motion should feel immediate and supportive, not like a demo reel

---

## The Premium Pass Checklist

Fast way to de-vibe a screen. **Order matters**—rebuild the system, not polish the effect.

1. **Remove decorative effects** (glow/blur/noise) and verify layout still reads
2. **Fix hierarchy**: one primary focus, clear grouping, predictable section rhythm
3. **Normalize tokens**: spacing scale, radii, borders, elevation, typography scale
4. **Restore restrained effects** only where they clarify layering (chrome/overlays) or create single hero focal point
5. **Validate accessibility**: text contrast (1.4.3), component contrast (1.4.11), reduced motion (2.3.3)

---

## Quick Diagnostic

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Looks like a template" | Inconsistent tokens | Audit radii, spacing, shadows—standardize |
| "Too busy" | Weak hierarchy | Grayscale test → strengthen size/weight/placement |
| "Feels cheap" | Low contrast on effects | Test worst-case backgrounds → increase opacity or go solid |
| "Demo reel energy" | Motion without purpose | Cut to 2-4 meaningful transitions |
| "Random" | Mixed conventions | One button hierarchy, one card style, one modal pattern |
