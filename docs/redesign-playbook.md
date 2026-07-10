<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: Describes itself as the operating contract for the flag-gated "Fairway" redesign (locked 2026-05-30). `grep -rl NEXT_PUBLIC_REDESIGN src/` now returns only 1 hit — Fairway is effectively the shipped-default UI (278 files under src/components/fairway/), not a flag-gated experiment.
KEPT FOR HISTORY -- do not delete this file.
-->

# GolfHelm Redesign Playbook

> The operating contract for the flag-gated "Fairway" redesign. Locked 2026-05-30.
> Nothing is "done" on a green build. It is done when a fresh screenshot passes the rubric.

This exists because the redesign kept regressing (white cards, serif fonts, dead
whitespace, fabricated numbers) and I kept reporting "looks good" before actually
looking. This playbook removes that failure mode: a locked visual reference, a
coach-centric information model, a hard pass/fail rubric, and a loop where the
gate is a screenshot — not my word.

---

## 0. Hard constraints (never violated)

- **Flag-off is legacy, byte-for-byte.** Every change is additive behind
  `isRedesignEnabled()` / the `.fairway-ds` scope. Legacy routes must render
  identically with the flag off.
- **Preserve all plumbing.** No data loader, server action, mutation, prediction
  pipeline, or input (shot tracking, forms) is altered by a redesign. Presentation
  only. A redesigned page consumes the SAME props the route already fetches — it
  never adds a fetch.
- **Credentials only in `.env.local`.** Never inline secrets.
- **Black sidebar + helm green (#16A34A) + warm cream** stay the identity.

---

## 1. The locked visual reference (the approved base)

This is the look the user approved ("this specifically looks good, there's
contrast"). It is the floor, not the ceiling — we push style HARD on top of it,
but never below it.

| Axis | Locked value |
|---|---|
| **Display / sans type** | SF system stack — `-apple-system, BlinkMacSystemFont, "SF Pro Display"/"SF Pro Text", …`. **No Fraunces, no serif.** |
| **Numbers** | Fragment Mono (`font-fw-mono`), tabular. Big and confident for focal reads. |
| **Cards** | Warm **cream** — `--fw-color-surface: oklch(0.984 0.016 86)`. **Never cold white.** A card lifts off the page by hairline + soft shadow, not by being white. |
| **Page** | Champagne radial→linear gradient (`--fw-gradient-canvas`), warm top → deeper foot. |
| **Panels** | Flat matte — `InstrumentPanel` depth `base`/`raised`/`inset`. Hairline + soft shadow. **No glass on content** (glass is reserved for overlays/menus). |
| **Charts** | Flat only — `Ribbon` (filled line), bars, dots. **No skeuomorphic gauges/dials/bezels.** |
| **Accent** | Green is the *single* accent (positive / active / primary action). Used sparingly, never as a wash. |

Exact tokens live in `src/styles/design-tokens.css`. Tailwind bridges them in
**both** `tailwind.config.js` (the active one) and `tailwind.config.ts` — edit
both, and **restart dev** for config changes (CSS token changes are HMR-live).

---

## 2. The new mandate (push these on every surface)

1. **Style-forward.** One clear focal hero per surface, intentional rhythm,
   editorial confidence. Not a grid of equal cards.
2. **Whitespace-tight.** No dead vertical bands, no half-empty panels, no oversized
   paddings that leave voids. Density *with* breathing room — fill what you frame.
3. **Coach-workflow-centric.** Organize by what a coach *does*, not by data type
   (§3). The coach's mental model is the information-architecture spine.
4. **Creative layout.** Asymmetric focal compositions, inline visual encodings
   (status dots, sparklines, small bars), grouping by job-to-be-done.
5. **Simple for non-tech coaches.** Plain-English labels, ONE obvious primary
   action per surface, no jargon, legible sizes, an unmistakable "what do I do
   next."

---

## 3. The coach mental model (what a coach actually wants noted)

A college golf coach's loop, in priority order. Every coach surface should answer
these top-to-bottom — **triage → is-it-working → pulse → what's-next** — instead
of showing equal-weight KPI tiles.

1. **WHO needs me right now?** — players trending down, flagged, or about to
   compete. *(Triage — the focal hero.)*
2. **WHAT should we work on?** — the team's biggest strokes-gained leak; each
   player's one focus. *(Priorities.)*
3. **IS IT WORKING?** — are my insights/interventions actually improving outcomes?
   This is the trust loop — show it or the coach stops believing the AI.
4. **Form at a glance** — roster readiness, recent rounds, who's hot/cold. *(Pulse.)*
5. **What's coming** — qualifying, events, schedule. *(Calendar.)*

A surface only shows the slices its data supports — it never fabricates a slice
to fill the model.

---

## 4. The rubric (the adversarial gate — every box must pass)

A route is judged on a **fresh flag-on screenshot**, not on the diff. ANY failed
box sends it back to BUILD. The visual-critique reviewer is adversarial: it tries
to fail the screenshot.

- [ ] **Cream, not white** — no card reads as cold white. (Sample surface pixels / computed bg.)
- [ ] **SF, not serif** — headings render SF system, not Fraunces.
- [ ] **No skeuomorphic gauges/dials** — numbers flat; charts flat (line/bars/dots).
- [ ] **Numbers formatted** — no raw fractions (`0.53`), no `10000%`, no `—` where
      data exists; percentiles read `92nd`, scores read `/100`.
- [ ] **One masthead** — sections don't repeat the page title; no duplicate headers.
- [ ] **No dead whitespace** — no large empty bands, no half-empty panels; the hero is filled.
- [ ] **One focal hero** — the eye lands somewhere first.
- [ ] **One obvious primary action** — a non-tech coach knows what to click.
- [ ] **Coach-workflow order** — triage → working → pulse (§3), not random tiles.
- [ ] **Legible + plain** — plain-English labels, readable sizes, green used sparingly.
- [ ] **Honest empty states** — dim "awaiting" instruments, never fabricated numbers.
- [ ] **Flag-off unchanged** — legacy route still byte-for-byte legacy.

---

## 5. The loop (per surface — small batches, 1–2 at a time)

```
SPEC  →  BUILD  →  GATE-CODE  →  SHOOT  →  CRITIQUE  →  LAND
                       ↑__________________________|
                      (any rubric fail → back to BUILD)
```

1. **SPEC** — write the coach-workflow layout (focal / secondary / tertiary by
   job-to-be-done, §3). For high-value surfaces, generate a small judge-panel of
   directions (triage-first / is-it-working / form-pulse), score them, synthesize
   the winner. Specs use ONLY data the route already fetches.
2. **BUILD** — implement additively behind the flag. Preserve every loader/action/input.
3. **GATE-CODE** — `npm run typecheck` (0 errors), `npm run build` (green),
   flag-off diff clean.
4. **SHOOT** — `npm run ui:refresh -- <route>` (boots flag-on dev if needed,
   re-auths, captures, tags `redesigned`, rebuilds atlas).
5. **CRITIQUE** — adversarial reviewer screenshots + judges against §4. Any fail → BUILD.
6. **LAND** — only on a full rubric pass. Now it's "done."

**The cardinal rule:** never say "looks good" without a fresh screenshot in hand
and the rubric checked. The screenshot is the gate, not the build log.

---

## 6. Tooling

- `npm run ui:refresh -- <route|folder>… | --redesigned | --all` — re-shoot landed
  routes against the flag-on app and swap them into the atlas inventory.
- `npm run ui:atlas` — rebuild `ui-intelligence/atlas.html` from `catalog.json`.
- Visual checks when image reads are constrained: DOM `getComputedStyle` color
  assertions, or `SendUserFile` the PNG for the user to eyeball.

---

## 7. Rollout order

Coach surfaces first (highest leverage, the coach is the buyer):
**Brief → Signals → Players/Development → Analytics → Patterns** → then Stats,
Rounds, Roster, Team-ops, Settings, Admin → finally Public/Auth.
