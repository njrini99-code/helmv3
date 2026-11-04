# Lane report: coachhelm (Quick chat, QC0 to QC6, and the shared AGENT_KIT, TASK_FIELDS, QUICK_CHAT)

Completeness pass, 4 Nov 2026. Files changed, all in `pkg/design-refresh/coachhelm/`: 05, 06, 07, 08, 02, 03, 01-BRIEF, README, QUICK_CHAT, TASK_FIELDS, AGENT_KIT. Each has a pointer under its H1 and one section titled "Completeness pass, 4 Nov 2026". In-place fixes carry "(fixed 4 Nov: ...)" and are logged in 05's section (first table) and AGENT_KIT's log. Nothing outside the lane folders was edited. No mcp__hearthbot__ tool was called. Nothing was published, pushed or migrated.

## 1. Matrix

"ok" means it was already covered; "added" means this pass added it; "fixed" means a row was corrected in place.

| ID | States | 390 / 430 / 1280, dark, XXL, RM | Keyboard, VoiceOver | Motion in / out | Entry, data, flags | 08 by ID |
|---|---|---|---|---|---|---|
| S-KEY, .working, .flag | ok | ok | ok | ok | flag-off parity ok; push or bell never opens the panel (added) | ok |
| S-LIVE | ok | ok | ok | ok | ok | ok |
| S-PANEL | ok; thread per team-zone day (added) | ok | focus rules added | ok | ok | ok |
| S-PANEL.hello | ok; plan tile by flag (added) | ok | ok | ok | `quickStarts` ok | ok |
| S-PANEL.composer | ok | ok | ok | ok | ok | ok |
| S-PANEL.full | **matrix added** (run in flight, waiting card, Ask v2 off, back, offline) | added | added | M-FULL ok | added | **CP-QC-1 to 5 added** |
| S-RUN.request, .steps | ok; live region added | ok | added | ok | ok | ok |
| S-RUN.ask-plan, .ask-qual, .ask-any | ok; "Which practice?" added | ok | ok | ok | ok | ok |
| S-RUN.earlier | **new ID** (30-turn fold) | added | added | M-CP-QC-earlier | n/a | CP-QC-27 |
| S-TASK.cal/.msg/.qual/.plan | ok | ok | ok | ok | ok | ok |
| S-TASK.plan.inert | **new ID** | spec added | `aria-disabled` | M-CP-QC-inert | both flags, held migrations | CP-QC-10 to 12 |
| S-TASK.plan.needs-event | **new ID** | spec added | ok | M-CP-QC-needs-event, .undo | `golf_events`, N-00 010000 | CP-QC-16 to 18 |
| S-TASK.plan.folder-menu | fixed (60 chars, folders by name) | ok | arrows, Enter, Escape added | ok | `listPlanFolders` | **CP-QC-6 added** |
| S-TASK.plan.new-folder | duplicate and reserved names added | spec added | ok | M-CP-QC-name | ok | **CP-QC-7 to 9 added** |
| S-TASK.offline | **new ID** | spec added | ok | M-CP-QC-offline | n/a | CP-QC-22, 23 |
| S-TASK.busy | ok; double submit added | ok | ok | ok | idempotency | CP-QC-30 |
| S-RCPT and .told/.undone/.failed | fixed (plan draft copy, plan Undo); two devices, roster change added | ok | Undo name added | M-CP-QC-elsewhere, ring-resume | HM1 absent fallback added | CP-QC-24 to 26, 31, 32 |
| S-RUN.cancelled, .stopped | ok | ok | ok | ok | ok | ok |
| S-OPEN | fixed (plan opens its plan page) | ok | ok | M-CP-QC-open-plan | `?from=coachhelm&ret=` | CP-QC-20 |
| S-OPEN.gone | **new ID** | n/a | n/a | none | destination not-found states | CP-QC-21 |

Extras: pull to refresh, search, optimistic update, share and print are n/a in the panel (stated); scroll restore, discard (none, with midnight expiry), two devices, team zone and 1 Aug rollover, haptics, VoiceOver are now rows.

## 2. Gaps

- 26 gaps closed by added rows: 5 new IDs, the S-PANEL.full matrix, 32 CP-QC criteria, 9 motion rows, 12 spec rows.
- 14 wrong rows fixed in place: folder length 40 to 60; "folders not shipped"; S-OPEN route (twice); "Only you" to "Only coaches" (05, 06, 08, AGENT_KIT); AC-QC-KEY-06 haptic; AC-QC-PLN-03; AC-QC-RCP-04 (the plan kind is not held); AC-QC-OPN-01; 02 plan-folder bullet; 02 "save as text documents"; TASK_FIELDS §5.14 and §5.15; AGENT_KIT ⑦ Server line; AGENT_KIT's Ask lane note (one-card brief, free-text Save); drill wording changed to "Drill bank comes with the Practice tab".
- Left open: the design page `redesign/quick-chat.html` still prints "Only you can see it." on the plan told row. The build contract wins over the page, but the page needs one copy fix when it is next published.

## 3. Handoffs and contradictions

| Handoff | Rule | Status |
|---|---|---|
| Quick chat plan to the plan page | `savePracticePlanDraft`, then Open to `/golf/dashboard/practice/plan/<id>?from=coachhelm&ret=` | settled |
| Quick chat to the builder | "Help with this plan" on the builder route hands off to S-BLD.helper | settled |
| Quick chat to Ask | S-PANEL.full uses the same thread and run | settled |
| Drill requests | N-00 `golf_team_drills` via `createTeamDrill`; HM5 superseded | settled, and Ask agrees |
| Folders | name in `golf_documents.folder` for Ask AK9, the builder and the quick chat | settled, and Ask adopted it |
| Publish | never from the quick chat; plan page or Ask, deferred send | settled |

Contradictions:
- **Ask lane**: its order is Save, then "Want it on the calendar?". A plan needs an event (N-00 010000), so the event must come first. Ask should switch to event-first.
- **N-00 §1.4** cuts "CoachHelm writing plans". Nick's 31 Oct asks reverse that.

## 4. Needs a shared-file change

1. BUILD_BRIEF.md, PR QC0 to QC6. Replace `plans to "Practice plans" until folders ship` with: `plans save to any folder by name (default "Practice plans") through practice-plan's savePracticePlanDraft once N-00 slice 3 and its held 010000, 010400 and 010500 are in; until then the plan card is inert; the quick chat never publishes`.
2. BUILD_BRIEF.md, PR QC0 to QC6. After `One new spring, \`pour\` {0.42, 0}.` add: `A plan for a day with no practice adds the practice first (event confirm), then the plan.`
3. DECISIONS.md. Add: `4 Nov: one folder model (the name in golf_documents.folder) for Ask, Quick chat and the Practice builder; one drill bank (N-00 golf_team_drills; Ask HM5 superseded); a practice plan needs a practice event, so the event confirm runs first.`

## 5. Calls only Nick can make

1. Quick chat never publishes. Default: yes, Publish lives on the plan page.
2. A plan for a day with no practice adds the practice first. Default: yes.
3. A confirm card left waiting expires at the team zone's midnight. Default: yes.
4. Applying HM1 `20261101090000_coachhelm_action_runs_hold`. QC4 stays flag-off until he says yes.

## 6. START_HERE / BUILD_BRIEF coverage

- START_HERE row 11 (QC0 to QC6) and the kit note are correct.
- BUILD_BRIEF's QC section still has the old folder default (fix 1 in section 4). It doesn't say that the plan save depends on practice-plan PP4 and N-00 slice 3 (same fix).
- HM1 is covered in both files.

## Prerequisites

The quick chat's plan save needs practice-plan PP4. That in turn needs N-00 slices 0 to 3, with 010000, 010400 and 010500 applied. The drill request needs N-00 010100 (slice 2). The plan Open route needs N-00 slice 1. N-10 is not needed for folders. The full N-00 and N-10 screen list, the build rule, the disagreements and the slice order are in `lane-reports/practice-plan.md` under Prerequisites.
