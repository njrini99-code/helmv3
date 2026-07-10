# Mobile Doctrine

Repo-wide rules for phone-class surfaces (golf, baseball, Bridge). Distilled
from the 2026-07-09 nine-reviewer mobile audit and the owner's brief: "Need
more native and centered — not like a copy-and-paste slim-down"; "too full and
crammed, lotta scrolling, not segmented"; "PREMIUM ARCHITECTURE, EVERY PAGE
HAND-CRAFTED AND THOUGHT OUT — that goes for desktop too."

Execution waves and per-surface grades live in the mobile overhaul plan
(see PR #797 and successors). This file is the standing law; cite the rule
number in reviews.

## The rules

1. **Home = triage, never an aggregator.** A home surface shows the next
   action, live counts, and links into detail tabs. It must never re-render
   the full body of a destination that owns its own tab.
2. **Above-fold budget.** The primary action is reachable in the first
   viewport at 390px. Editorial mastheads (eyebrow + long title + paragraph)
   are desktop cover treatments — on phone they condense to one line.
3. **Cap the scroll at ~3 screen-heights.** Beyond that: segmented control,
   tabs, collapsed-by-default sections, or push to a route. Empty sections
   never render — they roll into one "all caught up" card.
4. **Bottom sheets, not centered modals**, for every input/create flow under
   `md`. The vaul Sheet primitive already ships in-repo.
5. **Thumb-zone commits.** Sticky bottom action bar for the primary CTA on
   any decision/entry screen; never scroll-to-save.
6. **More-sheet, not left drawer.** The 5th bottom-nav slot opens a
   thumb-reachable bottom sheet listing overflow destinations.
   Hamburger-top-left dies on phone; the desktop rail is untouched.
7. **No desktop chrome on phones.** ⌘K pills, breadcrumb trails, hover-only
   affordances: desktop-only. One condensing chrome band on hub routes, not
   three stacked bands.
8. **Tables become cards below `md`.** Any `min-w-[###px]` table on a
   phone-primary surface renders as full-width rows (identity + 2–3 key
   stats + tap-through).
9. **Tab switches are instant.** No cross-fade between bottom-tab roots;
   motion is reserved for forward/detail pushes. Reduced-motion disables all.
10. **Bottom nav = the role's actual daily loop** (4 destinations + More),
    declared in the nav registry — a daily destination must never be
    overflow-only.
11. **No full-screen monolith cards — every page is composed.** A single
    card/panel stretched to the viewport as the screen's whole composition is
    banned (same vibe-coded tell-class as the retired accent-stripe cards).
    Compose: inset grouped sections, mixed row/card rhythm, deliberate
    hierarchy per surface.

## The craft bar (mobile AND desktop)

- Every UI change ships from a **per-surface design brief** — what the screen
  is for, its above-fold statement, its rhythm — never "make it responsive."
- Waves get **taste verification** (does it look hand-crafted and native?) in
  addition to diff-correctness verification.
- Desktop is judged to the same bar: density, alignment, composition.

## Performance floor (phone-class GPUs)

- No `backdrop-blur` on scrolling chrome below `md` (top bars, bottom navs).
- One route fade, one owner (`template.tsx`); never a second pathname-keyed
  fade in the shell.
- framer-motion only via `LazyMotion` + the async loader at
  `src/lib/motion/load-features.ts` (domAnimation only — no layout
  animations).
- `React.memo` on shell chrome must not be defeated: element props passed
  into `AppShell` (`brand`, `sidebarFooter`, `topBarActions`, …) are
  memoized at the call site.
- Realtime subscriptions on chrome (badges, unread counts) are filtered to
  the current user/team — never org-wide.
