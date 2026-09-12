<!-- markdownlint-disable MD013 -->
# CoachHelm cockpit and Signals workspace — `/golf/dashboard/intelligence` (coach)

Files: `src/app/golf/(dashboard)/dashboard/intelligence/page.tsx`, `src/components/golf/coachhelm/home/CoachIntelligenceHome.tsx`, `home/CommandOpening.tsx`, `triage/TriageDesk.tsx` (611), `triage/{BriefBand,ViewSwitch,SignalQueue,SignalRow,SignalDossier,TeamSignalSummary,EffectivenessScoreboard}.tsx`, `src/components/fairway/pages/coachhelm/{PlayersGridView,FairwayEffectiveness,TeamCategoryLeakBand}.tsx`.

## What the capture shows (phone, 19,000px)

"Welcome back, Nick" (a second welcome after the dashboard), quick-action pills, an Ask box, a "Program pulse" card with three bullets, "Where the team is bleeding strokes" as five category cards, a green urgent-signal card, a Signals/Players/Effectiveness Segmented, a Roster/Focus-areas sub-Segmented, a "Who needs your attention" card + "Did the coaching land?" card + four numbers (all repeated from Roster), a player card gallery with three buttons each, then the signals feed as cards. Everything the cockpit could be, stacked as cards with no workstation structure.

## SCREEN

- Archetype: A (cockpit) on desktop = D (workspace) for the Signals view.
- Dominant object: the Spine (deep green: program pulse readouts, the ONE urgent signal, priorities, "Ask CoachHelm" CTA) on the left; on the right the Signals workspace: queue | dossier | assistant.
- Supporting: the team leak band (TeamCategoryLeakBand as one row, not five cards), the players board (PlayersGridView → MatrixBoard rows), effectiveness scoreboard (InstrumentCluster).
- Tertiary: refresh, view switch.
- Floating: a small FrostToolbar for the view switch + filters on desktop (the one frosted element); dock on phone.
- Modal: signal dossier as a Sheet on phone; assistant as a secondary Sheet.

## EXISTING FAIRWAY

Spine, SpineLedger, PriorityList, InstrumentPanel/Readout, ResizableWorkspace (Phase 2), ScrollArea (Phase 2), SignalChip, DrillPanel/SignalDossier, InsightPanel, MatrixBoard, InstrumentCluster, Toolbar material="frost", Sheet, Menu.

## CONTAINERS TO REMOVE

1. CommandOpening's welcome + pills + Ask box + Program pulse card → the Spine: identity line (team, date), pulse as three Readouts (open signals · players needing attention · outcomes awaiting), the one urgent signal as the Spine's raised block, PriorityList (top 3 signals), ledger (rounds in window, focus areas active), CTA "Ask CoachHelm" (opens the assistant pane / Sheet). No h1 "Welcome back" here — the h1 is "CoachHelm" with the team as eyebrow.
2. "Where the team is bleeding strokes" five cards → TeamCategoryLeakBand as ONE horizontal band under the workspace toolbar (already exists as a band component).
3. Roster health header duplicate → removed from this route (Roster owns it).
4. PlayersGridView cards → MatrixBoard rows (Players view), row click → dossier pane.
5. Signals feed cards → SignalQueue as dense rows in a ScrollArea (severity chip · player · claim · age · state); selection drives SignalDossier in the center pane; the right pane is the InsightPanel (reasoning + recommended action + Ask).

## COMPOSITION (desktop 1440)

```text
ViewHeader   COACHHELM · Demo University Golf / CoachHelm            [Refresh] [⋯]
┌ Spine (3) ──────────┐ ┌ Workspace (9) ──────────────────────────────────────────┐
│ 8 open · 6 need you │ │ FrostToolbar  [Signals · Players · Effectiveness]  [Severity ▾] [Category ▾]
│ ● URGENT            │ │ TeamCategoryLeakBand (one row: Putting −3.23 … Off the tee +0.77)
│ Cole Bennett —      │ │ ┌ Queue (28%) ──┬ Dossier (44%) ───────┬ CoachHelm (28%) ─┐
│ 3–5ft make 47%      │ │ │ ▲ Cole · lag… │ Claim headline        │ Why this matters │
│ [Scan team]         │ │ │ ▲ Owen · …    │ severity · category   │ evidence rows    │
│ ── priorities ──    │ │ │ ● Mason · …   │ evidence block        │ recommended      │
│ 01 … 02 … 03 …      │ │ │ (ScrollArea)  │ [Reviewed][Dismiss]   │ [Add focus area] │
│ ── ledger ──        │ │ │               │ [Prescribe]           │ [Ask …]          │
│ [Ask CoachHelm]     │ │ └───────────────┴───────────────────────┴──────────────────┘
└─────────────────────┘ └──────────────────────────────────────────────────────────┘
```

Phone: Spine collapses (pulse readouts + urgent + CTA); view switch as a Segmented; queue rows full width; tap → dossier Sheet (frost); "Ask" → assistant Sheet.

## STATES

- No signals: queue EmptyState "Nothing needs you right now" with "Scan team"; dossier pane shows the team leak band explanation.
- Refresh in flight: InlineNotice row at the top of the workspace, panes stay.

## RISKS

- TriageDesk owns optimistic state for review/dismiss; keep it as the state owner and re-lay its children. ResizableWorkspace and ScrollArea land with the primitives push; until then use a CSS grid with the same proportions.
- Tests under triage/__tests__ pin the view switch, queue rows and dossier actions.
