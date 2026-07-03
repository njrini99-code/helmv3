# GolfHelm Dashboard — Premium / Professionally-Engineered Scrub Criteria (2026-06-21)

The bar: **every feature must be indistinguishable from a professionally engineered,
feature-complete, premium SaaS app.** Nothing may fail; no feature may look "off,"
unfinished, or non-premium; every sub-feature must be thought through and wired
end-to-end. Be harsh — a feature that "works" is not the bar; a feature a paying
power-user would call flawless is.

Synthesized from: feature-finisher skill (4-layer completion), modern-saas-ui skill
(de-vibe), Nielsen's 10 heuristics, Agile Definition-of-Done, WCAG 2.2 AA, and 2026
premium-SaaS-dashboard research. Sources listed at the bottom.

> SCOPE: the **live Fairway/redesign path** (`NEXT_PUBLIC_REDESIGN=true`,
> `isRedesignEnabled()`), i.e. `src/components/fairway/pages/**` + the dashboard
> routes that mount them. The legacy flag-off fork is being retired — do NOT grade it.

---

## A. Maturity scale (grade EVERY feature 1–4)

| Layer | Name | Bar |
|---|---|---|
| 1 | FUNCTIONAL | happy path works, desktop only, minimal error handling |
| 2 | COMPLETE | does what's expected, basic errors, mostly-mobile |
| 3 | **POLISHED** ← min ship bar | all edge cases, graceful error recovery, full a11y, perf-optimized, every state designed |
| 4 | LEGENDARY | anticipates needs, proactive, learns, delights |

**Any feature below Layer 3 is a finding.** Record current layer + the exact gap to reach 3 (and the reach to 4).

---

## B. Hard pass/fail gates (a FAIL on any = CRITICAL, blocks "premium")

1. **End-to-end wiring** — every interactive control (button, toggle, link, form,
   menu item, tab) has a real handler that reaches a server action / route / DB and
   the result is reflected in the UI. No dead buttons, no `onClick` that no-ops, no
   link to a route that ignores its params, no write to a column that doesn't exist,
   no read of a field the query never selected.
2. **Sub-feature completeness** — every sub-feature implied by the UI actually exists
   (e.g. a "filter" that filters, an "export" that exports, a "search" that searches,
   an empty-state CTA that does something, a "see all" that goes somewhere real).
3. **The three states are designed, not default** — every data surface has a real
   **loading** (skeleton, not spinner-on-blank), **empty** (helpful, with a next
   action), and **error** (explains + offers retry; never a cheerful empty masking a
   failure) state.
4. **No data lies** — numbers are correct, honestly sourced, never fabricated 0s/—,
   pagination respects the PostgREST 1000-row cap, timezones correct, deltas/trends
   real.
5. **Auth/permission correctness** — coach-only stays coach-only, player-only stays
   player-only, no IDOR, active-team scoping honored.
6. **No crash / no console error** on mount, interaction, empty data, or error.

---

## C. UI/UX premium bar (modern-saas-ui + pro-vs-amateur research)

**C1 — De-vibe (the screenshot test, applied to the component):**
- Grayscale test: hierarchy still clear without color.
- Effects-off test: still premium with glass/glow/motion removed.
- Squint test: exactly ONE primary action per screen is obvious.

**C2 — Foundation discipline (amateur tells):**
- Spacing on a consistent 4/8/12/16/24/32 scale; no arbitrary one-off paddings.
- ≤3 type sizes in play, one dominant; no font soup.
- 2 radii max (cards ~16, inputs ~8) used consistently.
- 1 brand accent (helm green), rest neutral; no clashing/competing colors.
- Everything on an 8px grid; nothing visibly misaligned.
- Design tokens only — no arbitrary `bg-white`, `text-[NNpx]`, hex literals,
  emerald/legacy colors. (helm/* lint rules encode this.)

**C3 — Dashboard structure (where applicable):** KPI row (3–7 metrics, each with
label + value + delta + trend) → trend band → action table. Dense data on SOLID
surfaces (never glass). Glass only on chrome (nav, toolbars, overlays, sheets).

**C4 — Tables:** sticky headers, row hover, consistent row height, multi-select +
bulk actions where it matters, solid background.

**C5 — Motion:** a small reused budget (fade/slide 150–220ms, hover-lift, expand);
feedback-not-flashy; `prefers-reduced-motion` honored.

**C6 — Microcopy:** human, jargon-free, on-brand; empty/error copy is helpful and
specific, never "Something went wrong."

---

## D. Nielsen's 10 heuristics (each is a checkable line)

1. Visibility of system status — every action gives immediate visible feedback
   (optimistic UI / pending / saved / toast).
2. Match to real world — user language, no DB/jargon leaking to UI.
3. User control & freedom — undo / cancel / back / escape from any state; no traps.
4. Consistency & standards — identical patterns/terms/icons across features.
5. Error prevention — constraints, sensible defaults, confirmations on destructive acts.
6. Recognition over recall — options visible, not memorized.
7. Flexibility & efficiency — shortcuts for frequent actions (⌘K, keyboard).
8. Aesthetic & minimalist — progressive disclosure, no data-vomit.
9. Help users recover from errors — plain-language errors that say what + how to fix.
10. Help & documentation — contextual help/empty-state guidance where needed.

---

## E. Definition-of-Done per feature (every box must be true)

```
STATES      [ ] loading (skeleton)  [ ] empty (+CTA)  [ ] error (+retry)  [ ] success/optimistic feedback
RESPONSIVE  [ ] mobile parity (not just "renders")    [ ] touch targets >=44px   [ ] no horizontal scroll
A11Y(WCAG22 AA) [ ] text contrast >=4.5:1 (3:1 large) [ ] visible focus (>=2px, 3:1) [ ] full keyboard operable
            [ ] focus order logical [ ] focus not obscured [ ] labels/aria on controls [ ] images alt
DATA        [ ] correct + honest    [ ] paginated past 1000 [ ] timezone-correct  [ ] bulk ops where useful
            [ ] search/filter works [ ] export where useful  [ ] handles 10x data + 0 data
COMMS       [ ] right notifications  [ ] real-time where valuable  [ ] sharing/visibility correct
WIRING      [ ] every control wired  [ ] connects to logically-related features  [ ] no orphaned/dead UI
DELIGHT     [ ] remembers prefs      [ ] undo where applicable     [ ] one tasteful hero moment, not flashy
```

---

## F. Finding output contract (per finding)

- `feature`, `sub_feature`
- `severity`: critical (a hard-gate B FAIL — broken/dead/data-lie/crash/a11y-blocker) ·
  high (below Layer 3 in a way users hit often) · medium (polish gap) · low (nit)
- `dimension`: wiring | completeness | states | ui-foundation | a11y | nielsen | data | mobile | motion | microcopy | delight
- `current_layer` (1–4) and `target_gap` (what reaches Layer 3)
- `file` (file:line), `evidence` (the exact code), `recommendation` (concrete fix)
- `is_premium_blocker`: true if this alone makes the feature look unfinished/non-premium or fail

Be HARSH. Prefer reporting a borderline issue over missing it. A 3-equal-buttons
screen, a spinner-on-blank, a `bg-white` arbitrary surface, a dead "Export" button, a
filter that doesn't filter, a contrast fail, a non-keyboard-operable menu, a fabricated
"0", a mobile layout that breaks — all are findings.

---

## Sources
- NN/g — 10 Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- WCAG 2.2 (W3C): https://www.w3.org/TR/WCAG22/ · WebAIM checklist: https://webaim.org/standards/wcag/checklist
- Atlassian — Definition of Done: https://www.atlassian.com/agile/project-management/definition-of-done
- F1Studioz — Smart SaaS Dashboard Design (2026): https://f1studioz.com/blog/smart-saas-dashboard-design/
- GitNexa — SaaS Dashboard UX Patterns 2026: https://www.gitnexa.com/blogs/saas-dashboard-ux-patterns
- Userpilot — SaaS UX best practices: https://userpilot.com/blog/saas-ux-design/
- Creative Market — detecting amateur design: https://creativemarket.com/blog/detect-amateur-designer
- Internal skills: `.claude/skills/feature-finisher`, `.claude/skills/modern-saas-ui`
