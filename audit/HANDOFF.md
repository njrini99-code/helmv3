# Handoff — GolfHelm Messages audit (Wave 0)

From session `helmv3-38`, 2026-09-07. Read this first; it orients you in about five minutes.

Worktree `~/worktrees/helmv3/mobile-messages-audit`, branch `agent/mobile-messages-audit`.
Read-only audit — **no source file was modified.** Everything produced lives in `audit/`.

---

## 1. What exists, and what to open

| File | What it is |
|---|---|
| `M00-MANIFEST.md` | **The deliverable.** 57 deduped findings (`G-01`…`G-57`), decisions, plan-vs-tree drift |
| `BLOCKED.md` | One page: what needs access, what needs an owner decision, top three findings |
| `00-EVIDENCE-POLICY.md` | Which findings are `UNVERIFIABLE-LOCALLY` and why; the settled credential decision |
| `00-SHARED-BRIEF.md` | The brief every lane worked from, incl. ADDENDUM 1 (the design reference) |
| `M01`…`M04-*.md` | Seven per-lane reports with full citations. The manifest dedupes them; these carry the reasoning |
| `reference/*.dc.html` | **The approved design**, ten artboards. See §3 |

Source of the plan: `~/Downloads/GolfHelm_Messaging_Parallel_Audit_Plan_v2.md` (1161 lines).
Mapped feature: `team_communications` (criticality high) → `memory/features/team-communications.md`.
**Read that feature doc before touching anything** — it records accepted behavior that
otherwise reads as a bug (hidden masthead on phone, keyboard subtraction, the P257 rail
failure semantics, the one-transport-retry).

---

## 2. How this was run, so you can trust or distrust it appropriately

Seven `helm-reader` subagents (sonnet), one per plan lane — M01 identity/RLS, M02
state/realtime, M03A inbox, M03B thread, M03C composer, M03D overlays, M04 media — all
read-only, all writing to this worktree. M00 (coordination, dedupe, verification) was held
by the main session.

Every finding carries one label from the plan's §23.1 vocabulary: `observed` (with
`path:line`), `source-confirmed`, `risk`, `proposal`. In the manifest each is additionally
marked:

- **`coordinator-verified`** — I re-read the code myself. Trust these.
- **`lane-asserted`** — one lane's citation, not independently re-checked. Verify before acting.
- **`cross-lane confirmed`** — two lanes reached it independently. Strongest evidence here.
- **`coordinator-corrected`** / **`lane-self-corrected`** — see §4.

**No runtime evidence exists.** Nothing was rendered, no device, no two live users, no
database read. Every check needing those is `NOT_RUN` by construction. Do not let that
decay into "probably fine".

---

## 3. The design reference — start here before any UI work

The plan's screenshot package (C01/C02/D01–D10) was never on this machine; its image links
resolve to a `references/` directory that does not exist. **The approved design was
recovered instead as source markup** — ten `.dc.html` artboards extracted from the owner's
"GolfHelm Messages" Claude design canvas, now in `audit/reference/`.

This is better than screenshots: every value is literal (`oklch()`, px, radii, weights), so
the current-to-approved delta is numeric rather than interpretive.

| Artboard | Covers |
|---|---|
| `Main.dc.html` | Inbox (D01/D05) |
| `Thread.dc.html` / `Bubbles.dc.html` | Conversation, bubble grammar (D02/D03/D08) |
| `Composer.dc.html` | Composer, all six states (D09) |
| `GroupDetails.dc.html` / `Group.dc.html` | Group details (D04), group thread |
| `NewMessage.dc.html` | Recipient selection (D10 — **complete, not the partial crop §11.1 claims**) |
| `Actions.dc.html` / `Reactions.dc.html` | Long-press (D07), reactions (D06) |
| `Empty.dc.html` | Empty inbox (D05) |

Two standing rules when using them:
1. Artboards use raw `oklch()` literals; this repo binds through `--fw-*` in
   `src/styles/design-tokens.css`. **Three lanes independently found that nearly every
   artboard value already maps to an existing token, often unused on this page.** Six
   genuinely unmapped values go to A03 as variant requests (§14.2). Never hardcode a
   literal from an artboard into a component.
2. The artboards **disagree with each other** in two places and with the plan's prose in
   two more. Those are owner decisions (`BLOCKED.md` §B), not a lane's to settle.

---

## 4. Corrections already made — do not re-introduce these

Six claims were wrong on the first pass and are fixed in the manifest. If you see the
original version somewhere, it is stale.

| Original claim | Corrected to |
|---|---|
| Mute has no UI *and no data* | `muted_until` + `notification_level` exist; it is a wiring gap, not a schema gap (M04 independently confirmed both are read/written nowhere) |
| `creator_id` "dropped at the same transform step" as `is_team_channel` | `creator_id` is set only in the group branch (`:925`); `is_team_channel` is simply never selected (`:780`). Different fix sites |
| Bubble radii match no `--fw-radius-*` token | The dominant 20px is byte-identical to `--fw-radius-card`; the code wrongly uses `fw-lg` (28px). Only 6px and 12px lack tokens |
| The two unmerged branches are byte-identical | True of the two *remote* tips only. Local `e3aec2315` ≠ remote `c65dd47b5` |
| No presence infrastructure exists | It exists app-wide and is consumed on the roster — but likely returns null under `users` RLS. See G-51 |
| Overlays dismiss via scrim-tap | Neither artboard has a scrim div at all; it is grip-drag + reduced-opacity background |

Also retracted: "generic file icon regardless of type" was not a deviation — the artboard
uses one generic icon too. What is missing is the 38×38 icon tile.

---

## 5. What to do next, in order

1. **Run the SQL in `BLOCKED.md` §A1.** Four findings hinge on it, one of them a possible
   live cross-tenant hole. Then run §A2's grep — if it comes back empty, that finding is not
   "deferred to CI", it is unchecked anywhere.
2. **Settle the five decisions in `BLOCKED.md` §B**, per the plan's §3 decision-freeze.
   Implementation before these are frozen produces rework.
3. **Fix leases before dispatching writers.** Three files are load-bearing and covered by no
   §19.3 lease row: `AttachmentPreview.tsx` (legacy classes, renders inside every composer
   attachment state — the composer *cannot* meet the Fairway constraint until it is
   migrated), `FairwayTeamBroadcastSheet.tsx`, and `conversation-kind.ts` (3+ cross-lane
   consumers). Also: `ConversationDetailsSheet.tsx` is leased in §19.3 but **does not exist
   on main**.
4. **Then the write phase.** Data/security first (§17), UI in fixtures alongside, integrate
   after — per the plan's waves. Do not enable a realistic-looking control in the real route
   before its contract works.

---

## 6. Traps

- **Parallel agents share one working tree.** Serialize writers, or give each its own
  worktree via `scripts/new-worktree.sh`. Never `git add -A`.
- **Write reports to the worktree, never into `/Users/ricknini/Downloads/helmv3`.**
  `guard-canonical-write.mjs` blocks `Write`/`Edit`/`MultiEdit` there but matches on tool
  name only — a Bash heredoc writing identical bytes passes straight through.
- **`guard-config-change` text-matches**, so it blocks Bash commands that merely *mention*
  the workflow dir, hooks, or `.mcp.json` — including reads, and including a heredoc whose
  prose contains the path. Use the Write tool instead; do not set `HELM_CONFIG_EDIT=1` to
  clear a read.
- **jsdom computes no flex layout.** Both message-pane test suites pass over a live
  alignment defect (G-26). A green suite here proves less than it looks.
- **The database is ahead of the UI.** `reply_to_id`, `golf_message_reactions`,
  `golf_message_mentions` are live production schema the components neither render nor
  select. Check the schema before concluding a feature needs building.
- **Worktrees do not inherit main's `.env.local`** — they get a stub, deliberately. No
  DB-touching script runs from one.
- `docs/PUSH_NOTIFICATION_AUDIT.md` is in this feature's mapped doc set, is self-marked
  STALE, and says message push is missing. The code does dispatch push. It will mislead you.

---

## 7. If you read only three findings

- **G-08** — a failed attachment insert reports **success** to the sender
  (`message-attachments.ts:157`). Permanently broken bubble, orphaned storage object, and
  the client comment at `MessageThreadPane.tsx:576-596` reasons about it as a *transient*
  race, so it will persuade you the case is handled. It is not.
- **G-40** — one member opening a team chat clears the unread badge for **everyone**.
  Unread runs on a shared `golf_messages.read` boolean, not per-viewer `last_read_at`.
- **G-26** — the alignment defect the plan names in its own opening paragraph is live and
  structural: metadata is a sibling flex item of the message column
  (`MessageThreadPane.tsx:1046-1270`), so any message with a timestamp sits left of its
  group-mates.
