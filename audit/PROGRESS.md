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
- [ ] **G-40** group unread is shared, not per-viewer. Uses the existing
      `participants.last_read_at` — no new column (see `A1-RESOLUTION.md` §3)

## W2 — Migration written, NOT applied
- [ ] **G-58** forward migration adding `muted_until` + `notification_level`
      `IF NOT EXISTS` with production's exact default and CHECK, so production is a no-op and
      every rebuilt-from-migrations environment converges. Leave for `db-apply`.

## W3 — Design-system prerequisites (blocks W5)
- [ ] **G-46** migrate `AttachmentPreview.tsx` off legacy classes onto Fairway
- [ ] **G-48** bubble radii use `fw-lg` (28px); the artboard's dominant 20px is byte-identical
      to `--fw-radius-card`. Only 6px and 12px genuinely lack tokens
- [ ] **G-32** bind artboard values to the existing unused tokens; six unmapped values go to
      A03 as variant requests, never hardcoded

## W4 — Thread
- [x] **G-26** the headline defect: metadata is a sibling flex item of the message column
      (`MessageThreadPane.tsx:1046-1270`), so any message with a timestamp sits left of its
      group-mates. jsdom cannot see this — verify in W8
- [ ] **G-50a** day chip → floating glass chip (`DECISIONS.md`)
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
