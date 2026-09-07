# PROGRESS — GolfHelm Messages write phase

Running checklist. **Read this first on every wake-up.** Session `helmv3-3f`, started
2026-09-07. Branch `agent/mobile-messages-audit`, worktree
`~/worktrees/helmv3/mobile-messages-audit`.

Decisions are frozen in `DECISIONS.md`. Findings are in `M00-MANIFEST.md`.
§A1 and §A2 are closed (`A1-RESOLUTION.md`, `A2-RESOLUTION.md`).

## Loop contract
1. Read this file. 2. Do the next unchecked item. 3. Gates. 4. Commit with **explicit paths**
(never `git add -A`). 5. Tick the box here. 6. If a PR is open, `gh pr checks` and fix red.

**Gates that must pass before a push:** `npm run typecheck`, `npm run lint`, `npm run test`.
Add `npm run build` whenever a `'use server'` surface changed (CLAUDE.md requires it).
The pre-push hook additionally runs `gates:review` on changed files. A new file under
`supabase/migrations/` pulls `migration-lockdown.yml` into the required checks.

Never deploy. Never merge. Never apply a migration — writing the file is in scope, applying
it is the owner's, through `db-apply`.

---

## Ordering constraints that are not obvious
- **W3 (G-46 `AttachmentPreview.tsx`) must land before W5 (composer).** It renders inside
  every composer attachment state, so the composer cannot meet the Fairway constraint until
  it is migrated. Doing W5 first means doing it twice. (`HANDOFF.md` §5.3.)
- **G-58's migration is written here and applied by the owner.** Do not apply it.
- **W8 needs the app actually running** (Docker + local stack on 54321/54322).

---

## W1 — Data and correctness. No schema change, highest user impact
- [x] **G-08** failed attachment insert reports SUCCESS to the sender
      (`message-attachments.ts:157`). Open issue #1825 is this symptom.
- [x] **G-19** failed sends erase the message instead of retaining it [cross-lane confirmed]
- [x] **G-21** attachment send fails OPEN
- [x] **G-13** a slow fetch for an abandoned conversation overwrites the open one
- [x] **G-15** fabricated `id: ''` rows in the inbox view model. Fixed by NARROWING the
      type (`GolfConversationLastMessage`) so the compiler proves no consumer read the
      fabrication. Its second half — the RPC's 14th column — is answered in
      `M01-TEAM-FLAGS.md`: `is_team_chat` and `is_team_channel` are two flags, not two
      spellings, so the manifest's "dropped in favour of" is wrong. No sort change
      (inbox ordering is the client's; sectioning is G-01's). New finding **G-59** [low]
      recorded there: the admin activity feed reads the other flag.
- [x] **G-18** duplicate-key short-circuit does not verify equivalence. Verifies id +
      conversation + sender + content before claiming success; invisible row or failed
      lookup fails closed. Safe only because G-19 landed first — the caller now retains
      the message and offers Retry.
- [x] **G-23** no IME composition guard on Enter-to-send. Guards on three signals
      (`nativeEvent.isComposing`, legacy `keyCode === 229`, and a
      compositionstart/end ref cleared on a macrotask for WebKit's
      compositionend-before-keydown order). 8 tests, 5 verified failing pre-fix.
- [x] **G-40** group unread is shared, not per-viewer. Uses the existing
      `participants.last_read_at` — no new column (see `A1-RESOLUTION.md` §3).
      Fixed client-side: the per-viewer computation that already existed on the
      supplemental team-chat path now runs over every group conversation the RPC
      returns. DMs deliberately untouched (with two people the shared boolean IS
      per-viewer, and DM read receipts are built on it). The RPC's own
      shared-boolean count still needs a migration to fix at the source — noted,
      NOT applied.

## W2 — Migration written, NOT applied
- [x] **G-58** forward migration adding `muted_until` + `notification_level`
      `IF NOT EXISTS` with production's exact default and CHECK, so production is a no-op and
      every rebuilt-from-migrations environment converges. Leave for `db-apply`.
      `supabase/migrations/20260907120000_golf_participants_mute_columns.sql` — WRITTEN, NOT
      APPLIED to production. Shapes read from the production catalog, not the mirror. Verified
      against the local stack: before = `id, conversation_id, user_id, joined_at, last_read_at`
      (G-58's own evidence), after = production's exact shape, second apply a no-op. Adds no
      index, because production has none and one would stop this being a no-op. The
      `COMMENT ON` is guarded on absence — production's existing comment is the only written
      record of the mute semantics anywhere, and an unguarded one would overwrite it.
      Now ENFORCED: both columns added to `GOLF_EXPECTED_COLUMNS` in
      `scripts/db/check-supabase-drift.mjs`, which `ci.yml` runs against the migrations
      rebuild — the schemas→migrations direction nothing was checking.

## W3 — Design-system prerequisites (blocks W5)
- [x] **G-46** migrate `AttachmentPreview.tsx` off legacy classes onto Fairway.
      `warm-*`, `cream-*`, `red-*`, `primary-*` and `purple-*` all gone, plus the raw-Tailwind
      radii the Fairway path forbids. Three mappings were judgement, not substitution: the
      purple audio tile now matches the document tile beside it (no purple exists in the
      scale, and the icon already differentiates); the red/blue/green PDF-DOC-XLS labels are
      all `text-text-secondary` (no blue token, `red-*` banned, and the word is the signal);
      the video scrim keeps `bg-black/20` deliberately. The remove control stays on
      `@/components/ui/button` — `MessageComposer.tsx`, the Fairway file that renders this
      one, imports its `Button` from the same module, so that IS the local idiom.
      §19.3 lease: this file was under no lease row. Single-agent execution collapses the
      question — no concurrent worker to conflict with — so the row was not added rather than
      inventing lease bookkeeping for a lane of one. 10 tests, 8 failing pre-fix.
      New finding **G-60** [med] below.
- [x] **G-48** bubble radii use `fw-lg` (28px); the artboard's dominant 20px is byte-identical
      to `--fw-radius-card`. Only 6px and 12px genuinely lack tokens.
      `rounded-fw-lg` → `rounded-card` at all five sites in `MessageThreadPane.tsx` — the three
      bubble corner cases plus the typing indicator (which copies the incoming-bubble shorthand)
      and the edit box (which replaces a bubble in place); leaving either behind would have made
      the swap read as an inconsistency rather than a correction. The 6px tail and 12px grouped
      inner corners stay untouched: both fall below `--fw-radius-sm` (10px), so the fw ramp has
      no step, and §19.3 sends exactly those to A03 rather than letting messaging fork a shared
      primitive. Correction to the manifest: the class is `rounded-card`, not `rounded-fw-card`
      — the latter is defined nowhere in `tailwind.config.ts`. 6 tests, 3 failing pre-fix; the
      other 3 measure the artboard against the token file, so they fail if either side moves.
- [x] **G-32** bind artboard values to the existing unused tokens; six unmapped values go to
      A03 as variant requests, never hardcoded. `audit/A03-VARIANT-REQUESTS.md` is the
      deliverable, every value measured from `reference/*.dc.html` against `design-tokens.css`
      rather than read off a lane summary. Applied: the unread row's lift
      (`[box-shadow:var(--fw-shadow-card)]`, byte-identical to the artboard's own
      "cream card lifting off the champagne" row) and `bg-canvas-gradient` layered over
      `bg-canvas` at 4 page-shell sites (M03A F11). Verified already-correct and left alone:
      the row and search-well radii. **Two corrections.** The unmapped set is FIVE, not six —
      `.send-on` and the pinned-rail pill carry the identical 165deg declaration, so two lanes
      reported one value twice; and the composer's progress bar, thought unmapped, is
      accent-600 → accent-500 exactly. **One trap recorded:** `shadow-card` is NOT
      `--fw-shadow-card` — it resolves to a legacy cool-grey value, and no utility bridges the
      Fairway token at all. 5 tests, 3 failing pre-fix.

## W4 — Thread
- [x] **G-26** the headline defect: metadata is a sibling flex item of the message column
      (`MessageThreadPane.tsx:1046-1270`), so any message with a timestamp sits left of its
      group-mates. jsdom cannot see this — verify in W8
- [x] **G-50a** day chip → floating glass chip (`DECISIONS.md`) — static, not sticky; four unused `--fw-glass-*`/`--fw-shadow-pop` tokens matched the artboard exactly; 11 tests, 6 failing pre-fix
- [ ] **G-50b** bubble max-width → 288px base, group-incoming derived from the avatar gutter
- [ ] **G-29** thread typography, photo layout, day separators
- [ ] **G-49** absolute measure cap and the depth system

## W5 — Composer (only after W3)
- [ ] **G-20** two of six composer states do not exist
- [ ] **G-09** upload progress is fabricated [cross-lane + artboard confirmed]
- [ ] **G-24** no cancel path for an in-flight upload
- [ ] **G-22** five-line growth is a hardcoded 120px
- [ ] **G-47** composer geometry from the artboard's numbers
- [ ] **G-45 / D-05** focus ring — glow geometry, token color (`DECISIONS.md`)

## W6 — Overlays and actions
- [ ] **G-55** action order → Reply, Copy, Edit, — separator — Delete (`DECISIONS.md`)
- [ ] **G-42** incoming messages have no action surface
- [ ] **G-56** dismissal is grip-drag + reduced-opacity background; there is no scrim

## W7 — Group details
- [ ] **G-33** group member lists are hardcoded empty
- [ ] **D-03a** member rows: role-dependent subtitle + Admin pill from `created_by`, and
      **no presence dot** (`DECISIONS.md`)
- [ ] **G-30** thread header has no slot to hang group details from
- [ ] **G-57** group thread header delta (pairs with G-30 and G-33 — one job)

## W8 — Rendered fidelity review (M05 / D-02)
- [ ] Serve the app against the local stack and compare against `reference/*.dc.html`
- [ ] Confirm G-26 is actually fixed in a real browser, not just in jsdom

---

## DEFERRED — deliberately not in this PR, with the reason
Scaling scope down is the owner's call, so these are named rather than silently dropped.
None is blocked by anything above; each is its own piece of work.

| Finding | Why deferred |
|---|---|
| **G-01** pinned conversations | Needs a migration *and* a product decision (D-03). Not a UI item |
| **G-27** deletes hard-remove instead of tombstoning | Migration plus destructive-semantics change; needs `db-migration-reviewer` and an owner call |
| **G-31** masthead reshape + bell | App-wide chrome, not messaging-owned. G-53 confirms the bell contract already exists elsewhere — consume it, don't invent it here |
| **G-54** unify the two recipient sheets | Large refactor spanning two leases; §11 stays `proposal` because no multi-recipient group-creation flow exists at all |
| **G-14 / G-16** send-path unification, reconnect/foreground resync | Architecture, not a defect fix. Wrong thing to land un-reviewed overnight |
| **G-39 / D-04** branch reconciliation | Needs the local-vs-remote tip (`e3aec2315` ≠ `c65dd47b5`) chosen explicitly first |
| **G-02** mute UI | Depends on G-58's migration being *applied*, which is the owner's step |
| **G-51** remove the dead roster presence dot | Referral — outside the messages tree, different lease |
| **G-52** messaging presence | Policy problem (RLS), not a build |
| **G-41** DM creation race | Needs a unique constraint ⇒ migration ⇒ owner |
| **G-03..G-07** inbox states (elevation, filter row, offline, drafts, stale cue) | Depend on G-04's finding that the visible "Team" control is a different feature; sequenced after the thread work |
| **G-10 / G-11 / G-12 / G-17 / G-25 / G-28 / G-34..G-37 / G-43** | Lower severity or dependent on a deferred item above |

## NEW findings from the write phase
Found while doing something else, recorded rather than silently absorbed.

| Finding | What |
|---|---|
| **G-59** [low] | `src/lib/admin/data/activity.ts:395,423` reads `is_team_channel` for golf where 403/437 read `is_team_chat` for baseball. Latent today only because `title` is coalesced first (`audit/M01-TEAM-FLAGS.md`) |
| **G-60** [med] | `AttachmentPreview.tsx`'s remove button is a 20px target — WCAG 2.2 SC 2.5.8 requires 24px. Belongs to W5/G-47, which owns composer geometry; G-46 was a palette migration and changing a control size under it would be a different change wearing G-46's name. Note that Fairway's own `IconButton` does not fix it either: its smallest size is 36px (44px on a coarse pointer), which at `-top-1 -right-1` on an 80px tile overhangs into the next tile's `gap-2`. The fix is a hit-area expansion, not a bigger badge |
