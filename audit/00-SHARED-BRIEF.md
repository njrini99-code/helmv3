# Shared brief — GolfHelm Messaging v2 audit (Wave 0, READ-ONLY)

Plan: `/Users/ricknini/Downloads/GolfHelm_Messaging_Parallel_Audit_Plan_v2.md` (1161 lines)
Feature doc (READ FIRST): `/Users/ricknini/Downloads/helmv3/memory/features/team-communications.md`
Source tree to audit: `/Users/ricknini/Downloads/helmv3` (canonical — READ ONLY, never write there)
Write your report ONLY to: `/Users/ricknini/worktrees/helmv3/mobile-messages-audit/audit/<your-lane>.md`

## Hard constraints
- READ-ONLY. No edits to any source file, in canonical or here. No `npm run dev`,
  no server start, no screenshots, no Supabase writes, no deploy, no migrations.
- NEVER write into `/Users/ricknini/Downloads/helmv3` by any means — not Write/Edit,
  and not a Bash redirect, `cp`, `mv` or formatter. Your only output file is the one above.
- The plan's §23.5 authorizes an audit specification ONLY: no production deployment,
  schema mutation, widened access, rewrite, or workspace-policy override.

## Evidence rules (the plan's §23.1 labels)
Every finding gets one label:
- `observed` — you read it in the tree; MUST carry a `path:line` citation.
- `source-confirmed` — corroborated by a second file/test/doc, cite both.
- `risk` — a plausible defect you could not confirm; say exactly what would confirm it.
- `proposal` — a design/implementation suggestion. Not a defect.
No `path:line` ⇒ it is NOT `observed`. Never assert something is missing because you
did not read far enough — grep the whole file and say so.

## Runtime evidence is impossible this phase
The companion screenshot package (C01/C02/X01, D01–D10, comparison boards) is NOT on
this machine — the plan's image links resolve to a `references/` dir that does not exist.
So this is an audit AGAINST THE WRITTEN SPECIFICATION, not a design-fidelity comparison.
Any check needing a rendered pixel, a device, or multi-user runtime → record `NOT_RUN`
with the reason. Do not substitute reasoning-from-source for visual proof; the plan's
§24.6 explicitly rejects that.

## Accepted behavior — do NOT report these as gaps
From `memory/features/team-communications.md`:
- Phone + thread open: inbox masthead `ViewHeader` is `hidden md:block` on purpose (UI-4, 2026-09-02).
- Messages column shrinks by max(bottom chrome 56px+safe area, `--keyboard-height`);
  screen carries `data-fw-keyboard-aware` so the shell's global scroll-into-view stays out.
- Thread opens at newest loaded message; realtime preserves reader position unless near bottom;
  a search result takes precedence and consumes the initial-open sentinel.
- Rail failure semantics: `(rpcError ?? groupConvsError) && !conversationsData?.length` → error
  state, explain + Retry, never "No conversations yet" (P257). The team-chat query deliberately
  does NOT early-return — it supplements the RPC.
- Text send retries ONCE at 750ms on transport failure only (`withOneTransportRetry`).
- Announcement edit scope (title/body/urgency/requires_acknowledgement only) is deliberate.
If you believe one of these is nonetheless wrong, file it as `risk` and say why.

## Known stale spots in the plan (already established — confirm, don't rediscover)
- `ConversationDetailsSheet.tsx` DOES NOT EXIST in the tree. §19.3 leases it anyway.
- `FairwayTeamBroadcastSheet.tsx` and `conversation-kind.ts` live in the messages dir and
  appear in NO §19.3 lease row.
Report any further plan-vs-tree drift you hit as its own finding class `plan-drift`.

## Report format
```
# <lane id> — <name>
## Files inspected  (path + line count, so the write phase can honor §19.3 leases)
## Findings
### <ID> <one-line title>   [label] [severity: high|med|low]
- Evidence: path:line — what the code actually does
- Spec: plan §X.Y — what it requires
- Gap: the delta
- Proposal: (optional) what a fix would touch
## Checks scored   (only the M-V / M-T ids in your scope: PASS | FAIL | NOT_RUN + reason)
## Plan-vs-tree drift
## What I could not determine and why
```
Be exact. An honest `NOT_RUN` outranks a confident guess.

---

# ADDENDUM 1 (supersedes the "runtime evidence is impossible" paragraph above)

The approved design HAS been located — not as screenshots, but as **source markup**,
which is strictly better for this audit. The owner published a Claude design canvas
("GolfHelm Messages"); its ten artboards are extracted to:

    /Users/ricknini/worktrees/helmv3/mobile-messages-audit/audit/reference/

| Artboard file | Canvas title | Plan D-ref (my mapping — verify, don't assume) |
|---|---|---|
| `Main.dc.html` | Inbox | D01 / D05 |
| `Thread.dc.html` | Conversation | D02 |
| `Bubbles.dc.html` | Bubbles | D03 / D08 |
| `Composer.dc.html` | Composer | D09 |
| `Group.dc.html` | Group thread | — |
| `GroupDetails.dc.html` | Group details | D04 |
| `NewMessage.dc.html` | New message | D10 (**NOT partial — a complete artboard exists**) |
| `Actions.dc.html` | Long-press actions | D07 |
| `Reactions.dc.html` | Reactions | D06 |
| `Empty.dc.html` | Empty inbox | D05 |
| `canvas.json` | layout | artboard geometry, all 390x844 |

## What changes for you
- Each artboard is a self-contained 390x844 HTML mock with **exact literal values** —
  `oklch(...)` colors, px sizes, radii, gaps, font weights, letter-spacing. Where the
  plan's prose says "compact" or "recessed", the artboard gives you the number. **Cite
  the artboard line, not the prose,** whenever the two are both available.
- This makes a real current-vs-approved delta possible: compare the emitted values in
  the repo component against the artboard's literal values, and report the numeric gap.
- It does NOT make runtime/device/multi-user evidence possible. Anything needing a real
  browser, a device, or two live users is still `NOT_RUN`. An artboard is a design
  source, not a screenshot of the shipped app.

## Two cautions
1. The artboards use raw `oklch()` literals; the repo's binding system is the `--fw-*`
   tokens in `src/styles/design-tokens.css`. A value that does not map onto an existing
   token is a **token-mapping decision for A03** (plan §14.2 "controlled exceptions"),
   not a licence to hardcode a color. Report unmapped values explicitly.
2. `Main.dc.html` shows presence dots on pinned avatars and an unread count badge.
   §24.5 forbids *inventing* roles/totals/"Active now" — but here the design asks for
   them. That is a genuine conflict: record it as a `decision-needed` item for M00 with
   the artboard citation, and state what data would have to exist to back it. Do not
   resolve it yourself, and do not build it.

Re-score any check you already marked `NOT_RUN` solely because no reference existed.
