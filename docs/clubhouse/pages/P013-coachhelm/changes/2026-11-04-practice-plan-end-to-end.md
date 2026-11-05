# 2026-11-04 — Practice plan works end to end

## 2026-11-04 — Practice plan: save, publish, player read, print

```text
Design package: design-refresh/practice-plan/
PR/commit:      agent/clubhouse-redesign-followups
Contract IDs:   none new
Actions:        savePracticePlanDraft takes a null version for a first save
Data impact:    none; no migration, and flat version rows already on staging read as they are
Held items:     the practice migrations stay held for production
```

Owner's bug report, plus what tracing the path turned up.

- Publish read `live_version`; the column is `published_version`. The format page's published count read it too.
- A frozen version is flat (the blocks at the top level, no `variants`, no Own work lines). `parseVersionBody` reads that form, and older rows with it. The draft parser stays strict.
- A player's plan read `golf_practice_plans`, which answers coaches only, so it was always gone. The title and event now come from the version row, and only the live version is asked for.
- Own work lines are read from `golf_practice_plan_lines`, for the one player. Before this, the missing `lines` would have thrown.
- A republish sent objects as `p_changes`, which the RPC refuses. It now sends the strings it takes.
- The card's first save sends a null version, which is what the RPC asks for; 0 was always refused as stale. A later save of the same plan in this session sends the version the last save returned.
- Publish on the card saves what's on it first, then names the plan id and version in the thread, since nothing else gave the model either one. An edit after a save returns the card to Save draft.
- The draft tool's limits now match the body check (lengths and turns in 5 minute steps, places up to 40 characters, a station needs a place), so a bad plan is fixed in the turn rather than refused on Save.
- The print rule hides the page only while a print root is on it, and the paper size is set by `printPlan` for its own print. Printing any other page is unchanged.
- A player's sheet holds their own group only: another group's names, letters, rotation cells and pairings are not in the model, the payload or the DOM. The tab that read "Everyone" now reads "Your sheet", since that's what it shows.
- The player Practice page records the open, so Seen by counts it.
- A coach who also has a player row gets the coach copy, as the session's role says.

Screenshots: none. This worker ran no browser, and the visible changes are one tab label and the player sheet's fewer rows. Before and after belong with the PR once it's on Preview.
