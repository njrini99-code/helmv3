# Architecture Plan: ShotTracking Decomposition + Round Persistence Hook

**Bugs addressed:** P1 #31 (monolith component), P1 #35 (duplicated save logic)
**Status:** Planning only -- no implementation

---

## Part 1: Decomposing ShotTrackingComprehensive (P1 #31)

### Current state

`src/components/golf/ShotTrackingComprehensive.tsx` is 1,914 lines. The component
already delegates state management to four hooks (`useShotStateMachine`,
`usePenaltyHandler`, `useUndoManager`, `useEditShotModal`), so the remaining
bloat is almost entirely **render logic** -- JSX for 14 distinct UI sections
that are inlined in a single return statement.

### Proposed component tree

```
ShotTrackingComprehensive (orchestrator, ~200 lines)
  |
  +-- DesktopHeader              (~60 lines)
  |     Auto-save indicator, "Save & Exit" button.
  |
  +-- Scorecard                  (~180 lines)
  |     MobileNavigation sub-component.
  |     Scrollable hole cells (front 9, OUT, back 9, IN, TOTAL).
  |     Hole navigation buttons.
  |
  +-- ShotPills                  (~50 lines)
  |     Sticky shot-number indicator bar, click-to-edit.
  |
  +-- HoleHeader                 (~80 lines)
  |     Gradient header with hole number, par, current shot info.
  |     Inline progress bar (mobile).
  |
  +-- CompletedHoleReview        (~90 lines)
  |     Rendered when hole is finished. Shot list with tap-to-edit.
  |     "Back to Current Hole" button.
  |
  +-- ActiveShotForm             (~40 lines, thin wrapper)
  |   |  Visible when hole is NOT complete. Contains:
  |   |
  |   +-- ClubSelection          (~30 lines)
  |   |     Driver / Non-Driver segmented control (tee shots, par 4/5 only).
  |   |
  |   +-- PuttDetails            (~50 lines)
  |   |     Break + slope selectors. Shown only when putting.
  |   |
  |   +-- ShotResultGrid         (~60 lines)
  |   |     Context-aware result buttons (fairway/rough/sand/green/hole/other).
  |   |
  |   +-- MissDirectionPanel     (~40 lines)
  |   |     Delegates to <ApproachMissSelector> or <PuttMissTagSelector>.
  |   |     Also renders tee-shot left/right buttons.
  |   |
  |   +-- DistanceInput          (~80 lines)
  |   |     "Distance Remaining" / "Leave Distance" input.
  |   |     Quick-select putt buttons. Yards/feet toggle.
  |   |     Calculated shot-distance readout.
  |   |
  |   +-- NextShotButton         (~20 lines)
  |   |
  |   +-- ActionRow              (~60 lines)
  |         Penalty button, Undo button, Undo confirmation.
  |
  +-- CourseSidebar              (~120 lines)
  |     Desktop-only right column: overhead course SVG,
  |     ball position, lie indicator, shot history list.
  |
  +-- PenaltyModal               (~40 lines)
  |     Penalty type picker + confirm/cancel.
  |
  +-- EditShotModal              (~250 lines)
        Full edit form: lie, distance before/after, result, miss direction,
        putt details, delete confirmation, save/cancel footer.
```

**Total: 12 leaf components + 1 orchestrator + 1 thin wrapper (ActiveShotForm).**

### Prop interfaces (key types)

```ts
// Shared context that nearly every sub-component needs.
// Passed explicitly to avoid a context provider for a single-page component.
interface ShotTrackingContext {
  holes: RoundHole[];
  currentHole: RoundHole;
  currentHoleIndex: number;
  state: ShotTrackingState;        // from useShotStateMachine
  dispatch: Dispatch<ShotAction>;  // from useShotStateMachine
}

// DesktopHeader
interface DesktopHeaderProps {
  onExit?: () => void;
  autoSaveStatus: ShotTrackingState['autoSaveStatus'];
  holeNumber: number;
  totalHoles: number;
  shotCount: number;
  showAutoSave: boolean; // !!onAutoSave
}

// Scorecard
interface ScorecardProps {
  holes: RoundHole[];
  currentHoleIndex: number;
  onNavigateToHole?: (idx: number) => void;
  onExit?: () => void;
  autoSaveStatus: ShotTrackingState['autoSaveStatus'];
  showAutoSave: boolean;
}

// ShotPills
interface ShotPillsProps {
  currentShot: number;
  shotHistory: ShotRecord[];
  selectedShotNumber: number | null;
  onSelectShot: (num: number) => void;
  onEditShot: (shot: ShotRecord) => void;
}

// HoleHeader
interface HoleHeaderProps {
  currentHole: RoundHole;
  isHoleComplete: boolean;
  shotHistory: ShotRecord[];
  currentShot: number;
  shotType: string;
  currentLie: string;
  distanceToHole: number;
  distanceUnit: 'yards' | 'feet';
  progressPercent: number;
  displayDistance: number;
  displayUnit: 'yards' | 'feet';
}

// CompletedHoleReview
interface CompletedHoleReviewProps {
  shotHistory: ShotRecord[];
  currentHole: RoundHole;
  onEditShot: (shot: ShotRecord) => void;
  showBackToCurrentHole: boolean;
  onBackToCurrentHole: () => void;
}

// ClubSelection
interface ClubSelectionProps {
  usedDriver: boolean | null;
  onSetDriver: (val: boolean) => void;
}

// PuttDetails
interface PuttDetailsProps {
  puttBreak: ShotRecord['puttBreak'] | null;
  puttSlope: ShotRecord['puttSlope'] | null;
  onSetBreak: (val: ShotRecord['puttBreak']) => void;
  onSetSlope: (val: ShotRecord['puttSlope']) => void;
}

// ShotResultGrid
interface ShotResultGridProps {
  isPutting: boolean;
  isTeeShot: boolean;
  currentHolePar: number;
  resultOfShot: string | null;
  onResultSelect: (result: string) => void;
}

// MissDirectionPanel
interface MissDirectionPanelProps {
  isTeeShot: boolean;
  isPutting: boolean;
  isApproachOrAroundGreen: boolean;
  resultOfShot: string | null;
  missDirection: string | null;
  approachMissDirection: ApproachMissDirection | null;
  puttMissTags: PuttMissTag[];
  dispatch: Dispatch<ShotAction>;
}

// DistanceInput
interface DistanceInputProps {
  isPutting: boolean;
  isApproachOrAroundGreen: boolean;
  resultOfShot: string | null;
  distanceAfterShot: string;
  distanceAfterUnit: 'yards' | 'feet';
  distanceToHole: number;
  distanceUnit: 'yards' | 'feet';
  missDirection: string | null;
  approachMissDirection: ApproachMissDirection | null;
  distanceInputRef: React.RefObject<HTMLInputElement | null>;
  dispatch: Dispatch<ShotAction>;
}

// NextShotButton
interface NextShotButtonProps {
  isReady: boolean;
  isHole: boolean;
  currentShot: number;
  onNextShot: () => void;
}

// ActionRow
interface ActionRowProps {
  shotHistory: ShotRecord[];
  showUndoConfirm: boolean;
  undoSaving: boolean;
  onAddPenalty: () => void;
  onShowUndoConfirm: () => void;
  onHideUndoConfirm: () => void;
  onUndoLastShot: () => void;
}

// CourseSidebar
interface CourseSidebarProps {
  currentHole: RoundHole;
  currentShot: number;
  currentLie: string;
  isHoleComplete: boolean;
  shotHistory: ShotRecord[];
  selectedShotNumber: number | null;
  progressPercent: number;
  displayDistance: number;
  displayUnit: 'yards' | 'feet';
  missDirection: string | null;
  onSelectShot: (num: number) => void;
  onEditShot: (shot: ShotRecord) => void;
}

// PenaltyModal
interface PenaltyModalProps {
  isOpen: boolean;
  penaltyType: string | null;
  onSetPenaltyType: (type: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

// EditShotModal
interface EditShotModalProps {
  isOpen: boolean;
  editingShot: ShotRecord | null;
  editFormData: EditFormData | null;
  showDeleteConfirm: boolean;
  editSaving: boolean;
  editError: string | null;
  dispatch: Dispatch<ShotAction>;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}
```

### State ownership

State does **not** move. `useShotStateMachine` remains the single source of
truth -- it already lives in a hook, so extracting sub-components is purely a
render-layer operation. Every sub-component receives the slices of state it
needs via props, plus dispatch (or pre-bound callbacks) for mutations.

The orchestrator (`ShotTrackingComprehensive`) remains responsible for:

1. Calling all four hooks (state machine, penalty, undo, edit).
2. Computing derived values (`isHoleComplete`, `progressPercent`, `isReadyForNextShot`, etc.).
3. Implementing `handleNextShot` (it touches too many state slices and callbacks to belong in a sub-component).
4. Wiring sub-component props from state + derived values.

### File layout

```
src/components/golf/shot-tracking/
  index.ts                        (re-exports ShotTrackingComprehensive)
  ShotTrackingComprehensive.tsx   (orchestrator)
  DesktopHeader.tsx
  Scorecard.tsx
  ShotPills.tsx
  HoleHeader.tsx
  CompletedHoleReview.tsx
  ActiveShotForm.tsx
  ClubSelection.tsx
  PuttDetails.tsx
  ShotResultGrid.tsx
  MissDirectionPanel.tsx
  DistanceInput.tsx
  NextShotButton.tsx
  ActionRow.tsx
  CourseSidebar.tsx
  PenaltyModal.tsx
  EditShotModal.tsx
```

The old `src/components/golf/ShotTrackingComprehensive.tsx` becomes a thin
re-export pointing to `src/components/golf/shot-tracking/index.ts` so that
every existing import path (`@/components/golf/ShotTrackingComprehensive`)
continues to work with zero consumer changes.

### Trade-offs

| Decision | Rationale |
|---|---|
| Props over Context | Only one level of nesting in most cases; context adds indirection for no real depth benefit. If the orchestrator grows a second level of nesting (e.g. ActiveShotForm -> DistanceInput), that is still only one hop. |
| Keeping `dispatch` in some props | Several sub-components (MissDirectionPanel, DistanceInput, EditShotModal) dispatch multiple distinct action types. Wrapping every action in a callback would produce excessive callback props. Passing dispatch keeps the API tight. |
| Keeping `handleNextShot` in orchestrator | It references `isProcessingShotRef`, `shotHistory`, six+ state fields, `completeHole`, `onSaveShot`, and calls `dispatch` twice. Moving it to a hook would require forwarding many refs. Better to leave it and pass a bound `onNextShot` to <NextShotButton>. |
| Not splitting Scorecard further | The front-9 and back-9 loops are identical aside from indices. A `HoleCell` component could DRY them, but the cells are only ~25 lines each and the duplication is trivially template-level. If the scorecard ever needs a row-per-stat layout, revisit. |
| EditShotModal stays large (~250 lines) | The modal form has conditional sections (penalty vs non-penalty, per-shot-type fields). Splitting further would create 5+ tiny components with heavy prop threading for marginal readability gain. If the form grows, extract `EditShotPenaltyForm` and `EditShotRegularForm`. |

### Migration strategy

1. **Create the `shot-tracking/` directory.** Move the existing file into it as-is, renamed to `ShotTrackingComprehensive.tsx`. Add the re-export `index.ts`.
2. **Extract leaf-first.** Start with components that have no children:
   `NextShotButton`, `ClubSelection`, `PuttDetails`, `ShotPills`. These are
   pure presentational. Each extraction is a standalone PR that can be tested
   independently.
3. **Extract the two modals** (`PenaltyModal`, `EditShotModal`). These are
   self-contained overlays with clear open/close boundaries.
4. **Extract the scorecard, header, and sidebar.** These are read-heavy
   (display-only) but large.
5. **Extract the remaining active-shot form components** (`ShotResultGrid`,
   `MissDirectionPanel`, `DistanceInput`, `ActionRow`), then wrap them in
   `ActiveShotForm`.
6. **Final cleanup:** remove dead inline JSX from orchestrator, verify
   `calculateHoleStats` export still works, run full typecheck.

Each step should leave the component functional -- never break the build
mid-extraction.

---

## Part 2: Extracting `useRoundPersistence` (P1 #35)

### Current duplication

`new-round-client.tsx` (1,671 lines) and `continue-round-client.tsx` (525
lines) share four nearly-identical pieces of logic:

| Function | What it does | Lines (new) | Lines (continue) |
|---|---|---|---|
| `buildPartialRoundData` | Assembles the payload for `savePartialRound()` from setup data, completed stats, in-progress shots, and hole configs | 528-563 | 87-123 |
| `handleHoleComplete` | Updates holes + stats state, removes from in-progress map, fires background server save, advances to next hole or submits | 566-629 | 125-186 |
| `handleAutoSave` | Syncs in-progress shots to parent state, schedules draft save, fires background server save | 664-736 | 215-293 |
| `handleRoundSubmit` | Guards against double-submit, builds final round payload, calls `submitGolfRoundComprehensive`, handles success/error | 738-781 | 295-340 |

Additionally, both files maintain the same set of refs (`serverSaveInProgressRef`, `consecutiveSaveFailuresRef`, `isSubmittingRef`) and state (`holes`, `completedHoleStats`, `currentHoleIndex`, `inProgressShotsByHole`, `error`).

### Key differences between new and continue

| Aspect | new-round-client | continue-round-client |
|---|---|---|
| Round ID | Starts as `null`, assigned on first `savePartialRound` success | Provided as prop from day one |
| Setup data | Editable form state (`setupData`) | Frozen props (from server) |
| Qualifier info | `selectedQualifierId`, `selectedRoundNumber` from state | `setupData.qualifierId`, `setupData.qualifierRoundNumber` from props |
| Draft system | Uses `useAutoSaveRound` hook (database drafts + `clearDraft`/`loadDraft`) | Uses `useOfflineSync` hook (IndexedDB) |
| After completion | Calls `clearDraft()` then navigates | Calls `deleteOfflineRound(roundId)` then navigates |
| Last hole behavior | Immediately submits | Shows finish-confirmation modal, then submits |
| Online check | `navigator.onLine` | `offlineSyncState.isOnline` |

### Proposed `useRoundPersistence` API

```ts
// src/hooks/golf/use-round-persistence.ts

interface UseRoundPersistenceConfig {
  // Identity
  roundId: string | null;                         // null for new rounds
  onRoundIdAssigned?: (id: string) => void;       // called when first save returns an ID

  // Round metadata (read-only by the hook)
  setupData: RoundSetupData;                      // shared type for course + round info
  holes: RoundHole[];                             // current hole definitions

  // Qualifier info (already baked into setupData for continue)
  qualifierId?: string | null;
  qualifierRoundNumber?: number | null;

  // Callbacks
  onAllHolesComplete: (stats: HoleStats[]) => void | Promise<void>;
  //   new-round:      calls handleRoundSubmit directly
  //   continue-round: shows confirmation modal, then calls handleRoundSubmit
  onSaveFailure?: (consecutiveFailures: number) => void;
  onCleanup?: () => void | Promise<void>;         // draft/offline cleanup after submission

  // Draft integration (optional -- only new-round uses it)
  scheduleDraftSave?: (data: RoundDraftData) => void;
}

interface UseRoundPersistenceReturn {
  // State (owned by the hook)
  holes: RoundHole[];
  setHoles: Dispatch<SetStateAction<RoundHole[]>>;
  completedHoleStats: HoleStats[];
  currentHoleIndex: number;
  setCurrentHoleIndex: Dispatch<SetStateAction<number>>;
  inProgressShotsByHole: Record<number, ShotRecord[]>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  isSubmitting: boolean;
  savedRoundId: string | null;

  // Handlers (ready to wire into ShotTrackingComprehensive props)
  handleHoleComplete: (holeIndex: number, stats: HoleStats) => Promise<void>;
  handleHoleStatsUpdate: (holeIndex: number, stats: HoleStats) => void;
  handleSaveShot: (shot: ShotRecord) => void;
  handleAutoSave: (shots: ShotRecord[], holeIndex: number) => Promise<void>;
  handleRoundSubmit: (allStats: HoleStats[]) => Promise<void>;
  handleSaveForLater: () => Promise<void>;
  handleDeleteRound: () => Promise<void>;

  // Derived
  buildPartialRoundData: (
    overrideStats?: HoleStats[],
    overrideCurrentHole?: number,
    overrideInProgress?: Record<number, ShotRecord[]>,
  ) => PartialRoundPayload;
  activeHoleShots: ShotRecord[];
  activeShotNumber: number;
}
```

### What goes in the hook vs what stays in the components

**Inside `useRoundPersistence`:**

- All state: `holes`, `completedHoleStats`, `currentHoleIndex`, `inProgressShotsByHole`, `error`, `savedRoundId`.
- All refs: `serverSaveInProgressRef`, `consecutiveSaveFailuresRef`, `isSubmittingRef`, `savedRoundIdRef`.
- `buildPartialRoundData` -- parameterized by `setupData` from config.
- `handleHoleComplete` -- the core logic is identical; the only difference is last-hole behavior, which is delegated to `onAllHolesComplete`.
- `handleHoleStatsUpdate` -- identical in both files.
- `handleSaveShot` -- identical in both files.
- `handleAutoSave` -- the "sync in-progress shots + background server save" pattern is identical. The draft/offline specifics are injected via `scheduleDraftSave` (new-round) or handled externally (continue-round can call its own IndexedDB logic inside the callback).
- `handleRoundSubmit` -- identical structure; qualifier fields come from config.
- `handleSaveForLater` -- calls `savePartialRound` + navigates.
- `handleDeleteRound` -- calls `deleteInProgressRound` + `onCleanup` + navigates.

**Stays in `new-round-client.tsx`:**

- The multi-step wizard (`step` state: setup -> holes -> tracking -> submitting).
- Setup form state (`setupData`, `holesPerRound`, course selection, qualifier selection).
- Draft checking/loading/clearing (calls into `useAutoSaveRound`).
- Offline sync engine initialization.
- The `onAllHolesComplete` callback: `(stats) => handleRoundSubmit(stats)`.
- All setup/holes-configuration-step UI.

**Stays in `continue-round-client.tsx`:**

- The `useOfflineSync` hook and its IndexedDB calls.
- The finish-confirmation modal state (`showFinishConfirm`, `pendingFinalStats`).
- The `onAllHolesComplete` callback: `(stats) => { setPendingFinalStats(stats); setShowFinishConfirm(true); }`.
- The "Continuing Round" header banner.

### Handling the `handleAutoSave` divergence

The two components differ in what they do *besides* the common server-save:

- **new-round:** calls `scheduleSave(draftData)` for database-backed draft persistence.
- **continue-round:** calls `offlineSyncActions.saveRoundOffline(...)` and `offlineSyncActions.queueShot(...)` for IndexedDB.

**Solution:** The hook accepts an optional `onShotsChanged` callback that fires after the in-progress state is updated and the background server save is triggered. Each consumer provides its own implementation:

```ts
// new-round-client.tsx
const onShotsChanged = useCallback(async (shots, holeIndex, allInProgress) => {
  scheduleSave({
    step, setupData, holes, completedHoleStats,
    currentHoleIndex: holeIndex,
    selectedQualifierId, selectedRoundNumber,
    inProgressShots: { [holeIndex]: shots },
  });
  await useOfflineSyncStore.getState().updatePendingCount();
}, [...]);

// continue-round-client.tsx
const onShotsChanged = useCallback(async (shots, holeIndex, allInProgress) => {
  if (offlineSyncState.isIndexedDBReady) {
    await offlineSyncActions.saveRoundOffline(roundId, '', { ... });
  }
  if (!offlineSyncState.isOnline && offlineSyncState.isIndexedDBReady) {
    for (const shot of shots) {
      await offlineSyncActions.queueShot(shot, roundId, ...);
    }
  }
}, [...]);
```

### Shared types

```ts
// src/lib/types/round-persistence.ts (new file)

export interface RoundSetupData {
  courseName: string;
  courseCity: string;
  courseState: string;
  courseRating: string;
  courseSlope: string;
  teesPlayed: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
  qualifierId?: string;
  qualifierRoundNumber?: number;
}

export interface PartialRoundPayload {
  courseName: string;
  courseCity?: string;
  courseState?: string;
  courseRating?: number;
  courseSlope?: number;
  teesPlayed?: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
  qualifierId?: string;
  currentHole: number;
  holesToPlay: 9 | 18;
  holes: HoleStats[];
  inProgressShots: { holeNumber: number; shots: ShotRecord[] }[];
  holeConfigs: { holeNumber: number; par: number; yardage: number }[];
}
```

Note that `new-round-client.tsx` currently defines its own `RoundSetupForm`
interface (without `qualifierId`/`qualifierRoundNumber`), while
`continue-round-client.tsx` defines `RoundSetupData` (with those fields).
Unifying to a single `RoundSetupData` type that always includes the optional
qualifier fields eliminates the divergence.

### Trade-offs

| Decision | Rationale |
|---|---|
| Hook owns the state | Both components declare the same 6+ `useState` calls. Centralizing them eliminates redundancy and prevents drift. The trade-off is that the hook's return object is large, but it replaces 6 individual `useState` calls per consumer, which is a net improvement. |
| `onAllHolesComplete` callback for last-hole behavior | The new-round flow auto-submits; continue-round shows a modal. Rather than branching inside the hook, we let the consumer decide. This keeps the hook behavior-agnostic. |
| `onShotsChanged` for draft/offline divergence | The alternative is to have the hook accept both `scheduleDraftSave` and `offlineSyncActions` and branch internally. That couples the hook to two unrelated persistence mechanisms. The callback approach is cleaner. |
| Router stays in the components | `handleSaveForLater` and `handleDeleteRound` call `router.push()`. The hook could accept an `onNavigate` callback, but since the components already have `useRouter`, it is simpler for the hook to return state and let the component handle navigation after calling the handler. **Revised design:** The hook returns the handler as a promise; the component awaits it and then navigates. |
| Not merging the two client files | They serve fundamentally different entry points (new round wizard vs resume flow) with different UI. Sharing logic via a hook is the right abstraction -- merging them into one "smart" component would reintroduce the monolith problem. |

### Migration strategy

1. **Create `RoundSetupData` type** in `src/lib/types/round-persistence.ts`. Update both client files to import it.
2. **Extract `buildPartialRoundData` as a pure function** into a shared utility (e.g., `src/lib/utils/round-persistence.ts`). Both clients call it -- verify type compatibility.
3. **Build `useRoundPersistence`** hook with state, refs, and `handleHoleComplete` / `handleHoleStatsUpdate` / `handleSaveShot`. Initially have both clients call the hook but keep their old handlers as fallbacks, gated behind a feature flag or commented out.
4. **Move `handleAutoSave` into the hook** with the `onShotsChanged` callback pattern.
5. **Move `handleRoundSubmit`, `handleSaveForLater`, `handleDeleteRound`** into the hook.
6. **Delete the duplicated code** from both client files. Each file should shrink to its unique concerns (wizard UI, draft modal, offline sync UI, confirmation modal).
7. **Verify** with `npm run typecheck` and manual testing of both flows (new round end-to-end, continue round end-to-end).

### Expected line-count reduction

| File | Before | After (estimated) |
|---|---|---|
| `new-round-client.tsx` | ~1,671 | ~1,050 (setup wizard UI stays, all persistence logic removed) |
| `continue-round-client.tsx` | ~525 | ~200 (header + finish modal + offline indicators) |
| `use-round-persistence.ts` (new) | 0 | ~300 |
| `round-persistence.ts` types (new) | 0 | ~40 |
| **Net** | 2,196 | ~1,590 (28% reduction + zero duplication of critical save logic) |

---

## Execution order

Both refactors are independent and can be done in parallel. However, if
sequencing is required:

1. **Do Part 2 first** (hook extraction). It is higher-risk because it touches
   data persistence logic that, if broken, causes data loss. Extracting it into
   a single hook makes it easier to test and audit. The component decomposition
   (Part 1) is purely cosmetic and lower-risk.
2. **Do Part 1 second.** The sub-component extraction can be done leaf-first
   across multiple small PRs with no functional changes.
