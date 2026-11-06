# 2026-11-05 — P013

## 2026-11-05 — CoachHelm's work is reachable; Practice and its builder

```text
Design package: design-refresh/practice-plan, design-refresh/coachhelm
PR/commit:      agent/clubhouse-open-items
Contract IDs:   CH-13080 to 13084, 13180, 13181, 13395 to 13397,
                13580 to 13582, 13895, 13896
Actions:        savePracticePlan takes a null version for a first save;
                new copyPlanBody (reads, writes nothing)
Data impact:    none new; the held Practice migrations carry it
Held items:     none new; 20261026010000 to 20261104090000 stay on HOLD
```

Nothing here is on in production: every entry below sits behind the flag named
beside it.

Reachability:

- Brief is a view of CoachHelm for coaches: Team, Brief, Ask, with
  `coachhelm_monday_brief_v1`. Off, the strip is as it was. Ask's strip now says
  Team when the first view is Team, instead of Board.
- A player's Ask is a view of their CoachHelm, with `coachhelm_player_ask_v1`,
  and its page draws the strip back.
- Practice is in the nav after Calendar for both roles, with
  `golf_practice_plans`. Off, there is no entry and the address goes to
  Calendar.
- The top bar's Quick chat key says CoachHelm beside its mark, on a section's
  root bar and on a wide desk, with its chord on the desk. This departs from the
  design's plain 44pt mark (AC-QC-KEY-01): the owner asked for it to be
  labelled.
  A pushed page's bar, a desk under 1100 and a phone under 360 keep the mark.
  Players still have no key (SHARED-11).

Practice, new:

- `/golf/dashboard/practice`: the week, Up next, Drafts, Published and Past, New
  plan, and a first-run card. A player gets their next path and published plans.
- New plan: pick a practice, then Blank, Copy a past practice or Ask CoachHelm.
- `/golf/dashboard/practice/plan/<id>/edit`: Blocks, Groups, Drills and Review,
  saved 800ms after an edit. A desk has the drill rail, the board and an
  inspector with a CoachHelm tab.
- Fill the draft runs the same chat stream and `draft_practice_plan` tool as
  Ask. Its blocks arrive as outlined suggestions with Keep, Swap and Remove, and
  nothing joins the plan until kept. A kept block's Why goes to the coach-only
  column through `savePracticePlanDraft`, which also files the draft.

Ask's plan pane: on a phone it has Save draft and, past one version, the switch;
it says where the save went, with Undo. Edit in builder opens the builder.

Quick chat: the composer has its + and, where the browser can dictate, its mic.
A lost stream offers Try again when a retry can work. The new folder field no
longer collapses, the focus ring is the pill's, the panel has its own corners,
and a qualifier's round tiles hydrate in Safari.

Not built, and why: Templates, the Drills and Groups tabs, Print studio, Share,
Take down from the builder and drag to reorder are N-00 screens with no route
yet. The helper's per-step offers (Suggest a drill, Group by need, Check
balance) and "Or add one block" need a scoped draft the tool doesn't take.
Publish from the builder confirms first but has no 8 second Undo; Ask's publish
does.
