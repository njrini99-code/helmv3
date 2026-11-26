# N-10 Documents, rebuilt (Team Hub > Documents)

> **Revised 2026-10-25 11:45pm:** layout now mirrors the claude.ai gallery (left rail with Pinned, Recents, Folders; type tiles; icon toolbar; thumbnail cards), from Nick's feedback ("the documents don't look like Anthropic's", with a screenshot of the Artifacts gallery). Data model, migrations, codes and owner calls kept except where the layout moved them (sort into the filter menu, section order into rail order, type tiles now create). Full list: `changelog/N-10.md`.

> **New 2026-10-25, from Nick's 10:40pm ask.** Nick: "docuemnts ui collapsed and open mechanics shoud mirror anthropics. practice plans geenrated after should look really good and be organized after goign through the creation process" (with a screenshot of claude.ai's Artifacts gallery), and earlier "all practice plans published should live in the coaches documents". This plan rebuilds Team Hub's Documents tab in that grammar: a left library rail (New, Search, then Pinned, Recents and Folders lists that open and close on a smooth row reveal), coloured type tiles that start creation, a sticky bar (All · Yours · Shared with players on the left; icon-only search, filter, view and + on the right) and a grid of thumbnail cards. Published practice plans from N-00 land in a "Practice plans" folder on their own and open as the plan page. Four held migrations (pins, opens, folders, one guard on the plans folder). Full list: `changelog/N-10.md`. Open, waiting on Nick: none (owner calls in section 12, each with a default the plan is written to).

> Status: plan, not built. Source of truth for the shared design: `practice-redesign/DESIGN_SPEC.md` (section "Documents (plan N-10)", lines 179-188, and "Publish", lines 139-149).
> Depends on: **PR 2361** (phase2: `FormSheet`, `ListSheet`, `ActionSheet`, `ContextMenu` long press, the phone `PhoneTop` action slot, `relativeTime`). **N-00** for everything about practice plans: N-00 owns `golf_documents.practice_plan_id`, the nullable `file_url` and its CHECK (migration `20261026010400_golf_documents_practice_plan.sql`), the publish function that files the plan row, the plan page, the print studio, `PlanGlance` and `loadPlanGlances`. This plan references them and redefines none. Slices 1 to 3 build without N-00; slice 4 needs it.
> Held migrations: `20261026090000_golf_document_pins`, `20261026090100_golf_document_opens`, `20261026090200_golf_document_folders`, `20261026090300_golf_documents_plan_folder_check` (the last depends on N-00's `010400`). The 090000 block: N-09 lists it as reserved and "none used" (`N-09-this-season-vs-last.md:10`); no other plan in `build-plans-2/` or `build-plans/` uses it (grep, 2026-10-25). The lead assigned it to N-10.
> Repo refs read: `origin/main` f30a6d5, `origin/phase2` 00d5b76 (PR 2361). Line numbers are `main:` and `phase2:`; one number alone is phase2's.

---

## 1. The feature

Documents is where a team keeps its files: travel waivers, local rules, lineup sheets, scorecards, and now every practice plan a coach publishes. Today it is a flat stack of folder cards with rows of type tiles. It cannot be searched, filtered or sorted, folders cannot be closed, nothing can be renamed, moved or pinned, and nothing shows what a file looks like.

The rebuild follows claude.ai's Artifacts page, as Nick asked:

- A **library rail** on the left of the tab (the app sidebar stays): New, Search, then small collapsible lists with a caret: **Pinned ▾**, **Recents ▾** (eight, then "View all") and **Folders ▾** (Practice plans, Team, then the coach's folders A to Z, with counts). A folder filters the grid and shows a breadcrumb. Each viewer's open and closed lists are remembered.
- **Type tiles** across the top (coaches): "Practice plan", "Upload", "Folder", coloured tiles with an illustration that start each one.
- A **sticky bar**: All · Yours · Shared with players on the left (coaches); icon-only search, filter (type and sort), list or grid, and + on the right.
- **Cards** in a three-column grid: a tinted thumbnail (deep green for plans, deep slate for files, the picture itself for images) with a small page inset, then a type icon tile, a one-line title and "Published 2h ago" or "Opened 10m ago". On hover, a ⋯ and a pin appear on the thumbnail.
- **Practice plans** file themselves into the "Practice plans" folder the moment a coach publishes, and open as the plan page, not a file viewer. A republished plan shows "Updated 1:02 PM · v3".

Coaches organise; players read, pin and download. Nothing here sends anything to anyone.

---

## 0. How it fits the app today

### 0.1 Where Documents lives today

| What | main | phase2 (PR 2361) |
|---|---|---|
| Team Hub tabs Home, Announcements, Travel, Documents, Tasks, the same for both roles | `src/clubhouse/lib/hub-tabs.ts` main:7-24 | same file, unchanged |
| `?tab=docs` deep link, parsed by `parseHubTab` | `hub-tabs.ts:28-30` | same |
| `/golf/dashboard/documents` redirects to `/golf/dashboard/team-hub?tab=docs` in Clubhouse | `src/app/golf/(dashboard)/dashboard/documents/layout.tsx:4-7` | same (the Fairway page under it, `FairwayDocuments`, still renders when Clubhouse is off) |
| The tab's screen, `Documents` | `src/clubhouse/screens/hub/parts.tsx` main:650 | `parts.tsx:652-770` |
| How it is mounted | `TeamHub.tsx` main:708 | `TeamHub.tsx:723-727`, inside `SectionBoundary surface="hub.documents" code="CH-10205"` |
| The read | `loadTeamHub` calls the `getDocuments` action, `folders()` groups rows | `src/clubhouse/data/hub.ts:310-331` (`getDocuments` at :314, `documents:` at :331), `folders()` :923-944 |
| Open a file | a blank tab opens inside the tap, then the signed link fills it | `TeamHub.tsx:262-286` (`hub.openDocument`, CH-10004) through `writes.openDocument` → `getPreviewUrl` (`writes.ts:105-106`; `documents.ts:1103-1236`, a 1-hour signed URL, :1145) |
| Upload | drop zone button at the top (coach), signed upload to Storage, then `createGolfDocument` | `parts.tsx:679-717`; `upload.ts` (`uploadTeamDocument`, `player_visible: true`, folder `null` from `TeamHub.tsx:295`); `prepareGolfDocumentUpload` `documents.ts:1398` (phase2 only) |
| Delete | the row's ⋯ `Menu` with one item, "Delete file" (coach) | `parts.tsx:749-761`; confirm CH-10503, failure CH-10009 |
| Desktop layout | folder cards in a grid | `hub.css` main:798, phase2:837-842 (`minmax(340px, 1fr)`) |
| Phone layout | folder sections of 58px rows on seams | `hub.css` phase2:1686-1717 |
| Hub Home tile "Files" (four newest, "All 12" opens the tab) | `widgets.tsx` | `widgets.tsx:886-916` (`FilesTile`) |
| New announcement attaches shared files | `sheets.tsx` | `sheets.tsx:168-172`, `:295` (only `isPublic` files, CH-10314) |

What today's tab cannot do (checked in `parts.tsx:652-770`): folders never collapse; no search, filter, sort, grid or list; no thumbnails (a 40×46 type tile); no pinned or recents; no Yours or Shared; no rename, move or share (although the action exists, below); folders cannot be created in Clubhouse (only typed in Fairway); the coach's only menu item is Delete.

What already exists on the server and is reused, not rebuilt:

- `updateGolfDocument({ id, title?, folder?, player_visible? })` (`documents.ts:1597-1606`, coach-only check inside `updateDocumentImpl` :556-558). Rename, Move and Share with players all go through it. It is not in `ChHubWrites` yet (`writes.ts:23-63`); this plan adds it.
- RLS on `golf_documents` (`supabase/schemas/policies/golf.sql:631-637`): any coach on the staff (`is_golf_team_coach`, `functions/public.sql:6964-6976`) reads and writes every team document; an active player (`is_golf_team_player`, :7000-7013) reads only `is_public = true`. `getDocuments` repeats the player filter (`documents.ts:204-208`).
- `golf_documents` columns (`supabase/schemas/golf/10_tables.sql:664-681`): `uploaded_by` (FK to `auth.users`, `20_constraints.sql:667`), `title`, `description`, `file_url` (NOT NULL today; N-00 makes it nullable), `file_type`, `file_size`, `category`, `is_public` (default false), `folder` (free text, null means "Team"), `version_count`, `created_at`, `updated_at`, `is_test`. No trigger bumps `updated_at` on an update; only a new version does (`update_document_version_info`, `functions/public.sql:10705-10722`).

### 0.2 Before and after: the Documents tab

```
BEFORE (phase2, desktop, coach)                    AFTER (desktop 1440, coach; the app sidebar stays at the far left)
Team Hub                     [New announcement]    Team Hub
Home  Announcements  Travel  Documents  Tasks      Home  Announcements  Travel  Documents  Tasks
┌ Drop files to share with the team ─────────┐     + New            ┌────────┐ ┌────────┐ ┌────────┐
│ PDF, DOC, XLS or images · players see them │     ⌕ Search         │ green  │ │ slate  │ │ clay   │  type tiles
└────────────────────────────────────────────┘                      └────────┘ └────────┘ └────────┘
┌ Team        3 files ┐ ┌ Travel     2 files ┐     Pinned ▾          Practice plan Upload   Folder
│ [PDF] Local rules ↓ │ │ [PDF] Waiver     ↓ │      ▣ Thursday pr…  [All|Yours|Shared with players]   ⌕ ⚟ ≡ +  (sticky)
│ [IMG] Lineup      ↓ │ │ [XLS] Rooms      ↓ │      ▤ Local rules   ┌──────────┐ ┌──────────┐ ┌──────────┐
│ [DOC] Code of …   ↓ │ └────────────────────┘     Recents ▾         │▓▓┌────┐▓▓│ │▒▒┌────┐▒▒│ │  image   │
└─────────────────────┘                             (8) View all     │▓▓│page│▓▓│ │▒▒│page│▒▒│ │          │
                                                   Folders ▾         ├──────────┤ ├──────────┤ ├──────────┤
                                                    Practice plans 12│▣ Thursday│ │▤ Local r…│ │▧ Lineup  │
                                                    Team 3           │ Published│ │ Opened 1…│ │ Added Oc…│
                                                    Travel 2         └──────────┘ └──────────┘ └──────────┘
```

```
BEFORE (phone, player)              AFTER (phone, coach)
Team Hub                            Team Hub                         [+]
[Home|Announcements|Travel|Doc…]    [Home|Announcements|Travel|Doc…]
Team                 3 files        [ All  |  Yours  |  Shared ]
 [PDF] Local rules   84 KB · Oct 10 [⌕ Search documents        ] [⚟]
 [IMG] Lineup        1.2 MB · Oct 9 Pinned ▾
Travel               2 files         [56] Thursday practice    ◍  ⋯
 [PDF] Waiver        …                    Published 2h ago
                                    Recents ▾
                                    Folders ▾
                                     [▣] Practice plans        12  ›
                                    All documents 24
                                     [56] Local rules          ◍  ⋯
```

What stays exactly as it is: the tab's place and name, `?tab=docs`, the Fairway `/documents` redirect, who can see what (RLS unchanged), how a file opens (new tab, signed link, CH-10004), upload rules and limits (`upload-rules.ts`, 25 MB, the bucket's types), delete and its confirm (CH-10503, CH-10009), the Hub Home "Files" tile's place, the New announcement attach list.

### 0.3 Entry points (phone and desktop)

| # | Who | Path | Phone | Desktop |
|---|---|---|---|---|
| A | Player | Team Hub → Documents | Team Hub is a first pill (`CH_PHONE_TABS` player, `nav.ts:81-84`) | Sidebar "Team Hub" (`nav.ts:66`) |
| B | Coach | Team Hub → Documents | Section strip (Team Hub after the first four pills; `phoneSectionsFor`, `nav.ts:103-106`) | Sidebar "Team Hub" (`nav.ts:44`) |
| C | Both | Hub Home "Files" tile, "All 12" | `widgets.tsx:895` (`onOpenDocs`) | same |
| D | Both | Deep link `/golf/dashboard/team-hub?tab=docs`, optionally `&folder=practice-plans` (new, 3.2) | same | same |
| E | Both | New short address `/golf/dashboard/team-hub/documents` (new, 3.2): redirects to D | same | same |
| F | Both | Old `/golf/dashboard/documents` (unchanged redirect to D) | same | same |
| G | Coach | N-00 publish toast "Filed in Documents" and the plan page's "In Documents" line → D with `&folder=practice-plans` | same | same |
| H | Both | Back from a plan page opened from Documents returns to Documents with the same folder filter, rail lists and scroll (browser history; 4.10) | pushed bar "Documents" | browser back |

No orphan screen: Documents stays a tab; image and PDF preview is a sheet over it (desktop); a plan opens N-00's page.

### 0.4 Reused, and not duplicated

| Need | Reuse (file) | Do not |
|---|---|---|
| Tab, URL sync, head primary | `TeamHub` (`TeamHub.tsx:452-464` tab and `?tab=`, `:485-493` head primary, `:532-537` phone `PhoneTop` action) | A new route or page shell |
| Section isolation | `SectionBoundary` with CH-10205 (`TeamHub.tsx:724`) | try/catch UI |
| Didn't load, empty | `RefreshNotice` CH-10204, `EmptyState` CH-10304 (`ui/RefreshNotice.tsx`, `ui/States.tsx`) | New error components |
| Menus | `Menu` (`ui/Menu.tsx:13-35`, items with `checked` and `danger`), `useContextMenu` + `MenuSheet` (`ui/ContextMenu.tsx:20,63,203`, long press 500ms on touch, right-click on desktop) | `DropMenu` (does not exist), a custom popover |
| Sheets | `FormSheet` (Rename, New folder, Rename folder), `ListSheet` (Move, phone Filter and sort), `ActionSheet` (phone New) (`ui/FormSheet.tsx:85,155,201`) | New sheet chrome |
| Controls | `Segmented` (Show tabs; `ui/Segmented.tsx:31`), `IconButton` (the bar's search, filter, view and + and the chips' accessible names; its tooltip is its `aria-label`, `ui/Button.tsx:124-160`, `ui/Tooltip.tsx`), `SearchField` (`ui/SearchField.tsx:12`), `Button`, `Icon`, `useRoving` (rail arrows, `ui/use-roving.ts`) | Hand-made segmented controls, unnamed icon buttons, a second tooltip |
| Sticky and rail precedents | the Calendar week head sticks at `--ch-topbar-h` (`calendar.css:381-388`); the Settings rail sticks under the top bar (`settings.css:36-41`); `data-lenis-prevent` for a panel that scrolls itself (`smooth-scroll.ts:198`) | A scroll listener |
| Delete confirm | `ConfirmDelete` and `askDelete({ kind: 'file' })` (CH-10503), `useAction('hub.delete')` (CH-10009) | A second delete path |
| Open | `useAction('hub.openDocument')` (`TeamHub.tsx:262-286`) | A second signed-URL path |
| Upload | `writes.uploadDocument` → `uploadTeamDocument` (`upload.ts`), `uploadRefusal` (`upload-rules.ts`) | Another upload flow; it already takes `folder` |
| Edit | `updateGolfDocument` (`documents.ts:1597`) | A new update action |
| File kind | `fileKind`, `KIND_OF_MIME`, `TYPE_OF` (`hub.ts:895-921`) | A second MIME table |
| Relative time | `relativeTime(at, 'short' or 'long')` (`src/clubhouse/lib/dates.ts:42`, phase2 only) | Another "ago" helper (there are four: roster, entry, notification-stacks, dates; use dates.ts) |
| Motion | `--ch-ease-spring-smooth` and `--ch-dur-spring-smooth` (`tokens.css:721-722`, the `linear()` spring at :1023-1029), `--ch-dur-base`, `--ch-ease` (:703-710), chevron turn precedent CH-09602 (`qualifiers.css:703-711`), `chTween` and `CH_POP` (`lib/motion.ts`) | New durations or curves |
| Haptics | `haptic('select' or 'press' or 'success' or 'warning' or 'error')` (`lib/haptics.ts:21`) | `commit` (reserved, `haptic-grammar.test.ts`) |
| Reduced motion | `useChReducedMotion` (`lib/reduced-motion.ts`), and the global clamp to 1ms (`base.css:302-312`) | Per-component media queries for durations |
| Practice plan preview | N-00's `PlanGlance` (`src/clubhouse/screens/practice/PlanGlance.tsx`, props `{ glance, size?: 'card' or 'page' }`) and `loadPlanGlances(supabase, planIds)` (`src/clubhouse/data/practice-plan.ts`) | Any second drawing of a plan |

### 0.5 Next to current features: what changes and what stays

- **Hub Home "Files" tile** keeps its place and four rows. Its rows now read the new kind labels ("Plan" for a practice plan) and open through the same open path (a plan goes to its page). `ChTeamHub['documents']` keeps its shape (`{ folders, error }`), so the tile and the New announcement attach list compile unchanged; the new library data is a separate field (8.6).
- **New announcement attachments** (`sheets.tsx:168-172`): a published plan is `is_public`, so it can be attached; opening the attachment goes to the plan page (same open path).
- **Calendar event files** (`EventFiles`, `extras.tsx:311`) are untouched. N-00 leaves plan rows out of the Fairway event picker (N-00's shim, 0.8).
- **Messages, notifications, CoachHelm**: untouched. Pins, opens and folder edits notify no one.
- **Offline**: reads show the last loaded page; every write goes through `useAction`, which already refuses offline with the shell's notice. Opens recorded offline are dropped, not queued (Recents is a convenience).
- **Round saving**: nothing here touches rounds.
- **Fairway `/documents` page**: untouched; it never shows pins or folders created here (they are text in `folder`, which it already reads).

### 0.6 Flags and gates

- `golf_clubhouse_ui` (`config/feature-flags.yml:862`) gates Clubhouse as today.
- **New flag** `golf_documents_library`, default off, read on the server with `isFlagEnabled` (`src/lib/flags/is-enabled.ts:78`) in `ClubhouseHubRoute` and passed to `TeamHub` as `library: boolean`. Off: today's `Documents` renders exactly as now. On: `DocumentsLibrary` renders. Entry, in the shape of `golf_clubhouse_ui`:

```yaml
  - feature_id: golf_documents_library
    owner: golf/clubhouse
    purpose: >-
      Draws Team Hub's rebuilt Documents tab (library rail with collapsible
      Pinned, Recents and Folders, type tiles, icon bar, thumbnail cards,
      rename, move, share, pin, folders) in place of the folder list. Reads the held
      golf_document_pins, golf_document_opens and golf_document_folders
      tables when they exist; works without them.
    type: release
    status: active
    created_at: "2026-10-25"
    expires_at: "2027-08-01"
    default: false
    environment:
      production: false
      preview: true
      development: true
    kill_switch_behavior: null
    cleanup_plan: >-
      Once production has run with it on for four weeks with no rollback,
      delete the old Documents component in parts.tsx and its CSS, the flag
      branch in TeamHub and ClubhouseHubRoute, then this entry, and run
      npm run flags:generate in the same change.
```

Then `npm run flags:generate`. An unregistered id evaluates false (`is-enabled.ts:56`). Nothing is flipped by this plan.

- Practice plans also sit behind N-00's flag (`golf_practice_plans`). With it off, plan rows are left out of the library and "New practice plan" is not offered (a plan page would not open).
- The held tables gate themselves: a read that fails with `42P01` or PostgREST `PGRST205` (table missing) returns `null`, and Pinned, Recents, "Pin" and "New folder" are simply not drawn. So the flag can be on against a database without the migrations.

### 0.7 Data today versus new

| Data | Today | New |
|---|---|---|
| Documents, folders as text, visibility, uploader | `golf_documents` | unchanged columns; N-00 adds `practice_plan_id` |
| Who opened what, when | nothing (only `golf_document_versions` for uploads) | `golf_document_opens` (per viewer) |
| Pins | nothing | `golf_document_pins` (per viewer) |
| Empty folders, folder rename | impossible (a folder exists only while a file names it) | `golf_document_folders` + two functions |
| Rail lists open or closed, grid or list, sort and type | nothing | `localStorage` per viewer (owner call 12.1) |
| Thumbnails | nothing | images: short signed URLs; plans: `PlanGlance` on a mini page; others: a mini page with the title on a slate ground. No stored thumbnails. |

A team with no documents sees the empty state (4.9). A team with documents but no opens yet has no Recents list in the rail until the viewer opens something. Existing folder text keeps working; no backfill.

### 0.8 What N-00 does, what N-10 does (agreed with the N-00 writer, 2026-10-25)

| N-00 owns | N-10 owns |
|---|---|
| `golf_documents.practice_plan_id uuid NULL REFERENCES golf_practice_plans(id) ON DELETE CASCADE`, unique partial index `golf_documents_practice_plan_uniq`, `file_url DROP NOT NULL`, `CHECK golf_documents_source_check ((file_url IS NOT NULL) <> (practice_plan_id IS NOT NULL))`, all in `20261026010400_golf_documents_practice_plan.sql` | The guard that keeps files out of "Practice plans" and plans in it (`090300`, depends on 010400) |
| Inside the definer function `golf_practice_plan_publish` (`20261026010600`), atomically with freezing the version: upsert the plan's row with `category 'practice_plan'`, `folder 'Practice plans'`, `title` = plan title, `description` = the focus line, `is_public true`, `uploaded_by` = the first publishing coach (kept on republish), `file_url`, `file_type`, `file_size` NULL, `version_count` = published version, `updated_at now()` | Reading those rows, the "Practice plans" section, the plan card and its meta, the menu |
| Take down: `is_public false`, row kept. Republish after take-down: `is_public true` again. Plan deleted: the row goes by cascade | Showing "Taken down" to coaches; hiding the row from players (RLS already does) |
| Plan page `/golf/dashboard/practice/plan/[planId]`, print `/golf/dashboard/practice/print/[planId]`, take-down confirm at `/golf/dashboard/practice/plan/[planId]?takedown=1`, New plan at `/golf/dashboard/practice?new=1` (coach) | Linking to them |
| `PlanGlance` and `loadPlanGlances` (one query on `golf_practice_plan_versions`, latest frozen version per plan; a player gets only published plans, a coach also taken-down plans' last version) | Calling them for the cards |
| A null-safety shim in today's readers when 010400 applies (`folders()`/`fileKind` accept a null URL and show "Plan"; the open action sends a plan to its page; Fairway's page and event picker leave plan rows out) | Replacing the Clubhouse part of that shim with the library |

---

## 2. Who uses it

- **Coaches** (any coach on the staff; head and assistant alike, as `golf_documents` RLS already allows): file and find team documents, organise folders, decide what players see, find a published plan from last Tuesday, pin the season's travel waiver.
- **Players** (active members): find what the coach shared, open this week's practice plan, pin the local rules, download a waiver to sign.
- Nobody outside the team. No public links (N-00 owner call 4).

---

## 3. Where it lives

### 3.1 Recommendation (owner call 12.2): stays in Team Hub as the Documents tab

Reasons: Team Hub already holds the team's shared material (posts, trips, tasks, files) for both roles with the same tabs (`hub-tabs.ts:9-24`); players already reach it as a first pill; the Fairway address already lands there; a new sidebar item for files would add a twelfth coach entry for something used weekly, not daily. The new Practice tab (N-00) is where plans are built; Documents is where they are kept with everything else.

The other version (not the default): a `Documents` sidebar item under Team at `/golf/dashboard/documents` rendering the same `DocumentsLibrary`, `CH_REBUILT_ROUTES` gaining that path for both roles, `CH_ALIASED_ROUTES` losing `documents` from `nav.ts:201`, and the Hub tab becoming a link. Not written further unless Nick picks it.

### 3.2 The short address and the folder deep link

- New route folder `src/app/golf/(dashboard)/dashboard/team-hub/documents/` with:
  - `layout.tsx`: `await redirectToClubhouse({ coach: (p) => docsHref(p), player: (p) => docsHref(p) })`, the same shape as `documents/layout.tsx:4-7`, where `docsHref` keeps only `folder` read through `aliasId` (`routes/alias.ts:20-23`): `/golf/dashboard/team-hub?tab=docs` plus `&folder=<id>` when valid.
  - `page.tsx`: with Clubhouse off, `redirect('/golf/dashboard/documents')` (Fairway's page). Nothing renders here.
- `nav.ts`: add `/^\/golf\/dashboard\/team-hub\/documents$/` to `CH_ALIASED_ROUTES` (`nav.ts:200-211`); the guard tests (`alias.test.ts`, `alias-served-urls.test.ts`) require every `redirectToClubhouse` route to be listed. No change to `CH_REBUILT_ROUTES`, `CH_REBUILT_CHILDREN`, `PUSHED_BELOW` or `CH_PHONE_TABS`; no new nav item. (N-00 and N-05 edit `PUSHED_BELOW` and `CH_REBUILT_CHILDREN`; this plan does not, so it cannot collide with them.)
- `?folder=`: `practice-plans`, `team`, or a folder's id from `golf_document_folders` (a uuid), or a lower-case slug of a text-only folder. `team-hub/page.tsx` adds `folder` to its `searchParams` (:31-35) and passes it through `ClubhouseHubRoute` (`routes/hub.tsx:18`) as `focusFolder`, checked with the same `/^[\w-]{1,64}$/` test as `task` and `trip` (:37-38). On arrival the grid is filtered to that folder with its breadcrumb (4.3.5), the rail's Folders list opens with that row current, and focus goes to the breadcrumb's folder name once. An id that matches no folder the viewer can see is ignored (All documents).

---

## 4. Design, screen by screen

### 4.1 The parts

Revised 2026-10-25 11:45pm to mirror the claude.ai Artifacts gallery (Nick's screenshot: a left library list with New, Search, Pinned ▾, Recents ▾ and "View all"; coloured type tiles across the top; All · Yours · Shared with you on the left of a bar with icon-only search, filter, list and + on the right; a three-column grid of thumbnail cards).

```
DocumentsLibrary                         (the Documents tabpanel; app sidebar untouched at its left)
├─ DocRail  <nav "Library">              (desktop: inline 232px column, or an overlay panel under 860px of Hub width, 4.12)
│  ├─ New row (+)                        (coach; opens the New menu)
│  ├─ Search row                         (opens and focuses the bar's search)
│  ├─ DocRailGroup id="pinned"   Pinned ▾    rows: type glyph + title          (absent with no pins or no table)
│  ├─ DocRailGroup id="recents"  Recents ▾   8 rows + "View all"               (absent with no opens or no table)
│  └─ DocRailGroup id="folders"  Folders ▾   Practice plans, Team, A to Z, counts
└─ DocMain                               (container chdlmain)
   ├─ DocTypeTiles                       (coach: "Practice plan", "Upload", "Folder"; these start creation)
   ├─ DocBar  (sticky)                   (left: Segmented All · Yours · Shared with players [coach]; right: icon buttons)
   ├─ DocCrumb                           (only with a folder chosen: All documents › Travel 4 ⋯; or the search count line)
   └─ DocGrid | DocList                  (flat: every visible document after tab, folder, type and search, in the sort)
        └─ DocCard (grid) | DocRow (list): DocThumb + bottom row + hover chips
```

Phone (4.12.3) uses the same pieces in one column: Segmented, search and filter, collapsible Pinned / Recents / Folders headers, then the rows.

New files: `src/clubhouse/screens/hub/docs/` (section 9). The old `Documents` stays in `parts.tsx` behind the flag until cleanup.

### 4.2 The library rail (desktop)

```
┌ rail, 232px ─────────────────┐
│ +   New                      │   coach only; same New menu as the bar's +
│ ⌕   Search                   │   focuses the bar's search field
│                              │   12px
│ Pinned ▾                     │   group label: caret after the word, as claude.ai
│ ▣   Thursday practice        │   rows: 16px type glyph, title, one line
│ ▤   Local rules              │
│ Recents ▾                    │
│ ▤   Travel waiver            │   up to 8 rows, newest open first
│ …                            │
│     View all                 │
│ Folders ▾                    │
│ ▣   Practice plans        12 │   counts right-aligned, tabular
│ ▢   Team                   3 │
│ ▢   Away trips             2 │   coach folders A to Z
│ ▢   Travel                 4 │   current folder: selected fill, aria-current
└──────────────────────────────┘
```

- **Element**: `<nav aria-label="Library" class="ch-dl-rail">`, 232px wide, `position: sticky; top: calc(var(--ch-topbar-h) + 12px)` (the Settings rail's precedent, `settings.css:36-41`), `max-height: calc(100dvh - var(--ch-topbar-h) - 24px)`, `overflow-y: auto`, `overscroll-behavior: contain`, and `data-lenis-prevent` so a wheel over a long rail scrolls the rail, not the canvas (`smooth-scroll.ts:198`). A hairline on its right edge (`box-shadow: inset calc(-1 * var(--ch-hairline-w)) 0 0 var(--ch-border-hairline)`), 24px gap to the main column. Background is the page; no card.
- **Rows** (New, Search, document rows, folder rows, View all): a `<button>` (folder, New, Search, View all) or `<a href>` (a plan, so cmd-click opens a tab), 32px drawn on the desktop pointer, `padding: 0 8px`, gap 10px, radius `--ch-radius-sm`, glyph 16px `--ch-text-tertiary`, label `--ch-type-14` `--ch-text-secondary`, one line with ellipsis (full title in a `Tooltip` when cut). Hover `--ch-bg-hover` over `--ch-dur-quick`; press: the house press tint. Arrow Up and Down move between rows (`useRoving`, `ui/use-roving.ts`); Tab enters and leaves the rail in one stop.
- **New** (`Plus`): opens the New menu (4.3.4). Not drawn for players.
- **Search** (`Search`): opens the bar's search (4.3.2) and puts focus in it. Shows the shortcut "/" in its tooltip.
- **Group labels** (Pinned, Recents, Folders): a `<button>` holding the word (`--ch-type-13-medium`, `--ch-text-tertiary`) and a 12px `ChevronDown` caret after it; `aria-expanded`, `aria-controls="ch-dl-g-<id>"`; 28px drawn, 16px above it. The caret points down when open and turns to point right (`rotate(-90deg)`) when closed over `--ch-dur-base` `--ch-ease` (CH-10661). The list under it opens and closes with the reveal in 4.2.1. A closed group keeps its label.
- **Pinned rows**: one per pin, newest pin first, every pin (no cap). Glyph by kind: plan `ClipboardCheck`, PDF `FileText`, image `Image`, doc `FileType`, sheet `FileSpreadsheet`, slides `Presentation`, video `Film`, other `File`. Press opens the document (4.10). Hover or focus shows a 24px ⋯ at the row's end (the document's menu, 4.7); right-click and Shift+F10 open it too. Group absent when the viewer has no pins or the pins table is missing.
- **Recents rows**: the viewer's 8 most recent opens, same glyphs and behaviour, then a **View all** row (no glyph, `--ch-text-secondary`). View all clears the folder filter and the search, sets the sort to "Last opened" (4.3.3), scrolls the main column to its top and focuses the grid's first card, so the grid carries on where the eight rows stop. Group absent with no opens or no opens table.
- **Folder rows**: Practice plans (`ClipboardCheck`; coaches always when N-00's flag is on, players when it holds a plan), Team (`Folder`), then every other folder A to Z (`localeCompare`), each with its count at the right (`--ch-type-13`, `--ch-text-tertiary`, `.ch-num`). The count is every document in that folder the viewer can read; it ignores the Show tab, the type filter and search, so it never jumps while filtering. Press: the main column filters to that folder (4.3.5), the URL gains `?folder=<id>` (pushState, so Back clears it), the row takes `--ch-bg-selected` with `--ch-selected-ink` text and glyph and `aria-current="true"`. Coach folders show a 24px ⋯ on hover or focus: Rename folder, Delete folder (4.8.4, 4.8.5). While files are dragged from the computer, a folder row lights with a 2px `--ch-border-focus` outline and its label reads "Drop to add to Travel"; dropping uploads there (coach).
- **Which folders exist** is unchanged: the union of `golf_document_folders` (coach only) and distinct `folder` values on visible rows, grouped by `lower(btrim(folder))`, null or blank as Team; the folder table's spelling wins, else the newest row's. An empty coach folder shows for coaches with count 0.
- **The app sidebar stays** exactly as it is (240px, 208px in the 821 to 1180px band, or the 56px folded rail, `shell.css:3975`, `:4262-4269`). The library rail is a second column inside the Documents tab, to the right of it, never a replacement for it.

#### 4.2.1 The group reveal (the mechanic Nick named)

```css
.ch-dl-g__b {
  display: grid;
  grid-template-rows: 1fr;
  transition:
    grid-template-rows var(--ch-dur-spring-smooth) var(--ch-ease-spring-smooth),
    opacity var(--ch-dur-base) var(--ch-ease);
}
.ch-dl-g[data-open='false'] > .ch-dl-g__b {
  grid-template-rows: 0fr;
  opacity: 0;
}
.ch-dl-g__b > .ch-dl-g__in {
  min-height: 0;
  overflow: hidden;
}
/* Closed rows leave the tab order and the accessibility tree once closed, and come back at once on open. */
.ch-dl-g[data-open='false'] > .ch-dl-g__b > .ch-dl-g__in {
  visibility: hidden;
  transition: visibility 0s linear var(--ch-dur-spring-smooth);
}
.ch-dl-g__caret {
  transition: rotate var(--ch-dur-base) var(--ch-ease);
}
.ch-dl-g[data-open='false'] .ch-dl-g__caret {
  rotate: -90deg;
}
```

- The curve is the house smooth spring: `--ch-ease-spring-smooth` is the `linear()` sample of `chSpringCurve('smooth')` with `--ch-dur-spring-smooth` 462ms where `linear()` is supported, else `--ch-ease` over 260ms (`tokens.css:721-722`, :1023-1029): the rows glide open and settle without a bounce. Opacity rides on the base beat so the rows are clear before the height finishes.
- A rail group is at most a few dozen 32px rows, so the row-height transition is cheap (the `coachhelm-standing.css:655-661` worry, a table row relayouting a board, does not apply). A Pinned group over 40 rows opens and closes with opacity only (`data-big`), the height changing at once.
- **Reduce Motion**: the global rule clamps every transition to 1ms (`base.css:302-312`), so groups open and close instantly and the caret snaps; with Settings > Animations off, `--ch-dur-*` are 0ms (`tokens.css:1033-1050`). Nothing else is needed.
- No haptic on open or close (iOS disclosure rows are silent; `haptics.ts:8-18` keeps `select` for choices).
- Focus stays on the label button through the toggle. Opening never scrolls.
- **Default**: every group open on first visit. Each viewer's open or closed state is remembered in `localStorage` (4.11), shared by the inline rail, the overlay rail and the phone headers.

### 4.3 The main column

#### 4.3.1 Type tiles (coach; these start creation)

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   ┌──────┐   │ │     ↑        │ │   ┌──┐___   │    152×88 coloured tiles, a line illustration in each
│   │▤▤▤▤▤▤│   │ │   ┌────┐     │ │   │      │   │
│   └──────┘   │ │   └────┘     │ │   └──────┘   │
└──────────────┘ └──────────────┘ └──────────────┘
 Practice plan    Upload           Folder             label under the tile, on the page
```

- One row of three `<button>`s at the top of the main column, gap 12px; each is a 152×88 tile (radius `--ch-radius-md`) with its label underneath (`--ch-type-14-medium`, `--ch-text-primary`, on the page), both inside the button. Accessible names contain the visible label (WCAG 2.5.3): "New practice plan", "Upload files", "New folder".
- **Practice plan** on `--ch-doc-ground-plan` (deep Clubhouse green): a sheet with a title line and three schedule rows. Goes to `/golf/dashboard/practice?new=1` (N-00). Only with N-00's flag on.
- **Upload** on `--ch-doc-ground-file` (deep slate): a tray with an arrow. Opens the file picker; files land in the folder the grid is filtered to when it is a coach folder or Team, else Team; each is shared with players as today (`upload.ts:52`).
- **Folder** on `--ch-doc-ground-folder` (deep clay): a folder outline. Opens New folder (4.8.3). Only when the folders table exists.
- Illustrations are inline SVG, `aria-hidden`, stroked in `--ch-doc-ground-ink` with a second tone `--ch-doc-ground-ink-soft` (both well over 3:1 on every ground, 7.5). On hover (fine pointer) the illustration rises 2px over `--ch-dur-quick` (`translate`, no scale); press: the house press tint on the tile. Reduce Motion: no rise (global clamp).
- Players see no tiles (they cannot create anything here). The tiles scroll away; the bar below sticks. Owner call 12.8.

#### 4.3.2 The sticky bar

```
[ All | Yours | Shared with players ]                                  [⌕] [⚟•] [≡] [+]
```

- `<div class="ch-dl-bar">` spanning the main column only (never over the rail), 56px tall, `position: sticky; top: var(--ch-topbar-h); z-index: var(--ch-z-sticky)` (the Calendar week head's precedent, `calendar.css:381-388`), background `--ch-bg-page` so cards pass under it. A hairline (`--ch-border-hairline`) shows under it only while it is stuck: a 1px sentinel above it and an `IntersectionObserver` set `data-stuck`; the line fades in over `--ch-dur-quick` (CH-10666), instant under Reduce Motion.
- **Left, coach**: `Segmented` (`ui/Segmented.tsx:31`, size `sm`) labelled "Show": All · Yours · Shared with players (rules in the table below). **Left, player**: the words "All documents" (`--ch-type-15-strong`); players get no tabs because everything they can read is shared. Under 860px of Hub width the bar starts with the library toggle (4.12.2).
- **Right**: four icon-only buttons, each the existing `IconButton` (`ui/Button.tsx:124-160`), whose tooltip is its `aria-label` (hover rest and keyboard focus, never touch, `ui/Tooltip.tsx`). Ghost variant, 32px drawn, gap 4px:

| Button | Icon | `aria-label` (and tooltip) | Does |
|---|---|---|---|
| Search | `Search` | "Search documents" (shortcut "/") | The bar's left part becomes a `SearchField` (placeholder and label "Search documents", up to 360px) with focus; the Search button hides while it shows. Esc on an empty field, or leaving it empty, puts the Segmented back. |
| Filter | `ListFilter` | "Filter and sort", or with a choice made "Filter and sort: PDFs, by name" | Opens the filter menu (4.3.3). A 6px `--ch-green-600` dot sits at its top right while a type or a non-default sort is chosen. |
| View | `List` in grid, `LayoutGrid` in list | "Show as list" / "Show as grid" | Switches grid and list; remembered per viewer (4.11). |
| New | `Plus` | "New" | Coach only. Opens the New menu (4.3.4). |

| Tab | Exactly which rows (from what the coach's read returns, which is every team row, `is_test` rows already hidden by `hiddenTestRows`, `hub.ts:285-295`) |
|---|---|
| **All** | Every row. |
| **Yours** | `uploaded_by = viewer's auth uid` (`session.userId` is `user.id`, `src/lib/auth/session.ts:92`). Includes plans this coach first published (N-00 keeps the first publisher). Rows with `uploaded_by` null (a deleted account, `ON DELETE SET NULL`, `20_constraints.sql:667`, or legacy seed rows) are in All only. |
| **Shared with players** | `is_public = true`. Leaves out coach-only files and taken-down plans. Exactly what a player on the team sees. |

The tab filters the grid; the rail does not follow it (the rail is the library's index, as claude.ai's list is). The phone label for the third tab is "Shared" (the option's `aria` keeps "Shared with players"). The tab is in the URL as `&show=yours` or `&show=shared` (replaceState, as `?tab=` is); All has no parameter.

**Search** is client-side, as you type, no debounce (a team's list is hundreds of rows at most). It matches, case- and accent-insensitively (`normalize('NFD')`, combining marks removed, lower case), against the title, the folder's name and a plan's focus line (`description` on plan rows); every word typed must match somewhere (AND), in any order. It filters the grid in place, on top of the tab, the folder and the type. Server search is not needed: `getDocuments` returns the whole team list (`documents.ts:196-202`, no range); the 1,000-row cap is handled in 10.3.

#### 4.3.3 The filter menu (type and sort together)

A `Menu` (`ui/Menu.tsx:13-35`) labelled "Filter and sort", aligned to the button's end, one choice per group, `checked` on the current item:

```
✓ All types
  Practice plans
  PDFs
  Images
  …                      (only kinds present among visible rows)
  ─────────
✓ Sort by recent
  Sort by last opened    (only when the opens table exists)
  Sort by name
  Sort by type
```

`Menu` has items and separators only, no group headings (`Menu.tsx:13-15`), so each sort item carries "Sort by". Picking applies at once and closes the menu (the Menu's own behaviour), `haptic('select')`.

Kinds, from `fileKind` and `KIND_OF_MIME` (`hub.ts:895-921`), in this order:

| Kind | Label | From |
|---|---|---|
| plan | Practice plans | `practice_plan_id` not null |
| pdf | PDFs | `pdf` |
| image | Images | `png`, `jpg`, `jpeg`, `gif`, `webp`, `heic`, `heif`, `svg` |
| doc | Docs | `doc`, `docx`, `txt`, `md` |
| sheet | Sheets | `xls`, `xlsx`, `csv` |
| slides | Slides | `ppt`, `pptx` |
| video | Videos | `mp4`, `webm`, `mov` (`video/quicktime`) |
| other | Other | anything else (`zip`, unknown) |

"Links" is not offered: the app has no link documents (`upload-rules.ts:9-31`). Owner call 12.7.

Sorts:
- **Recent** (default): `updated_at` newest first, then `created_at`. For a plan that is its last publish.
- **Last opened**: the viewer's `opened_at` newest first; never-opened documents follow in Recent order. Chosen by the rail's View all.
- **Name**: `title` A to Z with `localeCompare(…, { numeric: true, sensitivity: 'base' })`, so "Week 2" comes before "Week 10".
- **Type**: the kind order above, then Name.

The rail's Pinned keeps pin order and Recents keeps open order whatever the sort. Type and sort are remembered per viewer (4.11).

#### 4.3.4 New

The rail's New row, the bar's +, the type tiles and (phone) the top bar's + all start the same three things: "Upload files" (`Upload`), "New folder" (`FolderPlus`, only when the folders table exists), "New practice plan" (`ClipboardCheck`, only with N-00's flag on). From the rail and the bar it is a `Menu` labelled "New" with those items; the tiles go straight to one each.

Team Hub's desktop head keeps no primary on the Documents tab, as today (`TeamHub.tsx:483-493`: "Documents' own drop zone is its primary"); the library's New takes the drop zone's place. Players get no New anywhere.

**The old drop zone** goes. On desktop the main column accepts a drop of files from the computer (coach): while files are dragged over it, the grid lights with a 2px `--ch-border-focus` outline and a line "Drop to add to Travel" (or "to Team"); dropping uploads into the folder the grid shows, else Team. Rail folder rows take a drop for their folder (4.2). Lighting is instant (no motion). The empty state keeps an "Upload files" button so a first file never needs a drag.

#### 4.3.5 Folder filter and breadcrumb

- Choosing a folder (rail row, phone folder row, or `?folder=` on arrival, 3.2) filters the grid to that folder and draws, under the bar:

```
All documents  ›  Travel   4                                             [⋯]
```

- `<nav aria-label="Breadcrumb">`: "All documents" is a button (`--ch-type-15`, `--ch-text-secondary`) that clears the filter; `ChevronRight` 14px `--ch-text-tertiary`, `aria-hidden`; the folder name (`--ch-type-17-strong`, `aria-current="page"`); the count (`--ch-type-13`, tertiary, `.ch-num`); for a coach folder a 32px ⋯ IconButton "More for Travel" with Rename folder and Delete folder. Practice plans and Team have no ⋯.
- Clearing: "All documents", the rail's View all, Back (the folder came in with pushState), or Escape when focus is in the breadcrumb.
- While search has text, a line takes the breadcrumb's place or sits under it: "4 documents match "lag"" (`--ch-type-13-strong`), the polite live region (CH-10861). With a folder chosen it reads "4 documents in Travel match "lag"" and offers a "Search all documents" button that clears the folder.

### 4.4 Cards (grid)

```
┌────────────────────────────────────┐   card: --ch-bg-surface, 1px --ch-border-hairline, radius 16, no shadow
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓[⋯] [📌]▓│   thumbnail: tinted ground, aspect 2:1, chips top right on hover or focus
│▓▓▓▓▓┌─┌─┌──────────────────┐▓▓▓▓▓▓│   stacked sheets behind (plans with v2 or later)
│▓▓▓▓▓│ │ │  mini page       │▓▓▓▓▓▓│   mini page: centred, top-padded, clipped at the bottom
│▓▓▓▓▓│ │ │  (PlanGlance)    │▓▓▓▓▓▓│
├────────────────────────────────────┤
│ [▣]  Thursday practice          ◍  │   36px type icon tile · one-line title · people glyph when shared (coach)
│      Published 2h ago              │   meta
└────────────────────────────────────┘
```

(The pin and people glyphs in the drawing are placeholders for lucide `Pin` and `Users`; no emoji ship.)

**Grid**: flat, in the chosen sort. `grid-template-columns: repeat(3, minmax(0, 1fr))` when the main column (container `chdlmain`) is 760px or wider, `repeat(2, minmax(0, 1fr))` below; gap 20px. At 1440px with the sidebar open the main column is 864px: three cards of (864 − 2×20) / 3 = 275px. At 1280px it is 704px: two cards of (704 − 20) / 2 = 342px. Owner call 12.16.

**Card**: `--ch-bg-surface`, 1px `--ch-border-hairline`, radius `--ch-radius-card` (16px), `overflow: hidden`, no shadow. The whole card opens: the title is the link or button (`<a href>` for a plan so cmd-click opens a tab, `<button>` for a file) and its `::after` covers the card; the chips sit above it, so nothing interactive is nested. Accessible name: "Thursday practice, practice plan, published 2 hours ago, shared with players".

**Thumbnail** (`DocThumb`, all `aria-hidden="true"`, `inert`, `pointer-events: none`; the bottom row carries the meaning):
- Area: `aspect-ratio: 2 / 1`, full card width, flush to the card's top corners (clipped by the card's radius).
- **Practice plan**: ground `--ch-doc-ground-plan`. A mini page (`--ch-doc-sheet`, 1px `--ch-doc-sheet-edge`, radius 6px on the top corners, `box-shadow: 0 8px 18px -10px rgb(0 0 0 / 0.5)`) 78% of the thumbnail's width, centred, its top 9% of the width below the thumbnail's top, running past the bottom and clipped there. Inside it, N-00's `PlanGlance size="card"` (a cut of the plan document, N-00 4.10: the eyebrow, the title, the facts line and the first schedule rows with time, block and place; no day strip) drawn in a 320px-wide box and scaled to the page's width with `transform: scale(var(--ch-dl-k))`, where `--ch-dl-k` = page width / 320, written once on the grid by one `ResizeObserver` (every card in a grid has the same width). Scaling is fine here because it is a picture: it is `aria-hidden`, `inert` and takes no pointer, so no hit area moves, and it only ever scales down. Data from `loadPlanGlances` (8.8) after the tab first shows; until then the page shows still skeleton bars (CH-10460).
- **Stacked sheets**: a plan with `version_count` 2 shows one sheet behind its page, 3 or more shows two. Each back sheet is the page's size, `--ch-doc-sheet-back` with the same edge, offset 6px up and 6px right per step, drawn under the page. Static.
- **PDF, Doc, Sheet, Slides, Video, Other**: ground `--ch-doc-ground-file`, the same mini page. On it: the kind label ("PDF", `--ch-type-11-strong`, letter-spaced, `--ch-doc-sheet-ink-soft`), the title (`--ch-type-15-strong`, two lines, `--ch-doc-sheet-ink`), then four placeholder bars (8px, radius `--ch-radius-mark`, `--ch-doc-sheet-bar`, widths 92%, 84%, 88%, 60%). A sheet file draws the bars as a 3-by-4 cell grid; slides draw a landscape page (16:9) with one title bar; video draws `Film` at 24px in `--ch-doc-sheet-ink-soft`. No first-page render (owner call 12.5: no PDF reader in the app; `jspdf` writes only).
- **Image**: the image itself fills the whole area, `object-fit: cover`, `loading="lazy"`, `decoding="async"`, from the signed thumbnail URL (8.8). No ground, no page. Over 8 MB, or a HEIC or HEIF the browser cannot draw (`img.onerror`), gets the file treatment with the label "Image". SVG draws in an `<img>`, which runs no script. While loading: the slate ground under a still shimmer (CH-10460).

**Bottom row**: `display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 12px; padding: 12px 14px 14px; align-items: center`.
- **Type icon tile**: 36×36, radius `--ch-radius-sm`. Plan: `--ch-bg-selected` with `ClipboardCheck` 18px in `--ch-green-600`. Everything else: `--ch-bg-subtle`, 1px `--ch-border-hairline`, the kind's glyph 18px in `--ch-text-secondary`.
- **Title**: one line, ellipsis, `--ch-type-15-medium`, `--ch-text-primary`; the full title is in the accessible name and, on desktop, a `title` tooltip.
- **Meta** under it, `--ch-type-13`, `--ch-text-tertiary`, the first that applies:
  - Plan, published once: "Published 2h ago". Republished: "Updated 1:02 PM · v3" (today's time as a clock time, otherwise the `relativeTime('short')` date). Coach view of a taken-down plan: "Taken down" in `--ch-text-secondary`.
  - A document the viewer has opened: "Opened 10m ago" (`relativeTime(at, 'short')`: under a minute "just now", under 7 days "10m ago", "2h ago", "3d ago", then the date "Oct 14"). With sort Last opened this line always leads.
  - Other files: "Added Oct 10", or "Updated Oct 12 · v2" when `version_count > 1`.
  - Changed since the viewer opened it (`updated_at > opened_at`): a 6px `--ch-green-600` dot before the meta, which reads "Updated since you opened it".
- **People glyph**: `Users` 16px `--ch-text-tertiary` at the right when shared with players, coach view only (for a player everything is shared); folded into the card's accessible name.

**Hover or focus** (fine pointer hover, or `:focus-within` from the keyboard):
- The border moves from `--ch-border-hairline` to `--ch-border-strong` over `--ch-dur-quick` (CH-10663). No fill change, no lift, no shadow.
- Two round chips fade in at the thumbnail's top right (opacity over `--ch-dur-quick`, CH-10665), 10px from the top and right edges, 6px apart, in claude.ai's order: **⋯** ("More for Thursday practice", opens the menu, 4.7) then **pin** ("Pin Thursday practice" / "Unpin Thursday practice", `aria-pressed`, a one-tap write, 6). Each chip is 28px, `--ch-doc-chip-bg` with a 1px `--ch-doc-chip-edge`, glyph 15px `--ch-doc-chip-ink`. They are opaque so their glyphs read on any ground or photo.
- **A pinned card always shows its pin chip**, on: `--ch-doc-chip-on-bg` with `--ch-doc-chip-on-ink`. The ⋯ still waits for hover or focus.
- Touch devices (no hover): the ⋯ chip always shows; the pin chip shows only on pinned cards (pinning is in the menu).
- Focus ring: the card's link draws `--ch-border-focus` 2px with 2px offset around the whole card (on the page); a chip's own ring is `--ch-border-focus-on-dark` (champagne, `tokens.css:230`) 2px, which holds 5.88:1 or more on every ground (7.5).
- **Press**: the house press tint (`data-ch-pressed`, `--ch-dur-press-delay`), no scale.

### 4.5 Rows (list, desktop; and every row on the phone)

```
[thumb 48] Thursday practice                       Practice plans   Updated 1:02 PM · v3    ◍   [⋯]
           Lag putting and wedges inside 100
```

- **Desktop list** (the bar's View button): `DocThumb` at 48×48 (radius `--ch-radius-sm`; the same ground and mini page at that size, or the image), title (`--ch-type-15-medium`) over a second line (the plan's focus line or the file's size and type, `--ch-type-13` tertiary), the folder (only when no folder is chosen), the meta, the people glyph (coach), ⋯ (32px). Min height 64px; hairline seams between rows (`hub.css:1694-1696`). Hover: `--ch-bg-hover` fill and the pin button appears before the ⋯ as on cards.
- **Phone rows**: `DocThumb` at 56×56, radius 10px; title (`--ch-type-16-medium`, two lines max) over the meta (`--ch-type-13`, tertiary; in Pinned, Recents and search results prefixed with the folder: "Travel · Opened 2h ago"); the people glyph (coach); the ⋯ as a 44×44 button at the right edge. Min height 72px (56 + 2×8). At 390px: 390 − 2×16 = 358px row, less 56 thumbnail, 12 gap, 20 glyph and 44 ⋯ leaves 226px for the text.
- Long press on a phone row (500ms, `CTX_HOLD_MS`, `ContextMenu.tsx:20`) opens the same menu as a `MenuSheet` with `haptic('press')`; right-click on a desktop card, row or rail row opens it at the pointer (`useContextMenu`), and so do Shift+F10 and the context-menu key on focus.

### 4.6 Search results

- No separate section: the grid or list filters in place (4.3.2), with the count line (4.3.5). Each card or row then shows its folder (cards in the meta: "Travel · Opened 2h ago").
- No match: `EmptyState` CH-10360 "No documents match "lag"" + "Check the spelling, or clear the search." + "Clear search"; with a folder chosen, also "Search all documents".

### 4.7 Menus by role

Every item is enforced on the server, not only hidden (8.1, 8.5).

**File, coach**

| Item | Does | Through |
|---|---|---|
| Open | as a card press (4.10) | `hub.openDocument` |
| Pin / Unpin | adds or removes the viewer's pin (the same write as the card's pin chip); toast "Pinned" / "Unpinned", `haptic('success')` | `pinDocument` / `unpinDocument` (8.9) |
| Rename | FormSheet "Rename", field "Name", Save | `updateGolfDocument({ title })` |
| Move to folder | ListSheet "Move to", the coach folders, Team, then "New folder…"; the current folder checked; Practice plans not offered | `updateGolfDocument({ folder })` |
| Share with players (checked when on) | toggles `is_public`. Off: toast "Only coaches can see Local rules now". On: "Players can see Local rules now" | `updateGolfDocument({ player_visible })` |
| Download | saves the file under its title (signed URL with a download name) | `getDownloadUrl` (8.9) |
| separator | | |
| Delete file (danger) | ConfirmDelete CH-10503, unchanged | `hub.delete` → `deleteGolfDocument` |

**Practice plan, coach**

| Item | Does |
|---|---|
| Open plan | the plan page |
| Pin / Unpin | as above |
| Copy link | copies `https://<host>/golf/dashboard/practice/plan/<id>`; toast "Link copied. Only your team can open it." |
| Print or save as PDF | N-00's print studio `/golf/dashboard/practice/print/<id>` |
| What changed (only when v2 or later) | the plan page at `#changes` (N-00's "see what changed") |
| separator | |
| Take down… (published) / Republish… (taken down) | N-00's plan page at `?takedown=1`, or the plan page's Publish |

Rename, Move, Share and Delete are not offered for a plan: its title, folder and visibility belong to the plan (N-00), and the `090300` guard refuses a move out of Practice plans on the server.

**File, player**: Open, Pin / Unpin, Download.

**Practice plan, player**: Open plan, Pin / Unpin, Copy link.

**Folder (coach, coach folders only)**: "Rename folder" (FormSheet, 4.8.4), "Delete folder" (danger, 4.8.5). Reached from the rail row's ⋯, the breadcrumb's ⋯, right-click on the rail row, or a long press on a phone folder row. Never on Practice plans or Team.

The menus, their items and who gets them are unchanged by the layout revision; only where they open from moved (card chip, rail row ⋯, breadcrumb ⋯).

### 4.8 Sheets

#### 4.8.1 Rename (file)
`FormSheet` title "Rename", action "Save", one `FormLine` "Name" prefilled with the title, selected on open. Validation before sending: empty after trim → CH-10160 "Give it a name."; over 120 characters → CH-10163 "Keep it under 120 characters." `dirty` when changed. Saving: CH-10461 "Saving…". Done toast "Renamed to Local rules 2026". Failure CH-10060 "Couldn't rename Local rules" + the server's reason or "Try again." The card's title changes optimistically and goes back on failure.

#### 4.8.2 Move to
`ListSheet` title "Move to", subtitle the file's title. Rows: Team, then coach folders A to Z, then "New folder…". The current one checked and inert. A tap moves at once and closes: toast "Moved to Travel". Failure CH-10061 "Couldn't move Local rules" + Retry. "New folder…" opens 4.8.3 and, on save, moves the file into the new folder.

#### 4.8.3 New folder
`FormSheet` title "New folder", action "Create", field "Name". Validation: empty → CH-10160; over 60 → CH-10163 "Keep it under 60 characters."; "Team" or "Practice plans" in any case → CH-10162 "Team and Practice plans are kept by GolfHelm. Pick another name."; an existing folder name (table or text, case-insensitive) → CH-10161 "There's already a folder called Travel." Done: toast "Travel created"; its rail row appears in its A to Z place (the Folders list opens if it was closed) and the grid filters to it, showing CH-10365. Failure CH-10064.

#### 4.8.4 Rename folder
`FormSheet` "Rename folder", field "Name" prefilled. Same validation (CH-10160 to CH-10163). Calls `golf_document_folder_rename` (8.3), which renames the folder and moves every file in it in one statement. Done: "Travel is now Away trips". The rail row, the breadcrumb and `?folder=` follow the new name. Failure CH-10065.

#### 4.8.5 Delete folder
`ConfirmDelete` CH-10560: "Delete the folder Travel?" + "Its 4 files move to Team. No file is deleted." (empty folder: "It has no files.") Keep it / Delete. `haptic('warning')` before the question (CH-10702 grammar). Calls `golf_document_folder_delete`. Done: "Travel deleted. 4 files are in Team now." If the grid was filtered to it, the filter clears to All documents. Failure CH-10066.

#### 4.8.6 Phone: Filter and sort
`ListSheet` "Filter and sort" (from the 44×44 `ListFilter` button beside the search): "Type" radio rows (All types, then the kinds present, 4.3.3); "Sort" radio rows Recent, Last opened (only with the opens table), Name, Type. Each tap applies at once with `haptic('select')`. No view rows: the phone always shows rows.

#### 4.8.7 Preview (desktop, images and PDFs)
A `Modal` (`ui/Modal.tsx`) over the page: header with the title, "Download" and "Open in new tab" buttons and Close; body the image (`object-fit: contain`, max 80vh) or the PDF in an `<iframe>` from the signed URL. Esc closes. Opened through the same `hub.openDocument` action, which returns the signed URL; the blank-tab trick (`TeamHub.tsx:265-268`) is skipped for these kinds on desktop. On the phone layout every file keeps opening in a new tab as today (iOS opens its own viewer; an iframe PDF on iOS shows only its first page). Other kinds open in a new tab on both.

### 4.9 States

| State | What shows |
|---|---|
| Loading the page | Team Hub's loading (CH-10405) unchanged |
| Loading previews (after the tab first shows) | Plan cards: the green ground and a mini page with still skeleton bars; image cards: the slate ground under a still shimmer (CH-10460). Never a spinner. |
| Documents didn't load | `RefreshNotice` CH-10204 "Documents didn't load." + "Your files are safe. Try again." (unchanged); the rail, the tiles and the bar are not drawn |
| Pins or opens didn't load (tables present, read failed) | The rail draws without Pinned and Recents, with one quiet line at its top (phone: above the Folders header): CH-10261 "Pinned and Recents didn't load. Your files are below." + Try again |
| Previews didn't load | Plan cards keep the ground and the empty mini page; images take the file treatment; nothing else (CH-10260 logged, not shown) |
| No documents at all | Coach: `EmptyState` CH-10304 "No documents yet" + "Files you share show here in folders. Published practice plans file themselves in Practice plans." + "Upload files". Player: CH-10304 "No documents yet" + "Files your coaches share show here." |
| Yours empty | CH-10361 "Nothing you've added yet" + "Files you upload and plans you publish show here." |
| Shared with players empty | CH-10362 "Nothing is shared with players" + "Use Share with players on a file's menu." |
| Type filter empty (rare: filter kept from another tab) | CH-10363 "No practice plans here" + "Clear filter" |
| Search empty | CH-10360 (4.6) |
| Empty coach folder | In the grid when filtered to it: CH-10365 "Nothing in Travel yet" + "Move files here, or drop them on this folder." (no card) |
| Practice plans, none yet (coach) | In the grid when filtered to it: CH-10364 "Plans you publish are filed here." + "New practice plan" (only with N-00's flag) |
| One document | One card; the rail shows Folders only; Recents appears after the first open |
| Many (200+) | The grid renders every card (a team has hundreds at most); images lazy-load; rail lists closed by the viewer stay closed; a Pinned list over 40 rows skips the height animation (4.2.1) |
| Long names | Card and rail titles one line with ellipsis (phone rows two lines); the full title is in the accessible name and a tooltip on desktop |
| Long folder names | Rail row and breadcrumb ellipsis at one line; count never truncated |
| Offline | The last loaded page stays; writes refuse with the shell's offline notice; previews already loaded stay |
| Taken-down plan (coach) | Card stays in Practice plans with "Taken down"; not in Shared with players |
| A pin or open on a file the viewer can no longer see | Not drawn (the read joins through `golf_documents` under RLS) |

### 4.10 Opening

- **Practice plan**: `router.push('/golf/dashboard/practice/plan/<id>?from=docs')`. The plan page draws, not a file viewer. `?from=docs` lets N-00's phone pushed bar say "Documents" and return to `/golf/dashboard/team-hub?tab=docs&folder=practice-plans` (needs N-00, see changelog). Desktop uses the browser back.
- **Image or PDF on desktop**: the preview modal (4.8.7).
- **Everything else, and every file on the phone**: a new tab with the signed link, exactly today's path (`TeamHub.tsx:262-286`, CH-10004).
- Every open calls `markOpened(id)` without waiting (8.5): the rail's Recents and "Opened 10m ago" update locally at once; a failure is silent and logged once.
- Back to Documents: Team Hub's tab, `?show=` and `?folder=` are in the URL, rail lists are in `localStorage`, and the browser restores the scroll, so the viewer lands where they were.

### 4.11 What is remembered, and where (owner call 12.1)

Recommendation: **`localStorage`, per viewer, per device**, every read and write wrapped in try/catch (private mode or blocked storage falls back to defaults, never throws):

| Key | Value |
|---|---|
| `ch.docs.v1.<userId>.<teamId>.groups` | `{ "pinned": false, "recents": false, "folders": false }`, only the closed lists (open is the default). One key shared by the inline rail, the overlay rail and the phone headers. |
| `ch.docs.v1.<userId>.view` | `"grid"` or `"list"` (desktop; the phone always shows rows) |
| `ch.docs.v1.<userId>.<teamId>.prefs` | `{ "sort": "recent" \| "last-opened" \| "name" \| "type", "type": null \| kind }` |

The folder filter is not stored: it lives in the URL (`?folder=`), so a fresh visit opens on All documents. The user id is in the key so two accounts on one iPad keep their own state. The other version: a small `golf_document_view_prefs` table (user_id PK, jsonb) read with the library, so a coach's closed lists follow them from the laptop to the phone. Not written as SQL here because the default needs none; it would be a fifth held migration on the same RLS pattern as pins.

### 4.12 Desktop and phone layout

#### 4.12.1 Desktop, wide enough for the rail (Hub content 860px and up)

- The Documents tabpanel is a grid `grid-template-columns: 232px minmax(0, 1fr); gap: 24px; align-items: start`: the rail (4.2), then the main column (`container: chdlmain / inline-size`): type tiles (coach), 24px, the sticky bar, the breadcrumb or count line when there is one (12px above and below), the grid or list. The Team Hub head and tab strip stay above it, full width, unchanged.
- The switch is a container query on the Hub (`.ch-hb` is the `chhb` container, `hub.css:2-4`), not the viewport, so the app sidebar's fold counts: `@container chhb (min-width: 860px)`. Arithmetic, from the page gutter and sidebar widths (`tokens.css:361`, `shell.css:4262-4269`) and the Hub's 1200px measure (`tokens.css:359`):
  - 1181px and wider, sidebar open (240px, gutter 40): content = min(vw − 240, 1200) − 80. At 1181 that is 861 (rail inline); at 1280, 960 (main column 704, two columns); at 1440, 1120 (main column 864, three columns).
  - 821 to 1180px, sidebar open (208px, gutter 28): content = vw − 208 − 56, so the rail is inline from 1124px. With the sidebar folded to its 56px rail: content = vw − 56 − 56, inline from 972px (a 1024px iPad Pro landscape: 912, main column 656, two columns of 318).
- Spacing: 24px between the tiles and the bar; 20px grid gap; 16px between rail groups.

#### 4.12.2 Desktop, narrower (821px up to Hub content under 860px): the rail as an overlay

- The rail is not drawn inline. The bar starts with a `PanelLeft` `IconButton` "Show library" (32px, before the Segmented).
- Pressing it opens the same `DocRail` as a panel 280px wide from the left edge of the canvas (right of the app sidebar, which stays), from under the top bar to the bottom, over `--ch-scrim` on the rest of the canvas, `z-index: var(--ch-z-overlay)`. It is `role="dialog"`, `aria-modal="true"`, `aria-label="Library"`; focus moves to its first row and stays in it; Esc, a press on the scrim, choosing a folder, choosing a document or View all closes it, and focus returns to "Show library". Lenis leaves it alone (`[role="dialog"]`, `smooth-scroll.ts:198`).
- Motion (CH-10664): the panel slides in from `translate: -100% 0` on the smooth spring (`--ch-dur-spring-smooth`, `--ch-ease-spring-smooth`) and the scrim fades over `--ch-dur-base`; closing reverses. Reduce Motion: it appears and goes at once (global clamp).
- Group open and closed states are the same keys as the inline rail (4.11).
- The grid is two columns at these widths (main column under 760px).

#### 4.12.3 Phone (820px and narrower, `CH_PHONE_QUERY`, `use-phone.ts:7`)

```
Team Hub                                      [+]     PhoneTop; + is the coach's New (ActionSheet)
[Home|Announcements|Travel|Documents|Tasks]
[ All  |  Yours  |  Shared ]                           coach Segmented, full width
[⌕ Search documents                  ] [⚟]            44px search, 44×44 filter
Pinned ▾
 [56] Thursday practice                  ◍  [⋯]
      Published 2h ago
Recents ▾
 [56] Travel waiver                          [⋯]
      Travel · Opened 2h ago
      View all
Folders ▾
 [▣]  Practice plans                     12   ›
 [▢]  Team                                3   ›
All documents  24                                     h2, not collapsible
 [56] Local rules                        ◍  [⋯]
      Opened 10m ago
```

- The Hub's padding (`--ch-page-x-phone`: 16px, 20px from 414px wide, `tokens.css:394`, `:1167-1170`).
- **Top**: the coach `Segmented` "Show" full width (All · Yours · Shared); players get none. Then a 44px `SearchField` and, at its right, a 44×44 `ListFilter` button "Filter and sort" that opens the Filter and sort sheet (4.8.6).
- **Groups**: Pinned, Recents and Folders headers, each a full-width 44px `<button>` with the word (`--ch-type-15-strong`, `--ch-text-secondary`) and the 12px caret after it, `aria-expanded`, `aria-controls`, the same reveal, caret turn and Reduce Motion behaviour as the rail (4.2.1), the same remembered state (4.11). Pinned and Recents list phone rows (4.5); Recents shows 8 and a "View all" row that clears any folder, sets the sort to Last opened and scrolls to "All documents". Folders lists 56px rows: a 40×40 tile (`--ch-bg-selected` and `ClipboardCheck` for Practice plans, `--ch-bg-subtle` and `Folder` for the rest), the name, the count and a `ChevronRight`; a coach folder row's long press offers Rename folder and Delete folder.
- **All documents**: an `h2` with its count, then every visible document as phone rows, in the sort. Choosing a folder (pushState `?folder=`) replaces the three groups with the breadcrumb (4.3.5) and that folder's rows; Back or "All documents" returns, with the page scrolled to where it was.
- **+**: the top bar's action (`PhoneIconAction`, `TeamHub.tsx:536`), coach only, label "New". It opens an `ActionSheet` titled "New" whose rows are the type tiles: "Practice plan", "Upload", "Folder", each with its tile's colour as a 28px rounded glyph tile (same tokens, same conditions as 4.3.1). There are no type tiles on the page.
- No grid on the phone: rows only (the View button is not drawn). No hover chips: the ⋯ is always there, and the pin glyph sits after the meta on a pinned row.
- The groups and the list stack with 16px between them.

### 4.13 Targets (with arithmetic)

| Target | Size |
|---|---|
| Rail rows (desktop fine pointer) | 32px tall, full rail width (WCAG 2.5.8 needs 24; the Settings rail's rows are the same height) |
| Rail group labels | 28px drawn, full rail width; hit 32px with 2px padding above and below |
| Rail row ⋯ | 24×24, inside the row's 32px height |
| Overlay rail rows (touch-capable widths) | 44px tall (`@media (pointer: coarse)`) |
| Type tiles | 152×88 plus the label, the whole button |
| Bar icon buttons | 32×32 drawn on desktop (gap 4px); 44×44 hit under `pointer: coarse` |
| Card chips (⋯, pin) | 28px drawn; on touch a `::before` inset −8px makes 44×44 (28 + 2×8 = 44); 6px apart, never overlapping |
| Breadcrumb ⋯ | 32×32 |
| Phone group headers | 44px tall, full row |
| Phone rows | 72px tall; ⋯ 44×44 |
| Phone search, filter | 44px; 44×44 |
| Phone + | the top bar's 44×44 action |

Measured budget for the reveal: a rail group of 40 rows of 32px is 1,280px of height in one small block; the grid beside it does not move (the rail is its own column). Verified on device in slice 1 (13).

---

## 5. Motion and haptics

### 5.1 Animations

| What | Motion | Reduce Motion |
|---|---|---|
| Rail and phone group open/close (CH-10660) | `grid-template-rows` 0fr↔1fr on the smooth spring (`--ch-dur-spring-smooth`, `--ch-ease-spring-smooth`, 462ms `linear()` where supported, else 260ms `--ch-ease`) plus opacity over `--ch-dur-base`; height skipped above 40 rows | instant (1ms global clamp, `base.css:302-312`); Animations off: 0ms |
| Caret (CH-10661) | rotate 0↔−90deg over `--ch-dur-base` `--ch-ease` | instant |
| Grid↔list (CH-10662) | content crossfade over `--ch-dur-quick` (`chTween('quick')`), no layout morph | instant |
| Card hover and press (CH-10663) | border to `--ch-border-strong` over `--ch-dur-quick`; press tint after `--ch-dur-press-delay`; no scale, no lift | instant |
| Overlay rail (CH-10664) | panel `translate` −100%→0 on the smooth spring; scrim opacity over `--ch-dur-base` | instant |
| Card chips (CH-10665) | opacity 0→1 over `--ch-dur-quick` on hover or focus | instant |
| Sticky bar edge (CH-10666) | the hairline fades in over `--ch-dur-quick` when the bar sticks | instant |
| Type tile illustration | rises 2px over `--ch-dur-quick` on hover | none (instant) |
| Folder filter | the grid swaps its cards with no motion; the breadcrumb appears at once | the same |
| Menus | `Menu`'s own `CH_POP` (scale from the anchor) | Menu's own |
| Sheets | `FormSheet`/`ListSheet`/`ActionSheet` own springs | their fade or instant |
| New folder appears | its rail row mounts inside the open Folders group; the grid filters to it | the same |
| Card removed (delete, move out of the shown folder, unshare under Shared tab) | `ListPresence` exit (opacity over quick), neighbours reflow without motion | instant |

No staggers, no count-ups (`motion.ts` doctrine, :12-15). Durations only from tokens (`motion-durations-pinned.test.ts`).

### 5.2 Haptics

| When | Kind |
|---|---|
| Tab, filter or sort choice, view, folder chosen, Move target picked | `select` (CH-10701 grammar; Segmented already ticks) |
| Long press opens the menu sheet | `press` (CH-10761) |
| Pin, unpin, rename, move, share toggle, new folder, folder rename landed | `success` (CH-10760) |
| Delete file or folder, before the question | `warning` (CH-10702) |
| Any of those writes failed | `error` |
| Rail or phone list open or close, overlay rail open or close, type tile press (it opens a sheet, picker or page) | none |

---

## 6. Interaction

- A card, row or rail row press opens (4.10). The ⋯ opens the menu. On desktop, Enter on a focused card opens; Shift+F10 or the menu key opens its menu.
- The pin chip (on hover or focus, and always on a pinned card) is a one-tap write; it flips at once (optimistic), the rail's Pinned list gains or loses the row in the same frame, and both revert on failure with CH-10063 "Couldn't pin Thursday practice" + Retry.
- Share with players flips at once; under the Shared tab an unshared card leaves with `ListPresence`.
- Rename and move are optimistic in the list; the server's answer settles them; on failure they go back.
- Uploads keep today's batch toast ("3 files shared with the team"); new cards appear after `refresh()` (`TeamHub.tsx:296`).
- Search keeps focus while results update; Arrow Down from the search field moves into the first result.
- `?folder=` arrival: filter, breadcrumb, focus once (3.2). A folder chosen in the rail pushes `?folder=`; Back clears it.
- No drag to reorder or to move a card onto a rail folder, no multi-select in v1 (owner call 12.10). Files dragged in from the computer upload (4.3.4).

---

## 7. Accessibility

### 7.1 Structure
- The library is the Documents `tabpanel` (as now). Inside it: the rail `<nav aria-label="Library">` (inline), or the overlay `role="dialog"` "Library"; then the main column.
- Rail groups: each label button sits in an `h2` (so VoiceOver's heading rotor lists Pinned, Recents and Folders), with `aria-expanded` and `aria-controls`; the list under it is a `<ul>` with `id="ch-dl-g-<id>"`; closed rows are `visibility: hidden` after the close (not in the tab order, not read). The current folder row has `aria-current="true"`.
- Type tiles are a `group` "Create" of three buttons. The coach tabs are the `Segmented` radio group "Show". The bar's icon buttons are named by their `aria-label` (their tooltip shows the same words). The filter button is a menu button (`aria-haspopup="menu"`, `aria-expanded`).
- The breadcrumb is `<nav aria-label="Breadcrumb">` with `aria-current="page"` on the folder. The grid heading for screen readers is a visually hidden `h2` ("All documents" or "Travel").
- Grid and list are both `<ul role="list">` of items; a card is one interactive element plus its chips; thumbnails are `aria-hidden` and `inert`.
- Phone: the three group headers are `h2` buttons as on the rail; "All documents" is an `h2`.

### 7.2 VoiceOver
- Rail group: "Pinned, expanded, button, heading level 2" / "collapsed".
- Folder row: "Travel, 4 documents, button"; current: "Travel, 4 documents, current, button".
- Card: "Thursday practice, practice plan, updated 1:02 PM, version 3, shared with players, link"; chips: "More for Thursday practice, menu button", "Pin Thursday practice, toggle button, not pressed".
- Bar: "Filter and sort: PDFs, by name, menu button"; "Show as list, button"; "Show library, button" (narrow desktop).
- Search: live region "4 documents match lag" (polite, once per change, 300ms after typing stops) (CH-10861).
- Toasts as today.

### 7.3 Text Size
- Every text uses `--ch-type-*` roles (multiples of `--ch-type-k`, `tokens.css:246-249`), so rail rows, labels, titles, meta, headers and the bar's Segmented follow iPhone Text Size. Rail rows and cards grow taller; rail and phone rows wrap nothing but the phone title (two lines). The grid keeps its column count; at the largest sizes a card's bottom row lets the title wrap to two lines.
- The one exception is the thumbnail: the mini page and the plan's `PlanGlance` inside it are a picture of the document (`aria-hidden`), scaled to fit as claude.ai's thumbnails are. Its information is in the title and meta, which do scale.

### 7.4 Keyboard
Order: the rail (New, Search, then each group label and its rows; arrows move between rows, Tab leaves the rail), the type tiles, the bar (library toggle when shown, Show tabs, Search, Filter, View, New), the breadcrumb, then the grid (each card's link, its ⋯ chip, its pin chip; chips show on focus). "/" anywhere outside a field opens and focuses the search (the Search button's tooltip shows it). Enter on a card opens it; Shift+F10 or the menu key opens its menu. Esc in search clears it, then closes it; Esc in a menu, sheet or the overlay rail closes it and returns focus to what opened it.

### 7.5 Colour tokens and contrast (WCAG formula on hex; light / dark)

New tokens, scoped to the library in `hub-docs.css`: light under `[data-ui='clubhouse'] .ch-dl`, dark under `html[data-fw-theme='dark'] [data-ui='clubhouse'] .ch-dl` (GolfHelm's own theme switch, `tokens.css:757`; the dark selector outweighs the light one). The grounds stay deep in both themes, as claude.ai's do, so one set of chips works on all of them.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--ch-doc-ground-plan` | #0f4a2f | #174a33 | plan thumbnails, the Practice plan tile |
| `--ch-doc-ground-file` | #2e3a46 | #2a3540 | PDF and file thumbnails, the Upload tile, image loading |
| `--ch-doc-ground-folder` | #5a4326 | #3b2f1e | the Folder tile |
| `--ch-doc-ground-ink` | #f4eedd | #f4eedd | illustration strokes; any text ever set on a ground |
| `--ch-doc-ground-ink-soft` | #bcd6c4 (plan), #c3ccd6 (file), #e3d3b0 (folder) | the same | illustration second tone (set per tile) |
| `--ch-doc-sheet` | #fcfaf5 | #161a17 | the mini page |
| `--ch-doc-sheet-edge` | rgb(28 25 18 / 0.12) | rgb(237 231 216 / 0.16) | the mini page's 1px edge |
| `--ch-doc-sheet-back` | #e4ddcc | #20261f | stacked sheets behind |
| `--ch-doc-sheet-ink` | #1c1b18 | #ede7d8 | title on the mini page |
| `--ch-doc-sheet-ink-soft` | #46433d | #c7c0af | kind label on the mini page |
| `--ch-doc-sheet-bar` | #c9c2b1 | #3c453d | placeholder bars (decorative) |
| `--ch-doc-chip-bg` | #1d211e | #1d211e | ⋯ and pin chips |
| `--ch-doc-chip-edge` | rgb(244 238 221 / 0.2) | the same | chip edge |
| `--ch-doc-chip-ink` | #f4eedd | #f4eedd | chip glyph |
| `--ch-doc-chip-on-bg` | #f4eedd | #f4eedd | pinned chip |
| `--ch-doc-chip-on-ink` | #0f4a2f | #0f4a2f | pinned chip glyph |

| Pairing (text needs 4.5:1, glyphs and focus 3:1) | Light | Dark |
|---|---|---|
| Ground ink on plan ground (#f4eedd on #0f4a2f / #174a33) | 8.88 | 8.78 |
| Ground ink on file ground (#f4eedd on #2e3a46 / #2a3540) | 10.01 | 10.77 |
| Ground ink on folder ground (#f4eedd on #5a4326 / #3b2f1e) | 8.00 | 11.25 |
| Soft tone on its ground (#bcd6c4 on plan, #c3ccd6 on file, #e3d3b0 on folder) | 6.64 / 7.14 / 6.27 | 6.57 / 7.69 / 8.82 |
| Sheet title on mini page (#1c1b18 on #fcfaf5 / #ede7d8 on #161a17) | 16.51 | 14.25 |
| Sheet kind label on mini page (#46433d on #fcfaf5 / #c7c0af on #161a17) | 9.45 | 9.70 |
| Mini page against its ground (non-text, decorative; the edge carries it in dark) | 9.86 (plan), 11.12 (file) | 1.73 (plan), 1.41 (file) + 16% ivory edge |
| Chip glyph on chip (#f4eedd on #1d211e) | 14.06 | 14.06 |
| Pinned chip glyph (#0f4a2f on #f4eedd) | 8.88 | 8.88 |
| Pinned chip against the plan ground (#f4eedd on #0f4a2f / #174a33) | 8.88 | 8.78 |
| Chip focus ring `--ch-border-focus-on-dark` #dccda6 on grounds (plan, file, folder) | 6.53 / 7.36 / 5.88 | 6.46 / 7.92 / 8.27 |
| Card title `--ch-text-primary` on `--ch-bg-surface` (#1c1b18 on #fcfaf5 / #ede7d8 on #1b201c) | 16.51 | 13.40 |
| Card meta `--ch-text-tertiary` on surface (#46433d / #c7c0af on #1b201c) | 9.45 | 9.12 |
| Plan type icon tile glyph `--ch-green-600` on `--ch-bg-selected` (#155a39 on #eef5f0 / #6bbb8c on #16281d) | 7.42 | 6.72 |
| File type icon tile glyph `--ch-text-secondary` on `--ch-bg-subtle` (#3a3833 on #f5f2ea / #d8d1c1 on #181d19) | 10.47 | 11.24 |
| Tile label and breadcrumb folder `--ch-text-primary` on `--ch-bg-page` (#1c1b18 on #ebe7dc / #ede7d8 on #111512) | 13.94 | 14.93 |
| Rail rows `--ch-text-secondary` on page (#3a3833 on #ebe7dc / #d8d1c1 on #111512) | 9.48 | 12.12 |
| Rail row hover, secondary on `--ch-bg-hover` (#3a3833 on #f9f7f1 / #d8d1c1 on #202621) | 10.93 | 10.15 |
| Current folder row `--ch-selected-ink` on `--ch-bg-selected` (#0f4a2f on #eef5f0 / #84c9a0 on #16281d) | 9.29 | 8.00 |
| Group labels, counts, breadcrumb chevron `--ch-text-tertiary` on page (#46433d on #ebe7dc / #c7c0af on #111512) | 7.98 | 10.17 |
| Filter dot `--ch-green-600` on page (#155a39 on #ebe7dc / #6bbb8c on #111512) | 6.66 | 7.99 |
| "Updated" dot `--ch-green-600` on surface | 7.88 | 7.17 |
| Card focus ring `--ch-border-focus` on page | 6.66 | 7.99 |
| Menu text on `--ch-bg-elevated` (#1c1b18 on #fcfaf5 / #ede7d8 on #232925) | 16.51 | 12.03 |

No text sits directly on a ground: tile labels are under the tiles on the page, and file thumbnails set their text on the mini page. If text is ever placed on a ground it uses `--ch-doc-ground-ink` (8.00:1 or more on all six grounds). Dark `--ch-accent` (#23704a, 2.75:1 on dark surfaces) is never used for text, glyphs or lines here; the current row, dots and focus use `--ch-selected-ink`, `--ch-green-600` and `--ch-border-focus`. Card edges are `--ch-border-hairline`, brightening to `--ch-border-strong` on hover (decorative: the card is set apart from the page by its fill, so 1.4.11 does not apply).

---

## 8. Data and database

### 8.1 Who may do what (enforced where)

| Act | Who | Enforced by |
|---|---|---|
| Read a document | coach: all; player: `is_public` | existing RLS (`golf.sql:635`) and `getDocuments` (`documents.ts:204-208`) |
| Rename, move, share, delete a file | any coach on the staff | existing RLS (`golf.sql:631,637`), `updateDocumentImpl` coach check (`documents.ts:556-558`), `deleteDocumentImpl` |
| Move a file into Practice plans | nobody | `golf_documents_plan_folder_check` (090300, narrowed 4 Nov: a plan row may be moved to any coach folder) |
| Pin, unpin | anyone, own pins, only on documents they can read | `golf_document_pins` RLS (090000) |
| Record an open | anyone, own rows, only on documents they can read | `golf_document_opens` RLS + `golf_document_mark_opened` (090100) |
| See another person's pins or opens | nobody (coaches included) | select policies are own-rows only |
| Create, rename, delete a folder | any coach on the staff | `golf_document_folders` RLS and the two functions' `is_golf_team_coach` checks (090200) |

`is_golf_team_coach` joins `golf_team_coach_staff` to `golf_coaches` on `user_id = auth.uid()` (`functions/public.sql:6964-6976`). `golf_coaches_insert_own` lets anyone add a coach row for themselves, but staff rows need a head coach (`golf_team_coach_staff_insert`, per N-01's check of `policies/golf.sql:1096`), so the check cannot be self-granted.

Delete rights: any coach may delete any team file or folder (the existing documents rule; a creator is always staff, so they can delete their own). A viewer deletes only their own pins and opens.

### 8.2 Held migration `supabase/migrations/20261026090000_golf_document_pins.sql`

```sql
-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-10 Documents: each viewer's pinned documents. One table, three policies. Touches no existing table's data and no round path.
-- VERIFY: SELECT 1 FROM pg_class WHERE oid = to_regclass('public.golf_document_pins') AND relrowsecurity;
-- VERIFY: SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_document_pins' HAVING count(*) = 3;
-- VERIFY: SELECT 1 WHERE to_regclass('public.golf_document_pins') IS NOT NULL AND has_table_privilege('authenticated', 'public.golf_document_pins', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.golf_document_pins', 'UPDATE') AND NOT has_table_privilege('anon', 'public.golf_document_pins', 'SELECT');
-- VERIFY: SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'golf_document_pins' AND indexname = 'golf_document_pins_document_id_idx';
-- ROLLBACK: DROP TABLE IF EXISTS public.golf_document_pins;

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.golf_document_pins (
  user_id uuid DEFAULT auth.uid() NOT NULL,
  document_id uuid NOT NULL,
  pinned_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT golf_document_pins_pkey PRIMARY KEY (user_id, document_id),
  CONSTRAINT golf_document_pins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT golf_document_pins_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.golf_documents(id) ON DELETE CASCADE
);

-- The PK leads with user_id (the viewer's read). This index serves the document FK's cascade.
CREATE INDEX IF NOT EXISTS golf_document_pins_document_id_idx ON public.golf_document_pins (document_id);

COMMENT ON TABLE public.golf_document_pins IS 'A viewer''s pinned team documents, shown first in Team Hub > Documents. Private to each viewer. N-10.';

ALTER TABLE public.golf_document_pins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.golf_document_pins FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.golf_document_pins TO authenticated;
GRANT ALL ON TABLE public.golf_document_pins TO service_role;

DROP POLICY IF EXISTS golf_document_pins_select_own ON public.golf_document_pins;
CREATE POLICY golf_document_pins_select_own ON public.golf_document_pins FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- The EXISTS runs under the caller's own golf_documents policies, so a player can pin only a document shared with players.
DROP POLICY IF EXISTS golf_document_pins_insert_own ON public.golf_document_pins;
CREATE POLICY golf_document_pins_insert_own ON public.golf_document_pins FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.golf_documents d WHERE d.id = golf_document_pins.document_id)
  );

DROP POLICY IF EXISTS golf_document_pins_delete_own ON public.golf_document_pins;
CREATE POLICY golf_document_pins_delete_own ON public.golf_document_pins FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
```

Notes: no BEGIN/COMMIT (the runner wraps the file). New empty table, so the plain `CREATE INDEX` is fine. The only lock on an existing table is the two FKs' brief `SHARE ROW EXCLUSIVE` on `golf_documents` and `auth.users`. `user_id` references `auth.users`, as `golf_documents.uploaded_by` does (`20_constraints.sql:667`), so it equals `auth.uid()` directly. A pin on a document that later becomes coach-only stays in the table but is never returned to the player (the read joins `golf_documents` under RLS), and comes back if it is shared again. No limit on pins: a viewer pins what they choose; nothing else depends on the count.

### 8.3 Held migration `supabase/migrations/20261026090100_golf_document_opens.sql`

```sql
-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-10 Documents: when each viewer last opened each document (Recents, "Opened 10m ago", "Updated since you opened it").
-- One table, four policies, one SECURITY INVOKER upsert function. Private to each viewer. No round path.
-- VERIFY: SELECT 1 FROM pg_class WHERE oid = to_regclass('public.golf_document_opens') AND relrowsecurity;
-- VERIFY: SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_document_opens' HAVING count(*) = 4;
-- VERIFY: SELECT 1 WHERE to_regclass('public.golf_document_opens') IS NOT NULL AND has_column_privilege('authenticated', 'public.golf_document_opens', 'opened_at', 'UPDATE') AND NOT has_column_privilege('authenticated', 'public.golf_document_opens', 'user_id', 'UPDATE') AND NOT has_column_privilege('authenticated', 'public.golf_document_opens', 'document_id', 'UPDATE');
-- VERIFY: SELECT 1 WHERE to_regprocedure('public.golf_document_mark_opened(uuid)') IS NOT NULL AND has_function_privilege('authenticated', 'public.golf_document_mark_opened(uuid)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.golf_document_mark_opened(uuid)', 'EXECUTE');
-- VERIFY: SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'golf_document_opens' AND indexname = 'golf_document_opens_user_recent_idx';
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_document_mark_opened(uuid); DROP TABLE IF EXISTS public.golf_document_opens;

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.golf_document_opens (
  user_id uuid DEFAULT auth.uid() NOT NULL,
  document_id uuid NOT NULL,
  opened_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT golf_document_opens_pkey PRIMARY KEY (user_id, document_id),
  CONSTRAINT golf_document_opens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT golf_document_opens_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.golf_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS golf_document_opens_user_recent_idx ON public.golf_document_opens (user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS golf_document_opens_document_id_idx ON public.golf_document_opens (document_id);

COMMENT ON TABLE public.golf_document_opens IS 'The last time each viewer opened each team document. One row per viewer and document, updated in place. Private to each viewer; not a read receipt (N-00 keeps its own Seen by). N-10.';

ALTER TABLE public.golf_document_opens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.golf_document_opens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.golf_document_opens TO authenticated;
GRANT UPDATE (opened_at) ON TABLE public.golf_document_opens TO authenticated;
GRANT ALL ON TABLE public.golf_document_opens TO service_role;

DROP POLICY IF EXISTS golf_document_opens_select_own ON public.golf_document_opens;
CREATE POLICY golf_document_opens_select_own ON public.golf_document_opens FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS golf_document_opens_insert_own ON public.golf_document_opens;
CREATE POLICY golf_document_opens_insert_own ON public.golf_document_opens FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.golf_documents d WHERE d.id = golf_document_opens.document_id)
  );

DROP POLICY IF EXISTS golf_document_opens_update_own ON public.golf_document_opens;
CREATE POLICY golf_document_opens_update_own ON public.golf_document_opens FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.golf_documents d WHERE d.id = golf_document_opens.document_id)
  );

DROP POLICY IF EXISTS golf_document_opens_delete_own ON public.golf_document_opens;
CREATE POLICY golf_document_opens_delete_own ON public.golf_document_opens FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Record an open. SECURITY INVOKER: the upsert runs under the caller's RLS, so a document the caller cannot read is refused (42501).
-- An open within 60 seconds of the last one writes nothing, so a double tap or a quick back-and-forth costs no write.
CREATE OR REPLACE FUNCTION public.golf_document_mark_opened(p_document_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'golf_document_mark_opened: not signed in' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.golf_document_opens AS o (user_id, document_id, opened_at)
  VALUES (v_uid, p_document_id, now())
  ON CONFLICT (user_id, document_id) DO UPDATE
    SET opened_at = excluded.opened_at
    WHERE o.opened_at < excluded.opened_at - interval '60 seconds'
  RETURNING o.opened_at INTO v_at;
  IF v_at IS NULL THEN
    SELECT o.opened_at INTO v_at FROM public.golf_document_opens AS o WHERE o.user_id = v_uid AND o.document_id = p_document_id;
  END IF;
  RETURN v_at;
END;
$$;

REVOKE ALL ON FUNCTION public.golf_document_mark_opened(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golf_document_mark_opened(uuid) TO authenticated, service_role;
```

Notes: `ON CONFLICT DO UPDATE` under RLS needs the SELECT and UPDATE policies on the existing row (both own-row) and the INSERT policy on the new one; all three are present. The table is bounded (one row per viewer and document). Opens are never shown to anyone but the viewer: a coach cannot see which player opened what here. If N-00's "Seen by" ever wants to read this table instead of its own, that is a policy change for a later plan, not this one.

### 8.4 Held migration `supabase/migrations/20261026090200_golf_document_folders.sql`

```sql
-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-10 Documents: named folders a coach can create empty, rename and delete. golf_documents.folder stays the link (text, as today).
-- One table, four policies, two SECURITY INVOKER functions that rename or remove a folder and move its files in one statement each.
-- VERIFY: SELECT 1 FROM pg_class WHERE oid = to_regclass('public.golf_document_folders') AND relrowsecurity;
-- VERIFY: SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_document_folders' HAVING count(*) = 4;
-- VERIFY: SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'golf_document_folders' AND indexname = 'golf_document_folders_team_name_uniq' AND indexdef ILIKE '%UNIQUE%';
-- VERIFY: SELECT 1 WHERE to_regclass('public.golf_document_folders') IS NOT NULL AND NOT has_column_privilege('authenticated', 'public.golf_document_folders', 'team_id', 'UPDATE') AND has_column_privilege('authenticated', 'public.golf_document_folders', 'name', 'UPDATE');
-- VERIFY: SELECT 1 WHERE to_regprocedure('public.golf_document_folder_rename(uuid,text,text)') IS NOT NULL AND to_regprocedure('public.golf_document_folder_delete(uuid,text)') IS NOT NULL;
-- VERIFY: SELECT 1 WHERE to_regclass('public.golf_document_folders') IS NOT NULL AND NOT has_function_privilege('anon', 'public.golf_document_folder_rename(uuid,text,text)', 'EXECUTE');
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_document_folder_delete(uuid, text); DROP FUNCTION IF EXISTS public.golf_document_folder_rename(uuid, text, text); DROP TABLE IF EXISTS public.golf_document_folders;

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.golf_document_folders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  team_id uuid NOT NULL,
  name text NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT golf_document_folders_pkey PRIMARY KEY (id),
  CONSTRAINT golf_document_folders_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  CONSTRAINT golf_document_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT golf_document_folders_name_check CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 60),
  -- Team is the null folder; Practice plans holds published plans only (N-00). Neither can be a coach folder.
  CONSTRAINT golf_document_folders_reserved_check CHECK (lower(name) NOT IN ('team', 'practice plans'))
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_document_folders_team_name_uniq ON public.golf_document_folders (team_id, lower(name));
CREATE INDEX IF NOT EXISTS golf_document_folders_created_by_idx ON public.golf_document_folders (created_by);

COMMENT ON TABLE public.golf_document_folders IS 'Coach-made folders in Team Hub > Documents, so a folder can exist before it holds a file. Files point at a folder by name in golf_documents.folder (case-insensitive). Coaches only. N-10.';

ALTER TABLE public.golf_document_folders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.golf_document_folders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.golf_document_folders TO authenticated;
GRANT UPDATE (name) ON TABLE public.golf_document_folders TO authenticated;
GRANT ALL ON TABLE public.golf_document_folders TO service_role;

-- Players never read this table: the folders they see come from the documents they can read, so an empty folder stays a coach's.
DROP POLICY IF EXISTS golf_document_folders_select_coach ON public.golf_document_folders;
CREATE POLICY golf_document_folders_select_coach ON public.golf_document_folders FOR SELECT TO authenticated
  USING (public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_document_folders_insert_coach ON public.golf_document_folders;
CREATE POLICY golf_document_folders_insert_coach ON public.golf_document_folders FOR INSERT TO authenticated
  WITH CHECK (public.is_golf_team_coach(team_id) AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS golf_document_folders_update_coach ON public.golf_document_folders;
CREATE POLICY golf_document_folders_update_coach ON public.golf_document_folders FOR UPDATE TO authenticated
  USING (public.is_golf_team_coach(team_id))
  WITH CHECK (public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_document_folders_delete_coach ON public.golf_document_folders;
CREATE POLICY golf_document_folders_delete_coach ON public.golf_document_folders FOR DELETE TO authenticated
  USING (public.is_golf_team_coach(team_id));

-- Rename a folder and move its files with it. Works for a folder that exists only as text on files (no table row yet).
-- SECURITY INVOKER: both UPDATEs run under the caller's RLS (golf_documents_update_coach, golf_document_folders_update_coach).
CREATE OR REPLACE FUNCTION public.golf_document_folder_rename(p_team_id uuid, p_from text, p_to text)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from text := btrim(coalesce(p_from, ''));
  v_to text := btrim(coalesce(p_to, ''));
  v_moved integer;
BEGIN
  IF NOT public.is_golf_team_coach(p_team_id) THEN
    RAISE EXCEPTION 'golf_document_folder_rename: not a coach of this team' USING ERRCODE = '42501';
  END IF;
  IF v_from = '' OR lower(v_from) IN ('team', 'practice plans') OR lower(v_to) IN ('team', 'practice plans') THEN
    RAISE EXCEPTION 'golf_document_folder_rename: that folder is kept by GolfHelm' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_to) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'golf_document_folder_rename: name must be 1 to 60 characters' USING ERRCODE = '22023';
  END IF;
  -- Another folder already has the new name (a case-only change of the same folder is allowed).
  IF lower(v_to) <> lower(v_from) AND (
       EXISTS (SELECT 1 FROM public.golf_document_folders f WHERE f.team_id = p_team_id AND lower(f.name) = lower(v_to))
    OR EXISTS (SELECT 1 FROM public.golf_documents d WHERE d.team_id = p_team_id AND lower(btrim(d.folder)) = lower(v_to))
  ) THEN
    RAISE EXCEPTION 'golf_document_folder_rename: a folder with that name exists' USING ERRCODE = '23505';
  END IF;

  UPDATE public.golf_document_folders SET name = v_to WHERE team_id = p_team_id AND lower(name) = lower(v_from);
  IF NOT FOUND THEN
    INSERT INTO public.golf_document_folders (team_id, name, created_by) VALUES (p_team_id, v_to, (SELECT auth.uid()));
  END IF;

  UPDATE public.golf_documents SET folder = v_to
   WHERE team_id = p_team_id AND lower(btrim(folder)) = lower(v_from);
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RETURN v_moved;
END;
$$;

-- Delete a folder: its files move to Team (folder NULL), then the folder row goes. No file is deleted.
CREATE OR REPLACE FUNCTION public.golf_document_folder_delete(p_team_id uuid, p_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_moved integer;
BEGIN
  IF NOT public.is_golf_team_coach(p_team_id) THEN
    RAISE EXCEPTION 'golf_document_folder_delete: not a coach of this team' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' OR lower(v_name) IN ('team', 'practice plans') THEN
    RAISE EXCEPTION 'golf_document_folder_delete: that folder is kept by GolfHelm' USING ERRCODE = '22023';
  END IF;
  UPDATE public.golf_documents SET folder = NULL
   WHERE team_id = p_team_id AND lower(btrim(folder)) = lower(v_name);
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  DELETE FROM public.golf_document_folders WHERE team_id = p_team_id AND lower(name) = lower(v_name);
  RETURN v_moved;
END;
$$;

REVOKE ALL ON FUNCTION public.golf_document_folder_rename(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.golf_document_folder_delete(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golf_document_folder_rename(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.golf_document_folder_delete(uuid, text) TO authenticated, service_role;
```

Notes:
- Two coaches renaming two folders to the same name at once: the second `INSERT` or `UPDATE` hits `golf_document_folders_team_name_uniq` (23505), the whole call rolls back. Mapped to CH-10161.
- The documents scan uses `team_id` (indexed, `30_indexes.sql:319`); a team's documents are hundreds of rows, so `lower(btrim(folder))` needs no index.
- No new trigger anywhere; `golf_documents.updated_at` does not move on a rename or move (there is no update trigger on it today, 0.1), so "Recent" order is unchanged by organising.
- A `golf_documents` UPDATE inside the function also passes N-10's 090300 guard: files never get `folder = 'Practice plans'` because the reserved check above refuses that name first.

### 8.5 Held migration `supabase/migrations/20261026090300_golf_documents_plan_folder_check.sql`

```sql
-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-10 Documents: a practice plan's row lives in "Practice plans", and nothing else does. Needs N-00's 20261026010400 (practice_plan_id).
-- NOT VALID: new and updated rows are checked at once; existing rows are not scanned (a legacy file a coach typed into a
-- "Practice plans" folder in Fairway is not refused here; see the pre-check below before VALIDATE).
-- VERIFY: SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.golf_documents') AND conname = 'golf_documents_plan_folder_check' AND contype = 'c';
-- VERIFY: SELECT 1 WHERE to_regclass('public.golf_documents') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'golf_documents' AND column_name = 'practice_plan_id');
-- ROLLBACK: ALTER TABLE public.golf_documents DROP CONSTRAINT IF EXISTS golf_documents_plan_folder_check;

SET lock_timeout = '3s';

ALTER TABLE public.golf_documents DROP CONSTRAINT IF EXISTS golf_documents_plan_folder_check;
ALTER TABLE public.golf_documents
  ADD CONSTRAINT golf_documents_plan_folder_check
  -- fixed 4 Nov wiring (narrowed, Nick's call in DECISIONS "Folders", 4 Nov): plan rows may sit in any coach folder; only an uploaded file may not sit in Practice plans.
  CHECK (practice_plan_id IS NOT NULL OR lower(btrim(coalesce(folder, ''))) <> 'practice plans')
  NOT VALID;

COMMENT ON CONSTRAINT golf_documents_plan_folder_check ON public.golf_documents IS 'No uploaded file sits in the Practice plans folder; a practice plan row (practice_plan_id set) may sit in any coach folder. N-10, with N-00 and the practice-plan lane (narrowed 4 Nov 2026).';
```

Owner pre-check before any later `VALIDATE CONSTRAINT` (read-only; run by the owner, not by this plan): `SELECT count(*) FROM public.golf_documents WHERE practice_plan_id IS NULL AND lower(btrim(folder)) = 'practice plans';` If it returns 0, `ALTER TABLE public.golf_documents VALIDATE CONSTRAINT golf_documents_plan_folder_check;` can follow in its own held file. If not, those files are moved (Move to) first. While NOT VALID, such a legacy row can be moved but not renamed in place (any UPDATE re-checks it); the library shows it in Practice plans with its Move item first.

`ADD CONSTRAINT … NOT VALID` takes a brief `ACCESS EXCLUSIVE` on `golf_documents` without a scan; `lock_timeout = '3s'` keeps it from queueing behind a long read. N-00's publish function writes `folder 'Practice plans'` with `practice_plan_id`, which passes.

### 8.6 HELD.md rows (added to "The register", `supabase/migrations/HELD.md:151`)

```
| `20261026090000_golf_document_pins.sql` | **HOLD** | N-10 Documents. New table `golf_document_pins` (per-viewer pins, own rows only; insert checks the viewer can read the document under its existing RLS). No trigger, no change to existing data or any round path. Apply before N-10 slice 2 ships; pgTAP `supabase/tests/rls/golf_document_pins_opens_rls.sql` must pass first. Only the owner applies. | 2026-10-25 |
| `20261026090100_golf_document_opens.sql` | **HOLD** | N-10 Documents. New table `golf_document_opens` (last open per viewer and document, own rows only) and `golf_document_mark_opened(uuid)` (SECURITY INVOKER upsert, 60-second throttle). No trigger, no existing data touched. Apply with 090000; same pgTAP file. Only the owner applies. | 2026-10-25 |
| `20261026090200_golf_document_folders.sql` | **HOLD** | N-10 Documents. New table `golf_document_folders` (coach-made folders, coaches only) and two SECURITY INVOKER functions, `golf_document_folder_rename` and `golf_document_folder_delete`, which update `golf_documents.folder` for one team under the caller's RLS. No trigger. Apply before N-10 slice 3; pgTAP `supabase/tests/rls/golf_document_folders_rls.sql` first. Only the owner applies. | 2026-10-25 |
| `20261026090300_golf_documents_plan_folder_check.sql` | **HOLD** | N-10 Documents, with N-00. Adds `golf_documents_plan_folder_check` NOT VALID (no uploaded file in Practice plans; plan rows in any folder, narrowed 4 Nov). Needs `20261026010400_golf_documents_practice_plan.sql` (N-00) applied first. Brief ACCESS EXCLUSIVE, no scan. VALIDATE only after the owner's pre-check in N-10 section 8.5. Only the owner applies. | 2026-10-25 |
```

### 8.7 Schema mirror (declarative files, same PR as the held files)

| File | Adds |
|---|---|
| `supabase/schemas/golf/10_tables.sql` | `CREATE TABLE IF NOT EXISTS "public"."golf_document_pins"`, `"golf_document_opens"`, `"golf_document_folders"` with their CHECKs inline, near `golf_documents` (:664) |
| `supabase/schemas/golf/20_constraints.sql` | PKs and FKs in the `ALTER TABLE ONLY … ADD CONSTRAINT` form (:154, :661-668); `golf_documents_plan_folder_check` (NOT VALID) with N-00's columns |
| `supabase/schemas/golf/30_indexes.sql` | the five indexes, beside `idx_golf_documents_*` (:315-321) |
| `supabase/schemas/golf/90_comments.sql` | the three table comments and the constraint comment |
| `supabase/schemas/golf/95_grants.sql` | REVOKE, table grants, column UPDATE grants |
| `supabase/schemas/policies/rls_enable.sql` | three `ENABLE ROW LEVEL SECURITY` lines beside :345 |
| `supabase/schemas/policies/golf.sql` | the eleven policies |
| `supabase/schemas/functions/public.sql` | `golf_document_mark_opened`, `golf_document_folder_rename`, `golf_document_folder_delete` |
| `supabase/schemas/functions/95_grants.sql` | their REVOKE and GRANT lines |

**Types before regeneration.** `src/lib/types/database.ts` (golf_documents at :13129) has none of the three tables. One module, `src/clubhouse/data/docs-db.ts` (server-only), holds narrow row types (`DocPinRow { document_id: string; pinned_at: string }`, `DocOpenRow { document_id: string; opened_at: string }`, `DocFolderRow { id: string; name: string }`) and one cast, `const db = supabase as unknown as UntypedDocsClient`, used by its three readers and the actions' writes, in the way `documents.ts` already reads `'golf_document_versions' as any`. `.rpc('golf_document_mark_opened' …)` goes through the same cast. Removed when types regenerate after the owner applies.

### 8.8 Reads

**In `loadTeamHub`** (`hub.ts:310-316`), one more entry in the first `Promise.all`: `loadDocsExtras(supabase, input.userId, input.teamId, input.role)` returning `{ pins: Array<{ id, at }> | null; opens: Array<{ id, at }> | null; folders: Array<{ id, name }> | null; failed: boolean }`:
- pins: `select document_id, pinned_at from golf_document_pins where user_id = $user order by pinned_at desc limit 200`
- opens: `select document_id, opened_at from golf_document_opens where user_id = $user order by opened_at desc limit 200` (index `golf_document_opens_user_recent_idx`)
- folders (coach only): `select id, name from golf_document_folders where team_id = $team`
- Each read: `42P01` or `PGRST205` → that field `null` (table not applied), silently; any other error → `failed: true` and logged once (`log('documents-extras', …)`, as :315 logs).
Rows are matched to the team's documents in memory (ids not in the list are dropped), so a pin on another team's file never shows.

`getDocuments` returns `*` (`documents.ts:200`), so `uploaded_by`, `is_public`, `description`, `category`, `version_count` and, after N-00, `practice_plan_id` are already in each row. A new pure mapper `toLibrary(rows, extras, viewerUserId, formatters)` in `src/clubhouse/data/docs-library.ts` builds:

```ts
export type ChDocKind = 'plan' | 'pdf' | 'image' | 'doc' | 'sheet' | 'slides' | 'video' | 'other';
export interface ChDoc {
  id: string;
  title: string;
  kind: ChDocKind;
  typeLabel: string;          // "PDF", "Plan"
  folderKey: string;          // "practice-plans" | "team" | "<lower name>"
  folderName: string;
  bytes: number | null;
  size: string | null;        // "84 KB"
  createdAt: string | null;
  updatedAt: string | null;
  version: number;            // version_count, at least 1
  mine: boolean;              // uploaded_by === viewer
  shared: boolean;            // is_public === true
  planId: string | null;
  focus: string | null;       // plan rows: description (the focus line)
  takenDown: boolean;         // plan row with is_public false (coach view only)
  pinnedAt: string | null;
  openedAt: string | null;
}
export interface ChDocLibrary {
  docs: ChDoc[];
  folders: Array<{ key: string; name: string; id: string | null; system: boolean; count: number }>; // rail order: Practice plans, Team, then A to Z
  pinsReady: boolean;         // pins table exists
  opensReady: boolean;
  foldersReady: boolean;
  extrasFailed: boolean;      // CH-10261
  plansOn: boolean;           // N-00's flag
}
```

`ChTeamHub` gains `library: ChDocLibrary`. `documents` keeps its shape for `FilesTile` and the compose sheet; `folders()` stays as is (with N-00's null-safe shim).

**Previews, after the tab first shows** (so Hub Home and the other tabs never wait): `DocumentsLibrary` calls a new server action `loadDocumentPreviews(teamId, { planIds, imageIds })` once, then for ids that newly appear. It returns `{ glances: Record<planId, ChPlanGlance>; images: Record<docId, { url: string; expiresAt: number }> }`:
- glances: N-00's `loadPlanGlances(supabase, planIds)` (one query, RLS-scoped).
- images: only for image rows of 8 MB or less, at most 60 per call; the storage path is the latest version's `storage_path`, else derived from `file_url` (the same two steps `getPreviewUrlImpl` uses, `documents.ts:1153-1218`), then one `supabase.storage.from('documents').createSignedUrls(paths, 3600)` call. The role check is `getPreviewUrlImpl`'s (`:1123-1128`): a player only for `is_public` rows; refused ids are left out.
- An image that fails to load (an expired link after an hour on the page) asks once more for that id; if that fails it takes the slate mini page (CH-10960, silent).

### 8.9 Writes (server actions)

| Action | File | What |
|---|---|---|
| `updateGolfDocument` | existing, `documents.ts:1605` (fixed 4 Nov wiring: was 1597) | rename, move, share. `ChHubWrites` gains `editDocument(id, { title?, folder?, playerVisible? })` wrapping it (`writes.ts`). Two server-side additions inside `updateDocumentImpl` (`documents.ts:536-598`, fixed 4 Nov wiring: was 534-590): refuse `folder` equal to "Practice plans" (any case) on a file row with "That folder holds practice plans only", and, after N-00, refuse any change but `folder` to a row with `practice_plan_id` set ("Change this plan from its page") (fixed 4 Nov wiring: Move is allowed for plan rows, 02 §C.2 of the practice-plan lane; title and visibility stay the plan page's). The database guard (8.5) backs both. |
| `pinDocument(id)`, `unpinDocument(id)` | new, `src/app/golf/actions/document-library.ts` (`'use server'`) | insert / delete own pin through the user's client; RLS does the checks; `23505` on insert counts as success (already pinned) |
| `markOpened(id)` | same file | `rpc('golf_document_mark_opened', { p_document_id: id })`; never throws to the UI; a missing function (`42883`/`PGRST202`) is silent |
| `createDocumentFolder(teamId, name)` | same file | coach check with `resolveTeamRole` (as `documents.ts:193`), then insert; `23505` → CH-10161, `23514` (reserved or length) → CH-10162 / CH-10163 |
| `renameDocumentFolder(teamId, from, to)`, `deleteDocumentFolder(teamId, name)` | same file | the two RPCs; error codes mapped as above |
| `getDownloadUrl(id)` | `documents.ts`, beside `getPreviewUrl` | the same access check and path lookup as `getPreviewUrlImpl`, then `createSignedUrl(path, 300, { download: '<title>.<ext>' })`; plans refused ("Plans print from their page") |
| `loadDocumentPreviews(teamId, ids)` | `document-library.ts` | 8.8 |

Each action is wrapped in `withAdminObserved` with `feature: 'documents'`, as every documents action is. None calls `revalidatePath`; the Hub refreshes through `refresh()` after writes that change the list (rename, move, share, folder changes), and pins and opens update locally.

### 8.10 No trigger, nothing on a round path, no notification

No trigger is added to any table. Nothing touches `golf_rounds`, `golf_holes` or `golf_shots`. No push, bell row or message is created by anything in this plan.

---

## 9. Files

| File | Change |
|---|---|
| `src/clubhouse/screens/hub/docs/DocumentsLibrary.tsx` | new: the tab's screen (state: tab, search, type, sort, view, folder filter, open lists, overlay open; drag-drop upload target; the two-column layout and the 860px container switch) |
| `src/clubhouse/screens/hub/docs/DocRail.tsx` | new: the library rail (New, Search, Pinned, Recents with View all, Folders with counts), inline and as the overlay dialog under 860px; rail row ⋯ and drop targets |
| `src/clubhouse/screens/hub/docs/DocRailGroup.tsx` | new: the label button with its caret, `aria-expanded`/`aria-controls`, the 0fr→1fr reveal; also the phone group headers |
| `src/clubhouse/screens/hub/docs/DocTypeTiles.tsx` | new: the three creation tiles with inline SVG illustrations; the same three as phone `ActionSheet` rows |
| `src/clubhouse/screens/hub/docs/DocBar.tsx` | new: the sticky bar (Show `Segmented`, `IconButton`s for search, filter, view and New, the search field swap, the stuck edge, the library toggle); phone search and Filter and sort button |
| `src/clubhouse/screens/hub/docs/DocCrumb.tsx` | new: the breadcrumb with the folder ⋯, and the search count line |
| `src/clubhouse/screens/hub/docs/DocCard.tsx` | new: card and row (one component, `layout: 'grid' or 'list' or 'phone'`), bottom row, hover chips, context menu bind |
| `src/clubhouse/screens/hub/docs/DocThumb.tsx` | new: ground, mini page, stacked sheets, `PlanGlance` scaled by `--ch-dl-k`, image, skeleton; sizes card, 48 and 56 |
| `src/clubhouse/screens/hub/docs/doc-sheets.tsx` | new: Rename, Move to, New folder, Rename folder, phone Filter and sort, preview Modal |
| `src/clubhouse/screens/hub/docs/doc-menu.ts` | new, pure: menu items per role and kind (unit tested) |
| `src/clubhouse/screens/hub/docs/doc-filter.ts` | new, pure: tab, folder, type, search (normalise, AND words), sort (Recent, Last opened, Name, Type), rail lists (pins, 8 recents, folders in rail order with counts) |
| `src/clubhouse/screens/hub/docs/doc-memory.ts` | new: the `localStorage` keys (groups, view, prefs), try/catch reads and writes |
| `src/clubhouse/screens/hub/docs/doc-when.ts` | new, pure: the meta line from `relativeTime` |
| `src/clubhouse/styles/hub-docs.css` | new: `.ch-dl-*` (rail, overlay, tiles, bar, crumb, grid, cards, rows) and the `--ch-doc-*` tokens, light and dark (7.5); imported by `routes/hub.tsx` beside `hub.css` |
| `src/clubhouse/data/docs-library.ts` | new, pure: `toLibrary`, `ChDoc`, `ChDocLibrary`, kind table (reuses `fileKind`) |
| `src/clubhouse/data/docs-db.ts` | new, server-only: `loadDocsExtras`, narrow row types, the one cast |
| `src/clubhouse/data/hub.ts` | `loadTeamHub` adds `loadDocsExtras` to the first `Promise.all` and `library` to the result |
| `src/clubhouse/screens/hub/TeamHub.tsx` | a Documents branch for the phone action only (:536, coach: the New `ActionSheet`); the desktop head keeps no primary on Documents (:483-493 unchanged); mounts `DocumentsLibrary` when the `library` flag is on (:723-727); `focusFolder`, `?show=` and `?folder=` |
| `src/clubhouse/screens/hub/writes.ts` | `editDocument`, `pin`, `unpin`, `markOpened`, `createFolder`, `renameFolder`, `deleteFolder`, `downloadUrl`, `previews` |
| `src/clubhouse/screens/hub/widgets.tsx` | `FilesTile` rows use kind labels and the shared open (plans to their page) |
| `src/clubhouse/routes/hub.tsx` | read `golf_documents_library` and N-00's flag; pass `library`, `focusFolder`; import `hub-docs.css` |
| `src/app/golf/(dashboard)/dashboard/team-hub/page.tsx` | `folder` and `show` in `searchParams`, passed to `ClubhouseHubRoute` |
| `src/app/golf/(dashboard)/dashboard/team-hub/documents/layout.tsx`, `page.tsx` | new: the short address (3.2) |
| `src/clubhouse/shell/nav.ts` | one regex in `CH_ALIASED_ROUTES` (:200-211) |
| `src/app/golf/actions/document-library.ts` | new: 8.9 |
| `src/app/golf/actions/documents.ts` | `getDownloadUrl`; two refusals in `updateDocumentImpl` |
| `config/feature-flags.yml` | `golf_documents_library` (0.6), then `npm run flags:generate` |
| `docs/clubhouse/catalog/hub.md` | the new codes (12.12) |
| `supabase/migrations/2026102609{0000,0100,0200,0300}_*.sql`, `HELD.md` | 8.2 to 8.6 |
| `supabase/schemas/**` | 8.7 |
| `supabase/tests/rls/golf_document_pins_opens_rls.sql`, `golf_document_folders_rls.sql` | new pgTAP (11.2) |
| `src/clubhouse/__tests__/hub-docs.test.tsx`, `src/clubhouse/screens/hub/docs/__tests__/*.test.ts` | new unit tests (11.1) |
| `e2e/clubhouse-journeys.spec.ts` | the Documents journeys (11.3) |
| `src/clubhouse/screens/hub/parts.tsx` | unchanged until flag cleanup (then `Documents` and its CSS go) |

---

## 10. Edge cases

1. **Same file in three places** (the rail's Pinned and Recents, and the grid): shown in each, as claude.ai does. One menu acts on the one document; all three update.
2. **Folder names that differ only in case or spaces** ("Travel", "travel ", "TRAVEL"): one folder row (grouped by `lower(btrim())`), named by the folder table's spelling, else the newest file's. Rename fixes them all at once (the function matches case-insensitively).
3. **A team over 1,000 documents**: PostgREST caps `getDocuments` at 1,000 rows without a range. The library shows a quiet line at the end, "Showing the 1,000 most recent documents", when exactly 1,000 come back, and logs it; server paging is out of scope (no team is near it; Fairway's page has the same cap).
4. **A file shared, pinned by a player, then made coach-only**: it leaves the player's Pinned and Recents on the next load (RLS hides it); the rows stay and return if it is shared again.
5. **A coach on two teams** (program head): the library is the current team's (`resolveClubhouseTeam`); pins and opens are read for the user and matched to this team's ids only.
6. **Plan republished while a player has the page open**: the card's meta shows the old version until refresh; the plan page is N-00's and loads the latest.
7. **Plan taken down while a player has the library open**: opening it lands on N-00's "This plan was taken down" state; the next load hides the card.
8. **N-00's flag turned off after plans were published**: plan rows are left out, the Practice plans section is not drawn, "New practice plan" is not offered; turning it back on restores them.
9. **Before N-00's migration**: no `practice_plan_id` column; `toLibrary` reads it as optional and every row is a file. Slices 1 to 3 work.
10. **Before N-10's migrations**: no Pinned, no Recents, no Pin item, no New folder, no folder rename or delete; everything else works.
11. **Legacy markdown plans** (`saveTextDocument` with category `practice_plan`, `documents.ts:470`): they are files (`file_url` set, no `practice_plan_id`), kind Docs, in whichever folder they name. Not moved into Practice plans.
12. **A legacy file whose folder text is "Practice plans"**: shown in the Practice plans section with Move first in its menu (8.5).
13. **Delete a file that is pinned and recent**: cascades remove its pins and opens (FK `ON DELETE CASCADE`).
14. **Two coaches rename the same folder at once**: the second finds no rows under the old name (moved 0) and its new name either matches or collides (CH-10161).
15. **Upload into a folder dropped on, then the folder renamed mid-upload**: the file lands under the old name and appears as a second folder row with that name; the coach can move it. Rare; not guarded.
16. **localStorage blocked** (private mode, Lockdown): every rail list opens on each visit; the grid shows. No error.
17. **Text Size at the largest steps**: rail rows and phone titles grow, card titles wrap to two lines; the thumbnail picture stays (7.3).
18. **9-hole rounds, shot tracking, seasons**: not touched.
19. **Window resized across 860px of Hub width** (or the app sidebar folded or opened): the rail moves between inline and overlay; an open overlay closes; the lists keep their state and the folder filter stays.
20. **`?folder=` for a folder that no longer exists** (deleted elsewhere, an old link): the filter clears to All documents, silently.

---

## 11. Tests

### 11.1 Unit (vitest)

- `doc-filter.test.ts`: tab rules (Yours by `uploaded_by`, null uploader only in All; Shared is `is_public === true`, taken-down plans excluded); type kinds from MIME and extension (incl. `video/quicktime`, HEIC, `.md`); search normalises accents and case, ANDs words, matches folder and focus line; sorts (Recent by `updated_at` then `created_at`; Name numeric; Type order); rail lists (Pinned in pin order; Recents capped at 8; Folders in rail order Practice plans, Team, A to Z, with counts that ignore the tab, type and search); folder filter; Last opened sort (never-opened after, in Recent order); grouping by `lower(btrim(folder))`.
- `docs-library.test.ts`: `toLibrary` with and without `practice_plan_id`; plan rows kind `plan`, `focus` from description, `takenDown` only for coach; pins and opens for other teams' ids dropped; null extras (`pinsReady: false`).
- `doc-menu.test.ts`: menus per role and kind exactly as 4.7 (no Rename, Move, Share or Delete on a plan; players never get Rename, Move, Share, Delete; folder menu never on Practice plans or Team; "What changed" only from v2).
- `doc-when.test.ts`: "just now", "10m ago", "Updated 1:02 PM · v3", "Opened Oct 14", "Updated since you opened it".
- `doc-memory.test.ts`: keys include user and team; a throwing `localStorage` returns defaults; only closed lists stored; one groups key serves the rail and the phone headers.
- `hub-docs.test.tsx` (React Testing Library, named by code): CH-10660 a rail list's label toggles `aria-expanded` and `data-open`, `aria-controls` points at its list; CH-10863 the rail is `nav` "Library", the chosen folder row has `aria-current` and the breadcrumb `aria-current="page"`; CH-10864 the overlay rail is a modal dialog and focus returns to "Show library" on Esc; every bar icon button has an `aria-label` that equals its tooltip; the pin chip has `aria-pressed`; type tiles and New are absent for players and the tiles' names contain their labels; a folder row press filters the grid and draws the breadcrumb; CH-10861 live region text; CH-10360, CH-10361, CH-10362, CH-10363, CH-10364, CH-10365 empties; CH-10261 extras failed line; CH-10160 to CH-10163 validation in the sheets; CH-10060, CH-10061, CH-10063, CH-10064, CH-10065, CH-10066, CH-10067 failure toasts; CH-10560 confirm copy with and without files; CH-10460 skeleton; the flag off renders the old `Documents` (CH-10304 unchanged); a plan card is an `<a>` to `/golf/dashboard/practice/plan/<id>?from=docs`; `haptic('commit')` never called.
- `motion-durations-pinned` and `haptic-grammar` pass unchanged (no new durations, no `commit`).
- `alias.test.ts`: `/golf/dashboard/team-hub/documents` is in `CH_ALIASED_ROUTES` and redirects with `folder` kept.
- Action tests in `src/app/golf/actions/__tests__/document-library.test.ts`: `pinDocument` treats 23505 as done; `markOpened` never throws; folder errors map to codes; `updateDocumentImpl` refuses "Practice plans" and plan rows; `getDownloadUrl` refuses a player on a coach-only row and refuses plans.

### 11.2 pgTAP

`supabase/tests/rls/golf_document_pins_opens_rls.sql` (modelled on `v3_goals_coach_create_player_team_binding.sql`). Fixtures: team A with a head coach, an assistant, two active players and one inactive member; team B with a coach; A's documents: one shared, one coach-only.
1. A player pins A's shared document: passes. Pins A's coach-only document: fails (42501, the EXISTS sees nothing). Pins B's document: fails.
2. A coach pins the coach-only document: passes.
3. A player selects pins: sees only their own; the coach sees only their own; anon: none (no privilege).
4. A player inserts a pin with `user_id` set to the coach: fails WITH CHECK.
5. `UPDATE` on pins: permission denied (no grant).
6. A player deletes the coach's pin: 0 rows. Deletes their own: 1.
7. `golf_document_mark_opened` by a player on the shared document: returns a time, one row. Called again at once: same time (throttle), still one row. After `opened_at` is set back 2 minutes (as service_role): moves.
8. `golf_document_mark_opened` by a player on the coach-only document: 42501. By anon: no EXECUTE.
9. A player updates their open's `document_id`: permission denied (column grant). Selects others' opens: none.
10. Deleting the document cascades its pins and opens.
11. The inactive member: cannot pin the shared document (not a team player).
12. `has_table_privilege('authenticated','public.golf_document_pins','TRUNCATE')` and the same for opens are false.

`supabase/tests/rls/golf_document_folders_rls.sql`:
1. The assistant creates "Travel": passes. A player creates a folder: fails. B's coach creates one for A: fails. A user with a self-made `golf_coaches` row who is on no staff: fails.
2. "team" and "Practice Plans" names: check violation. "  Travel" (untrimmed): check violation. 61 characters: check violation. "travel" when "Travel" exists: unique violation.
3. A player selects folders: none. A's coach: A's only.
4. `golf_document_folder_rename(A, 'Travel', 'Away trips')` by the assistant with two files in "travel ": returns 2, both files now "Away trips", the row renamed. On a text-only folder "Scorecards" (no row): returns its count and inserts a row. To "Team": 22023. To an existing name: 23505. By a player: 42501. Case-only "Travel" → "TRAVEL": passes.
5. `golf_document_folder_delete(A, 'Away trips')`: returns 2, files have `folder` NULL, row gone, files still exist. "Team": 22023. By a player: 42501.
6. The creator deletes their own folder row directly: passes; another coach of A: passes; a player: 0 rows.
7. With 090300 applied (after N-00's 010400): an UPDATE of a file to folder "Practice plans" fails `golf_documents_plan_folder_check`; a plan row moved to "Team" fails; N-00's publish path (a plan row in "Practice plans") passes.

### 11.3 Playwright (`e2e/clubhouse-journeys.spec.ts`, seeded team from `helpers/clubhouse-local-seed.ts`)

- **Rail collapse** (coach, desktop 1440): Team Hub → Documents; the rail shows Pinned, Recents, Folders. Press "Folders": `aria-expanded="false"`, the caret's computed `rotate` is `-90deg`, the folder rows are hidden (`visibility: hidden` after the reveal) and not focusable; reload; still closed; press again: open. Same for Pinned once a pin exists.
- **Folder filter**: press "Travel" in the rail: the URL has `folder=travel`, the breadcrumb reads "All documents › Travel 2", the row has `aria-current`, and only Travel's cards show. Press "All documents": the filter clears. Choose Travel again, then Back: cleared. Open a file, then the rail's "View all": no filter, sort is Last opened, the opened file is first.
- **Hover buttons**: hover a card: its border colour changes to `--ch-border-strong`'s value and the ⋯ and pin chips become visible (opacity 1); move away: they hide. Press the pin chip: the card appears in the rail's Pinned and keeps its pin chip without hover; press it again: Pinned disappears. The ⋯ chip opens the menu with the coach's items.
- **Keyboard**: from the tab strip, Tab reaches the rail's New, Search, the list labels and rows (Arrow Down moves between rows), then the type tiles, the bar's Show tabs and its four icon buttons (each shows its tooltip on focus), then the first card; focusing a card shows its chips; Enter opens it; Shift+F10 opens its menu; "/" focuses the search; Esc clears and closes it.
- **Narrow desktop** (1024 wide, sidebar open): no inline rail; "Show library" opens the overlay dialog with focus on its first row; Esc closes it and focus is back on the toggle; choosing a folder closes it and filters.
- Coach: search "rules" filters the grid to one card with the count line; Escape restores the grid.
- Coach: Filter "PDFs" and "Sort by name" from the filter menu (the button shows its dot); switch to list; reload; all three kept.
- Coach: Rename a file; Move it to a new folder via "New folder…"; Share with players off; the Shared tab no longer lists it.
- Coach: the type tiles "Upload", "Folder" and (with N-00) "Practice plan" start their flows; a player sees no tiles and no New.
- Player, phone 390: Pinned, Recents and Folders headers with carets; rows have a 56px thumbnail; open a shared file (new tab); it appears in Recents with "Opened just now"; no tabs, no +; the ⋯ has Open, Pin, Download only.
- With N-00 seeded: a published plan card on the green ground shows its mini page and "Published"; a v3 plan shows two stacked sheets; pressing it lands on `/golf/dashboard/practice/plan/<id>?from=docs`; Back returns to Documents with the same folder filter.
- Reduced motion (`page.emulateMedia({ reducedMotion: 'reduce' })`): a rail list and a phone header toggle with computed `transition-duration` of 1ms; the overlay rail opens with no transition.
- `npm run clubhouse:a11y`: preview states for the library (rail open and closed, folder filtered, grid, list, overlay rail, search, empty, coach and player, light and dark) at 1440, 1024 and 390, no axe violations (CH-10862).

---

## 12. Owner calls

| # | Call | Default (the plan is written to it) |
|---|---|---|
| 12.1 | Where open and closed rail lists, grid or list, sort and type are remembered | `localStorage` per viewer and device (4.11). The other version is a small per-user table so the state follows a coach across devices. |
| 12.2 | Where Documents lives | Stays Team Hub's Documents tab, plus the short address `/golf/dashboard/team-hub/documents` (3.1, 3.2). No sidebar item. |
| 12.3 | Pins: per viewer or also "Pinned for the team" by a coach | Per viewer only, as claude.ai. A team pin is a later, separate call. |
| 12.4 | Can a coach see who opened a file | No. Opens are private to each viewer; read receipts for plans are N-00's Seen by. |
| 12.5 | PDF first-page thumbnails | Not in v1: a slate ground with a mini page carrying the title and placeholder bars. A first-page render needs a PDF library (pdf.js, 400 KB+) or a stored thumbnail made at upload; both are new work. |
| 12.6 | Image thumbnails | The image itself filling the thumbnail, from a 1-hour signed link, only up to 8 MB; bigger images get the slate mini page. No stored thumbnails, no paid image transforms. |
| 12.7 | Web links as documents | Not in v1 (no link documents exist today). |
| 12.8 | The tiles at the top | Changed with the revision: they start creation, as claude.ai's do ("Practice plan", "Upload", "Folder"), coach only; the type filter moved into the bar's filter menu. The other version: tiles as type filters with counts. |
| 12.9 | Rail order | Pinned, Recents, Folders; inside Folders: Practice plans, Team, then folders A to Z. The grid itself is one flat list in the chosen sort. |
| 12.10 | Multi-select, drag to move, drag to reorder folders | Not in v1. Move is one file at a time from the menu; dropping files from the computer onto a folder uploads there. |
| 12.11 | Practice plans visible to players in Documents | Yes, every published plan (DESIGN_SPEC owner call 2), not only the plans a player is in. |
| 12.12 | Upload default | As today: shared with players, into Team, or into the folder the grid is filtered to or the rail folder dropped on. |
| 12.14 | The rail between the phone layout and wide desktop | Under 860px of Hub width (about 821 to 1123px with the sidebar open, 821 to 971px with it folded) the rail is an overlay behind a "Show library" button (4.12.2). The other version: the rail always inline, with the grid at one or two columns. |
| 12.15 | Type tiles for players | None (players create nothing here). The other version: no tiles for anyone, New only in the rail and the bar. |
| 12.16 | When the grid has three columns | From a 760px main column (each card 240px or more): three at 1440, two at 1280. The other version: from 700px, giving three 221px cards at 1280. |
| 12.17 | Team Hub's head on Documents | No head primary, as today (`TeamHub.tsx:483-493`); New is in the rail, the bar and the tiles. The other version: a "New" head primary too. |

### 12.13 CH codes (provisional; page 10 Team Hub; band x60 to x69 in each kind, checked against main, phase2, pr/2362, pr/2363, pr/2364 and every plan in `build-plans/` and `build-plans-2/` on 2026-10-25: none of CH-10x60 to CH-10x69 is used)

| Code | Kind | When | They see |
|---|---|---|---|
| CH-10060 | Error toast | Rename fails | "Couldn't rename Local rules" + reason or "Try again." |
| CH-10061 | Error toast | Move fails | "Couldn't move Local rules" + Retry |
| CH-10062 | Error toast | Share toggle fails | "Couldn't change who can see Local rules" + Retry |
| CH-10063 | Error toast | Pin or unpin fails | "Couldn't pin Thursday practice" + Retry |
| CH-10064 | Error toast | New folder fails | "Couldn't create Travel" + reason |
| CH-10065 | Error toast | Folder rename fails | "Couldn't rename Travel" + reason |
| CH-10066 | Error toast | Folder delete fails | "Couldn't delete Travel. Its files are where they were." |
| CH-10067 | Error toast | Download fails | "Couldn't download Local rules" + "Try again, or open it and save from there." |
| CH-10160 | Validation | Empty name | "Give it a name." |
| CH-10161 | Validation | Folder name taken | "There's already a folder called Travel." |
| CH-10162 | Validation | Reserved folder name | "Team and Practice plans are kept by GolfHelm. Pick another name." |
| CH-10163 | Validation | Name too long | "Keep it under 120 characters." (files) / "Keep it under 60 characters." (folders) |
| CH-10260 | Didn't load | Previews failed | No copy; grounds and mini pages stay (logged) |
| CH-10261 | Didn't load | Pins or opens failed | "Pinned and Recents didn't load. Your files are below." + Try again |
| CH-10360 | Empty | Search, no match | "No documents match "lag"" + "Check the spelling, or clear the search." + Clear search |
| CH-10361 | Empty | Yours | "Nothing you've added yet" + "Files you upload and plans you publish show here." |
| CH-10362 | Empty | Shared with players | "Nothing is shared with players" + "Use Share with players on a file's menu." |
| CH-10363 | Empty | Type filter | "No practice plans here" + Clear filter |
| CH-10364 | Empty | Practice plans, none (coach) | "Plans you publish are filed here." + New practice plan |
| CH-10365 | Empty | Empty coach folder | "Nothing in Travel yet" + "Move files here, or drop them on this folder." |
| CH-10460 | Loading | Previews loading | still skeleton bars on the mini page (plans), still shimmer on the slate ground (images) |
| CH-10461 | Loading | Rename, move, folder save in progress | "Saving…" on the sheet's button |
| CH-10560 | Confirm | Delete folder | "Delete the folder Travel?" + "Its 4 files move to Team. No file is deleted." Keep it / Delete |
| CH-10660 | Motion | Rail list and phone header open and close | grid rows 0fr↔1fr on the smooth spring, opacity on base; instant under Reduce Motion |
| CH-10661 | Motion | Caret turn | 0↔−90deg, base |
| CH-10662 | Motion | Grid↔list | crossfade, quick |
| CH-10663 | Motion | Card hover and press | border to strong, quick; press tint |
| CH-10664 | Motion | Overlay rail open and close | slide on the smooth spring, scrim on base; instant under Reduce Motion |
| CH-10665 | Motion | Card chips appear | opacity, quick |
| CH-10666 | Motion | Sticky bar edge | hairline fades in when stuck, quick |
| CH-10760 | Haptic | Pin, rename, move, share, folder writes landed | success |
| CH-10761 | Haptic | Long press opens the menu sheet | press |
| CH-10860 | Accessibility | Rail list labels and phone headers | button in h2, `aria-expanded`, `aria-controls`; closed rows hidden |
| CH-10861 | Accessibility | Search results count | polite live region |
| CH-10862 | Accessibility | No axe violations in library states | a11y scan |
| CH-10863 | Accessibility | Rail and breadcrumb | `nav` "Library" with arrow-key rows and `aria-current`; `nav` "Breadcrumb" with `aria-current="page"` |
| CH-10864 | Accessibility | Overlay rail | modal dialog "Library": focus in, Esc closes, focus back to "Show library" |
| CH-10960 | Network and UX | Image link expired | re-signed once silently, then the slate mini page |

Reused unchanged: CH-10004 (open fails), CH-10008 (upload fails), CH-10009 (delete fails), CH-10204 (didn't load), CH-10205 (section crash), CH-10304 (no documents), CH-10401 (uploading; now on the Upload tile, the New menu's Upload row and the drop outline), CH-10503 (delete file confirm), CH-10701 and CH-10702 (haptic grammar).

---

## 13. Build order (thin slices)

**Slice 0, behind the flag, no migration.** Register `golf_documents_library`; `ClubhouseHubRoute` reads it; `TeamHub` mounts an empty `DocumentsLibrary` shell when on, the old `Documents` when off. `toLibrary` and `doc-filter` with tests; the `--ch-doc-*` tokens in `hub-docs.css`. Done when: flag off is pixel-identical; tests pass.

**Slice 1, the library on today's data, no migration.** The two-column layout with the rail (New, Search, the Folders list with counts, the caret reveal, `localStorage` for lists, view, sort and type), the overlay rail under 860px, the type tiles (Upload only), the sticky bar (Show tabs, search, filter menu with type and sort, view, +), the folder filter with breadcrumb and `?folder=`, `?show=`, grid cards with file thumbnails (slate ground, mini page) and list rows, the hover and focus chips (⋯ only, since there is no pins table yet), the phone layout (tabs, search, Filter and sort sheet, Folders header, rows with 56px thumbnails, + `ActionSheet`), drop-to-folder upload, menus with Rename, Move (existing folders and Team), Share with players, Download, Delete; `editDocument` and `getDownloadUrl`; the two refusals in `updateDocumentImpl`; desktop preview modal; the short address. Pinned, Recents, the pin chip, Last opened, New folder and the Folder tile are absent because their tables are not there. Done when: unit, RTL and the slice's Playwright (rail collapse, folder filter, keyboard, narrow desktop) pass; a device check of a rail list's reveal and the overlay rail on an iPhone 13 and a 2019 MacBook Air shows no dropped frames in Safari's timeline; light and dark checked against 7.5.

**Slice 2, pins and opens (needs 090000 and 090100 applied by the owner).** `loadDocsExtras`, the rail's Pinned and Recents lists with View all, the pin chip and pinned cards' always-on pin, Pin in the menus, `markOpened` on every open, "Opened 10m ago", sort Last opened, the "Updated since you opened it" dot, CH-10261. Done when: pgTAP `golf_document_pins_opens_rls.sql` passes; the Playwright hover-buttons, pin and View all journeys pass.

**Slice 3, folders (needs 090200).** The Folder tile and New folder (New menu, Move sheet), empty coach folders in the rail with count 0, the rail row ⋯ and breadcrumb ⋯ with Rename folder and Delete folder. Done when: pgTAP `golf_document_folders_rls.sql` passes; Playwright folder journey passes.

**Slice 4, practice plans (needs N-00 merged, its 010400 and 010600 applied, and N-00's flag).** Plan kind, Practice plans first in the rail's Folders, the Practice plan tile, the green-ground thumbnail with `PlanGlance` scaled on the mini page through `loadDocumentPreviews`, the stacked sheets for v2 and later, plan meta and versions, plan menus (Copy link, Print, What changed, Take down or Republish), "New practice plan", `?from=docs`, replace N-00's Clubhouse shim; then 090300 (owner applies after 010400). Done when: the plan journeys and the 090300 pgTAP cases pass.

**Slice 5, image thumbnails and polish.** Signed image previews filling the thumbnail, CH-10960 re-sign, a11y scan states. Done when: `clubhouse:a11y` clean at 1440, 1024 and 390 in light and dark.

Each slice is its own PR; nothing deploys, no flag flips, no migration is applied by the build.

---

## Departs from the design spec

- Spec "Sections, each a header row with a chevron": following Nick's 11:45pm feedback and the claude.ai gallery, Pinned, Recents and Folders are small collapsible lists in a left rail (caret after the label), and the grid is one flat list filtered by the chosen folder; on the phone they are collapsible headers above the rows.
- Spec "Sort (Recently opened, Recently updated, Name)": the plan has Recent (updated), Last opened, Name and Type, inside the bar's filter menu with the type filter.
- Spec "+ New" in the toolbar: kept as the bar's +, and also the rail's New row and the type tiles (Upload files, New folder, New practice plan). Team Hub's head keeps no primary on Documents, as today (`TeamHub.tsx:483-493`).
- Spec type list "Practice plans, PDFs, Sheets, Docs, Images": adds Slides, Videos and Other because the bucket takes them (`upload-rules.ts:9-31`); "Links" is left out (none exist).
- Spec "a PDF or sheet shows a large type tile": a deep slate ground with a mini page carrying the title, in claude.ai's thumbnail grammar.
- Spec "Phone: list view by default": the phone always shows rows (56px thumbnails); no phone grid.
- Spec "list view: rows with a small preview, title, folder, updated, size": size moves to the row's second line so the row fits a phone.

## Wiring, 4 Nov 2026

Checked against helmv3 `main` 03d9087, read only. Scope (owner, 4 Nov): only the Documents row a practice plan files into and its folder. The library rail, grid, pins, opens, folder table, previews, search and the other sheets are **not in this build: minimum prerequisites only**; today's `Documents` (`screens/hub/parts.tsx:665`) keeps rendering with `golf_documents_library` off.

**Where the SQL lives.** `20261026090000` to `20261026090300` exist only as fenced blocks in 8.2 to 8.5; no `.sql` file is in the package or the repo, and `HELD.md` has no row. Only `090300` is needed for this build (after N-00 010400), narrowed this pass (Nick's call, DECISIONS "Folders", 4 Nov): an uploaded file may not sit in "Practice plans"; a plan row may sit in any coach folder. 090000 to 090200 are not needed (folders stay names in `golf_documents.folder`).

| Element or action | Reads | Writes or calls | Who and RLS | Validation | Success | Failure and rollback | Sync | Notification | Flag | Until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Plan row in a folder (draft and published) | `getDocuments` (`documents.ts:241`; role at 202, player filter `is_public` at 216), grouped by `folders()` (`data/hub.ts:897`) | draft: `golf_practice_plan_file_draft` (practice-plan held 20261104090000); publish: `golf_practice_plan_publish` (N-00 010600) | coach sees drafts; player sees `is_public` rows only (`golf_documents_select_team`, `policies/golf.sql:635`) | folder 1 to 60, trimmed, not "Team" | row listed with "Draft · Only coaches" or "Published · <date>" | the save or publish fails as a whole | `refresh()` after the plan action; Hub refetch on focus | none | `golf_practice_plans` (rows hidden by the reader when off) | no plan rows; today's list unchanged |
| Open a plan row | `practice_plan_id` | navigate to `/golf/dashboard/practice/plan/<id>?from=docs` (N-00 slice 3) | page re-checks by version RLS | `file_url` null: never a file download (`getPreviewUrl` is not called) | plan page | flag off: redirect to Calendar | n/a | none | both | row not shown |
| Move a plan row | folder names | `updateDocument(id, {folder})` (`documents.ts:605`; impl `updateDocumentImpl` 536, coach check 564) | coach; `golf_documents_update_coach` as rewritten by N-00 010400 (plan row must point at a plan of the same team) | file row into "Practice plans" refused (090300 and the action); plan rows accept only `folder` | toast; row moves | refusal text; nothing moves | `refresh()` | none (moving a published plan tells no one) | both | Move hidden |
| Null-safe shim | `file_url` may be null after 010400 | `folders()` and the open action accept null and send plans to their page; Fairway's documents page and event picker filter `practice_plan_id IS NULL` | n/a | n/a | n/a | n/a | n/a | none | n/a | not needed |

Nothing here sends a push or bell row, and nothing touches shot tracking.

Citations that moved (read against f30a6d5; now 03d9087):

| Was | Now |
|---|---|
| `documents.ts:193` / `:200` / `:204-208` (getDocuments role, select, filter) | `:202` / `:209` / `:203-216` |
| `documents.ts:534-590`, `:556-558` (updateDocumentImpl, coach check) | `:536-598`, `:564` (fixed in 8.9) |
| `documents.ts:1597` (updateGolfDocument) | `:1605` (fixed in 8.9) |
| `documents.ts:1123-1128`, `:1153-1218` (getPreviewUrlImpl role check, path lookup) | `:1134-1135`, `:1141-1222` |
| `functions/public.sql:6964-6976` | `:7345-7358` |
| `policies/golf.sql:1096` (`golf_team_coach_staff_insert`) | `:1122` |
| `hub.ts:310-316`, `:315` | `:317-330`, `:330` |
| `database.ts` golf_documents `:13129` | `:13258` |
| `HELD.md:151` register | `:155` |
