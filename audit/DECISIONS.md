# DECISIONS — the §B five, frozen

Session `helmv3-3f`, 2026-09-07. Settles `BLOCKED.md` §B so the write phase can start,
per the plan's §3 decision-freeze.

The owner said "go auto mode, get this done". These are therefore **agent calls made on the
owner's instruction to proceed**, each grounded in evidence gathered this session rather than
taste. Every one is reversible and cheap to reverse; where a call went against an artboard,
the artboard's own value is recorded so the override is visible. Anything genuinely
irreversible — a production migration, a deploy — is NOT taken here.

---

## D-05 — Focus-ring color: **keep the tokens, take the artboard's geometry**

`--fw-color-border-focus` stays `accent-600` (light) / `accent-500` (dark). The artboard's
two-layer soft glow *shape* is adopted; its `accent-500` literal is not.

**Why.** Three-way conflict, but the sources are not equal. `AGENTS.md` states the authority
order outright — "Canonical sources, in authority order: `src/styles/design-tokens.css`
(`--fw-*` tokens) → `src/components/fairway/**` → `.claude/rules/design-system.md`. **Tokens
beat prose.**" And this particular token is not an arbitrary pick: `design-tokens.css:152-165`
documents that `fwFocusRing` already hard-coded accent-600 while **175 call sites** reached
for `ring-border-focus` directly, "every one of them drawing a ring nobody with low vision
could reliably find." Taking the artboard's accent-500 into light theme would re-open a
closed WCAG defect. An artboard literal does not get to undo an accessibility fix.

The glow *geometry* carries no contrast risk, so it is adopted — that is the part of §9.1's
"crisp edge" vs. the artboard's "glow" disagreement that can be honoured for free.

## G-55 — Action order: **Reply, Copy, Edit, — separator — Delete**

**Why, and a correction.** The manifest says "three sources, three orders". That is wrong,
and it made the decision look harder than it is. Read literally:

| Source | Order |
|---|---|
| `Actions.dc.html:42-55` | Copy, Reply, Edit, Delete |
| `Reactions.dc.html:78-91` | **Reply, Copy, Edit, Delete** |
| Plan §12.4 prose | "Proposed order is **Reply, Copy, Edit, then separated Delete**" |

Two of the three agree exactly. Only `Actions.dc.html` leads with Copy, and it is the sole
outlier. Taking the 2:1 majority — with the plan's own prose as the tiebreak — costs nothing
and contradicts no stated intent. Delete keeps its separator and its destructive color
(`oklch(0.505 0.19 27)`, identical in both artboards).

Unchanged from the plan: incoming messages omit Edit/Delete unless capabilities permit.

## G-50a — Day chip: **floating glass chip** (`Thread.dc.html`)

**Why.** The artboards disagree, but only one of them says why it looks the way it does.
`Thread.dc.html:51` carries an authored comment — `<!-- the day chip FLOATS over the thread
on glass, not inline in it -->` — immediately above the chip. That is a stated design intent.
`Group.dc.html:44`'s inline bordered pill carries no such statement and reads as the less
considered of the two. A deliberate note beats an unannotated variant.

Cost check, since this repo treats glass blur as a performance concern: the chip is a single
~90×26px element with `backdrop-filter: blur(22px)`. That is affordable. **This decision does
not license glass on any larger surface** — the masthead and sheets keep their existing
treatment.

## G-50b — Bubble max-width: **288px base**, group-incoming derived

**Why.** The three numbers are not three opinions; two are scene renders and one is a rule.
`Bubbles.dc.html:17` states it as a **class rule** — `.bub { font-size: 15px; line-height:
22px; padding: 12px 16px; max-width: 288px; }` — in the artboard whose entire purpose is
bubble grammar. `Thread.dc.html`'s 296px and `Group.dc.html`'s 268/292px are inline styles on
individual specimens in scene compositions.

Take the rule, not the specimens. Group-incoming's 268px then falls out of the same rule
minus the avatar gutter rather than needing a magic number of its own, and the 292 vs 296
spread (4px, outgoing, no gutter) is render noise. One rule, one derivation, zero magic
numbers.

## D-03a — Group member roles: **build both, invent nothing, change no schema**

The manifest framed this as "schema change, or drop the badge". There is a third answer, and
it needs neither. `GroupDetails.dc.html` shows **two** distinct things, and they have
different sources:

| Artboard element | Source | Status |
|---|---|---|
| `:89` `<span class="sub">Head Coach</span>` (coach row) | `golf_coaches.title` | **Exists in production.** Confirmed by catalog read |
| `:98` `<span class="sub">Class of 2027</span>` (player row) | `golf_players.graduation_year` | **Exists in production** (`integer`). Confirmed by catalog read |
| `:91` `Admin` pill | `golf_conversations.created_by` | **Exists in production**, `NOT NULL`. Confirmed by catalog read |

- **The subtitle is role-dependent, not one field.** The artboard shows "Head Coach" on the
  coach row and "Class of 2027" on a player row — so it is `golf_coaches.title` for coaches
  and `"Class of " || golf_players.graduation_year` for players. Either missing ⇒ render no
  subtitle, never a placeholder.
- **"Admin"** is a fact about this conversation: its creator. **Verified against the artboard,
  not assumed** — `GroupDetails.dc.html:88-91` puts the pill on the `Nick Rini (you)` row, and
  `:60` reads "9 members · created by you". The badged member is the creator. So
  `golf_conversations.created_by` is the correct source: a truthful reading of data that
  exists, not an invented role.

**Also read off the same rows:** `:94-96` draws a presence dot on a teammate's avatar. That is
D-01a/G-51 territory — production `users` RLS cannot resolve a teammate's state — so the
member rows ship **without** the dot. Everything else on the row is buildable today.

**Explicitly rejected:** deriving the Admin pill from `users.role = 'admin'`. That enum is
`coach | player | admin` where `admin` means *platform* super-admin. It would badge a Helm
staff account as a group admin and badge the actual group creator as nothing. Wrong
semantics, and exactly the kind of inference §24.5 forbids.

**Scope limit.** This gives a read-only badge. It does **not** give admin *powers* —
promote/demote/remove-member needs a real per-participant role column and stays out of scope.
If the owner later wants transferable admin, that is a migration and a separate decision.

## D-02 / M05 — Independent fidelity review: **now runnable, so run it**

Was "not runnable as §24.6 writes it (nothing rendered)". That premise expired: Docker is up,
a local Supabase stack is running on 54321/54322, and the app can be served. §24.6's
requirement — compare *rendered* components against the reference — is satisfiable for real.

Do it **after** the UI waves land, against the running app, not as a source-level stand-in.
This also picks up what jsdom structurally cannot: `HANDOFF.md` §6 warns that both message-pane
suites pass over G-26 because jsdom computes no flex layout. A rendered check is the only
thing that catches that class of defect.

---

## Decisions already settled in `BLOCKED.md` §C — restated so nothing re-opens

- **D-01a presence dots / bell badge** — deferred, not built. G-51 is now production-confirmed
  (`users` exposes only `users_select_own` + `admin_read_all`), so presence cannot work for a
  teammate under current RLS. The *existing* dead indicator on the roster is in scope to
  remove; building messaging presence is not.
- **D-04 branch reconciliation** — take the work on `agent/messages-instant-entry`, budgeted
  as "wire up an existing shell". The local-vs-remote tip divergence
  (`e3aec2315` ≠ `c65dd47b5`) must be resolved explicitly before anything is cherry-picked.
- **Fairway tokens/components** — build with them, never fork primitives. Six unmapped
  artboard values go to A03 as variant requests.
- **D-03 pinned scope (G-01)** — G-01 turns a UI item into a migration; it stays out of the
  first waves.
