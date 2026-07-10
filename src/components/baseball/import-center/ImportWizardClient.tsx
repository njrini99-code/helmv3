'use client';

// =============================================================================
// src/components/baseball/import-center/ImportWizardClient.tsx
//
// Wave 6 / packet: source-registry. The Import Center wizard:
//   choose -> upload -> detect -> map -> match -> preview -> validate -> commit
//
// Step 1 "What are you uploading?" drives the column template, target table,
// and dedup key for the three data shapes:
//   - season_totals  → baseball_player_season_stats  (dedup: player_id + season_year)
//   - game_box_score → baseball_box_score_batting/pitching + baseball_games
//                      (dedup: player_id + game_id)
//   - event_log      → routes to EventImportWizard, which writes to the
//                      per-grain event tables (baseball_pitch_events /
//                      baseball_batted_ball_events / baseball_swing_events
//                      via GRAIN_TO_TABLE) (dedup: source_external_id [+ game_id])
//
// The "event_log" shape has a dedicated advanced wizard (EventImportWizard via
// the "Event level" tab in ImportCenterShell). Selecting it here routes the
// coach there with a clear explanation rather than dead-ending.
//
// LIVING ANNUAL PRESENTATION — every step lives on a PaperCard; severity
// (blocking / warning / info) reads through InkBadge tone+variant (sodium
// solid = blocking, sodium soft = warning, neutral = info) instead of a
// yellow/amber/red box; the step transition runs on the kit's `<Reveal>`
// (Stage-0 interaction layer) instead of a hand-rolled framer-motion fade;
// zero/empty states (no rows to match, no import history) render through
// `<EditorsLetter>`. Presentation only — every server action, validation
// pass, and dedup/duplicate-verdict computation below is UNCHANGED from the
// prior surface; adapter wiring is untouched.
// =============================================================================

import { useCallback, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/fairway';
import { NativeSelect } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DatelineRule } from '@/components/ui/card';
import { useToast } from '@/components/ui/sonner';
import { IconWarning } from '@/components/icons';

import {
  PaperCard,
  SectionMasthead,
  Eyebrow,
  HairlineRule,
  InkBadge,
  KPIContentsStrip,
  EditorsLetter,
  Reveal,
  pressableClass,
} from '@/components/baseball/living-annual';

import { cn } from '@/lib/utils';

import { BASEBALL_IMPORT_SOURCES } from '@/lib/baseball/import-matching';
import { applyManualMatch, describeMatchablePlayer } from '@/lib/baseball/import-matching';
import type { MatchablePlayer } from '@/lib/baseball/import-matching';
import type { RegisteredSourceOption } from '@/components/baseball/import-center/ImportCenterShell';
import {
  validateImportRows,
  type ImportValidationReport,
  type ImportValidationIssue,
  type ImportSeverity,
} from '@/lib/baseball/csv-utils';
import {
  previewImport,
  commitImport,
  rollbackImport,
  reviewImportRun,
  getImportRunFileUrl,
  type ImportPreview,
  type CommitImportResult,
} from '@/app/baseball/actions/imports';
import type {
  BaseballImportRunRow,
  BaseballImportRowMatch,
  BaseballImportMatchTier,
  BaseballImportRowDuplicate,
  BaseballImportDuplicateVerdict,
} from '@/lib/types/baseball-imports';
import { isBinaryFileName } from '@/lib/baseball/adapters/import-file-body';
import { xlsxToCsv } from '@/lib/baseball/adapters/xlsx-reader';

// -----------------------------------------------------------------------------
// DATA SHAPE — drives column template, target table, dedup key.
// -----------------------------------------------------------------------------

/**
 * The three import data shapes the wizard handles.
 *
 * `season_totals`  — one row per player for the full season.
 *                    Target: baseball_player_season_stats
 *                    Dedup key: player_id + season_year
 *
 * `game_box_score` — one row per player per game (batting / pitching lines).
 *                    Target: baseball_box_score_batting / baseball_box_score_pitching
 *                    + baseball_games if a new game needs to be created.
 *                    Dedup key: player_id + game_id
 *
 * `event_log`      — pitch / batted-ball / swing events (sensor/video granularity).
 *                    Target: the elite event tables (baseball_pitch_events /
 *                    baseball_batted_ball_events / baseball_swing_events).
 *                    Dedup key: source_external_id [+ game_id]
 *                    NOTE: the dedicated EventImportWizard (Event-level tab in
 *                    ImportCenterShell) is the correct entry point for this shape —
 *                    it owns the actual write to those tables. Selecting it here
 *                    shows a redirect card instead of duplicating the
 *                    event-import pipeline.
 */
export type ImportDataShape = 'season_totals' | 'game_box_score' | 'event_log';

interface DataShapeMeta {
  shape: ImportDataShape;
  label: string;
  subtitle: string;
  targetTable: string;
  dedupKey: string;
  columnTemplate: string[];
  sessionTypeLabel: string;
  /** When true, this shape is handled by a different wizard — show redirect. */
  redirectToEventLevel?: boolean;
}

export const DATA_SHAPE_META: Record<ImportDataShape, DataShapeMeta> = {
  season_totals: {
    shape: 'season_totals',
    label: 'Season totals',
    subtitle: 'One row per player — cumulative stats for the whole season.',
    targetTable: 'baseball_player_season_stats',
    dedupKey: 'player_id + season_year',
    columnTemplate: [
      'player', 'g', 'ab', 'r', 'h', '2b', '3b', 'hr', 'rbi', 'bb', 'k', 'sb', 'avg',
      'ip', 'er', 'era', 'k_thrown', 'bb_allowed', 'w', 'l', 'sv',
    ],
    sessionTypeLabel: 'Season year',
  },
  game_box_score: {
    shape: 'game_box_score',
    label: 'Game box score',
    subtitle: 'One row per player per game — batting and/or pitching lines.',
    targetTable: 'baseball_box_score_batting / baseball_box_score_pitching',
    dedupKey: 'player_id + game_id',
    columnTemplate: [
      'player', 'ab', 'r', 'h', '2b', '3b', 'hr', 'rbi', 'bb', 'k', 'sb', 'lob',
      'ip', 'er', 'k_thrown', 'bb_allowed', 'result',
    ],
    sessionTypeLabel: 'Game date',
  },
  event_log: {
    shape: 'event_log',
    label: 'Event log',
    subtitle: 'Pitch-by-pitch or swing events from a sensor or tracking platform.',
    // NOTE: no '/' in this string — the tile render below treats a '/' as the
    // two-table (batting/pitching) case and appends a hardcoded second box.
    targetTable: 'baseball_pitch_events (+ event tables)',
    dedupKey: 'source_external_id + game_id',
    columnTemplate: [
      'player', 'stat_key', 'stat_value', 'game_id', 'period_type', 'period_start', 'period_end',
    ],
    sessionTypeLabel: 'Session date',
    redirectToEventLevel: true,
  },
};

// -----------------------------------------------------------------------------

// The wizard receives the SAME shape the matcher uses (id/name + the tier-3
// disambiguation signals jersey/grad_year/primary_position), so the manual-match
// dropdown can show jersey/class/position to help a coach resolve same-name rows.
type RosterPlayer = MatchablePlayer;

interface Props {
  teamId: string;
  teamName: string;
  players: RosterPlayer[];
  recentRuns: BaseballImportRunRow[];
  /**
   * Box-score source options = hardcoded adapter defaults MERGED with the team's
   * registered import-source policy. Falls back to the adapter defaults when the
   * team has registered nothing (so the picker is never empty).
   */
  registeredSources?: RegisteredSourceOption[];
  /**
   * When false the internal header is suppressed.
   * Pass false when rendering inside a shell that already renders its own header
   * (ImportCenterShell) to avoid two stacked "Import Center" headings.
   * Defaults to true so standalone usages keep their header.
   */
  showHeader?: boolean;
  /**
   * Called when the coach selects "Event log" in the data-shape chooser.
   * The shell intercepts this to switch to the "Event level" wizard tab.
   */
  onRequestEventLevel?: () => void;
}

const TRUST_LABEL: Record<string, string> = {
  official: 'Official',
  device_export: 'Device export',
  staff_entered: 'Staff entered',
  player_entered: 'Player entered',
  ai_derived: 'AI derived',
  unreviewed: 'Unreviewed',
};

type WizardStep =
  | 'choose'
  | 'upload'
  | 'detect'
  | 'map'
  | 'match'
  | 'preview'
  | 'committing'
  | 'done';

// Steps shown in the stepper (choose is pre-stepper; committing is internal).
const VISIBLE_STEP_ORDER: WizardStep[] = [
  'upload',
  'detect',
  'map',
  'match',
  'preview',
  'done',
];

const STEP_LABELS: Record<WizardStep, string> = {
  choose: 'Choose',
  upload: 'Upload',
  detect: 'Detect',
  map: 'Map',
  match: 'Match',
  preview: 'Preview',
  committing: 'Commit',
  done: 'Done',
};

const STAT_TYPES = [
  { value: 'game', label: 'Game' },
  { value: 'practice', label: 'Practice' },
  { value: 'other', label: 'Other' },
] as const;

// -----------------------------------------------------------------------------

export function ImportWizardClient({
  teamId,
  teamName,
  players,
  recentRuns,
  registeredSources,
  showHeader = true,
  onRequestEventLevel,
}: Props) {
  const { addToast } = useToast();

  // Source picker options: registered (merged) sources when provided, else the
  // hardcoded adapter defaults. The picker `value` is the key the commit path
  // resolves the registry policy on.
  const sourceOptions: RegisteredSourceOption[] = useMemo(
    () =>
      registeredSources && registeredSources.length > 0
        ? registeredSources
        : BASEBALL_IMPORT_SOURCES.map((s) => ({
            value: s.id,
            label: s.label,
            registered: false,
            trustLevel: null,
            requiredReview: null,
          })),
    [registeredSources]
  );

  const [step, setStep] = useState<WizardStep>('choose');
  const [dataShape, setDataShape] = useState<ImportDataShape>('game_box_score');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceId, setSourceId] = useState<string>('generic_csv');
  const [fileName, setFileName] = useState<string>('');
  const [csvContent, setCsvContent] = useState<string>('');
  const [statType, setStatType] = useState<'game' | 'practice' | 'other'>('game');
  const [sessionDate, setSessionDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [sessionName, setSessionName] = useState<string>('');

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [matches, setMatches] = useState<BaseballImportRowMatch[]>([]);
  const [result, setResult] = useState<CommitImportResult | null>(null);
  const [runs, setRuns] = useState<BaseballImportRunRow[]>(recentRuns);
  /** Coach explicitly acknowledged the (non-blocking) warnings before commit. */
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);
  /**
   * GAP 2 — coach acknowledged that this exact file was already imported and chose
   * to re-import it anyway (force past the duplicate short-circuit).
   */
  const [forceReimport, setForceReimport] = useState(false);
  /** The prior run a duplicate file resolved to, surfaced as a skip-or-force card. */
  const [duplicateFileRun, setDuplicateFileRun] = useState<{
    runId: string;
    committedAt: string | null;
  } | null>(null);

  // ---- step 1: file selection ------------------------------------------------
  // The box-score path stores a CSV string the server parses. A workbook (.xlsx)
  // is decoded to CSV right here (the reader is pure + client-safe) so the entire
  // server path stays unchanged; PDFs are not supported in the flat box-score path
  // (they route to the event-level / manual flow), so we reject them with guidance.
  const onFile = useCallback((file: File) => {
    setError(null);
    if (/\.pdf$/i.test(file.name)) {
      setError(
        'PDF box scores can’t be imported as a flat file. Re-export as CSV/XLSX, or type the lines into the manual box-score entry.',
      );
      return;
    }
    if (isBinaryFileName(file.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        const buf = reader.result as ArrayBuffer | null;
        if (!buf) {
          setError('Could not read that workbook.');
          return;
        }
        const { csv, warnings } = xlsxToCsv(new Uint8Array(buf));
        if (!csv.trim()) {
          setError(warnings[0] ?? 'That workbook had no readable rows.');
          return;
        }
        setCsvContent(csv);
        setFileName(file.name);
      };
      reader.onerror = () => setError('Could not read that workbook.');
      reader.readAsArrayBuffer(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCsvContent(String(reader.result ?? ''));
      setFileName(file.name);
    };
    reader.onerror = () => setError('Could not read that file. Try a plain CSV.');
    reader.readAsText(file);
  }, []);

  // ---- run preview (detect + map + match) ------------------------------------
  const runPreview = useCallback(async () => {
    if (!csvContent.trim()) {
      setError('Add a CSV file before continuing.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Pass the targeted grain so the preview can detect EXISTING rows and return
      // the per-row create/update/skip verdict BEFORE commit (duplicate_resolution_v2.md).
      const result = await previewImport({
        teamId,
        sourceId,
        csvContent,
        statType,
        sessionDate,
      });
      if (result.totalRows === 0) {
        setError('No data rows found in that file.');
        setBusy(false);
        return;
      }
      setPreview(result);
      setMatches(result.matches);
      setStep('detect');
    } catch {
      setError('We could not analyze that file. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [csvContent, sourceId, teamId, statType, sessionDate]);

  // ---- per-row manual match override -----------------------------------------
  const setRowPlayer = useCallback(
    (rowIndex: number, playerId: string | null) => {
      setMatches((prev) =>
        prev.map((m) =>
          m.rowIndex === rowIndex ? applyManualMatch(m, playerId, players) : m
        )
      );
    },
    [players]
  );

  const setRowAction = useCallback(
    (rowIndex: number, action: BaseballImportRowMatch['action']) => {
      setMatches((prev) =>
        prev.map((m) => (m.rowIndex === rowIndex ? { ...m, action } : m))
      );
    },
    []
  );

  const selectedSourceOption = useMemo(
    () => sourceOptions.find((s) => s.value === sourceId) ?? null,
    [sourceOptions, sourceId]
  );

  const counts = useMemo(() => {
    const matched = matches.filter((m) => m.playerId && m.action !== 'skip').length;
    const create = matches.filter((m) => m.action === 'create' && m.playerId).length;
    const update = matches.filter((m) => m.action === 'update' && m.playerId).length;
    const skip = matches.length - create - update;
    return { matched, create, update, skip, total: matches.length };
  }, [matches]);

  // DUPLICATE / RE-IMPORT VERDICTS (duplicate_resolution_v2.md). The server
  // computed, per resolved row, whether commit will create a NEW record, OVERWRITE
  // an existing one (with the changed-field diff), or be an EXACT re-import. Index
  // them by rowIndex so the Match + Preview steps can show the decision per row
  // and so the coach's explicit Create/Update choice can be checked against it.
  const verdictByRow = useMemo(() => {
    const map = new Map<number, BaseballImportRowDuplicate>();
    for (const d of preview?.duplicates ?? []) map.set(d.rowIndex, d);
    return map;
  }, [preview]);

  // Resolve the LIVE verdict for a row: a verdict the server computed against a
  // player the coach has since RE-MATCHED to someone else is stale, so we drop it
  // (treating the row as "new/unknown") rather than mislabel its commit decision.
  // The server re-detects duplicates at commit, so the labels stay honest even
  // when a manual re-match outruns the preview verdict.
  const liveVerdict = useCallback(
    (m: BaseballImportRowMatch): BaseballImportRowDuplicate | undefined => {
      const d = verdictByRow.get(m.rowIndex);
      if (!d) return undefined;
      if (d.playerId !== m.playerId) return undefined;
      return d;
    },
    [verdictByRow]
  );

  const dupSummary = useMemo(() => {
    let willCreate = 0;
    let willUpdate = 0;
    let exactDuplicate = 0;
    // A 'Create' the coach set on a row that already has an existing record — this
    // WILL be rejected server-side (the labels are now load-bearing), so surface it
    // pre-commit as a conflict the coach must resolve.
    const createConflictRows: number[] = [];
    for (const m of matches) {
      if (!m.playerId || m.action === 'skip') continue;
      const v = liveVerdict(m)?.verdict ?? 'new';
      if (v === 'exact_duplicate') exactDuplicate += 1;
      else if (v === 'will_update') willUpdate += 1;
      else willCreate += 1;
      if (m.action === 'create' && (v === 'will_update' || v === 'exact_duplicate'))
        createConflictRows.push(m.rowIndex);
    }
    return { willCreate, willUpdate, exactDuplicate, createConflictRows };
  }, [matches, liveVerdict]);

  // A coach 'Create' that collides with an existing record is a hard conflict —
  // the server rejects it, so block the commit until it's resolved (switch to
  // Update, or roll back the owning run). This makes the labels honest in the UI.
  const hasCreateConflicts = dupSummary.createConflictRows.length > 0;

  // ---- LIVE VALIDATION -------------------------------------------------------
  // Re-run the IDENTICAL pure VALIDATE pass the server uses, against the CURRENT
  // matches (so every manual override / skip instantly re-grades the report).
  // The commit is hard-gated on blockers; warnings require explicit ack. The
  // server re-validates and refuses blockers regardless of what the client sent.
  const validation: ImportValidationReport = useMemo(() => {
    if (!preview) {
      return {
        issues: [],
        blockingCount: 0,
        warningCount: 0,
        infoCount: 0,
        blockingRowIndices: [],
        hasBlockers: false,
        hasWarnings: false,
      };
    }
    return validateImportRows({
      rows: preview.rows,
      mapping: preview.mapping,
      headers: preview.headers,
      matches: matches.map((m) => ({
        rowIndex: m.rowIndex,
        playerId: m.playerId,
        action: m.action,
        sourceName: m.sourceName,
      })),
    });
  }, [preview, matches]);

  // Any edit invalidates a prior warning acknowledgement (must re-confirm the
  // CURRENT set of warnings, never a stale one).
  const validationFingerprint = `${validation.blockingCount}:${validation.warningCount}`;
  const lastFingerprintRef = useRef(validationFingerprint);
  if (lastFingerprintRef.current !== validationFingerprint) {
    lastFingerprintRef.current = validationFingerprint;
    if (warningsAcknowledged) setWarningsAcknowledged(false);
  }

  const commitDisabled =
    busy ||
    counts.create + counts.update === 0 ||
    validation.hasBlockers ||
    hasCreateConflicts ||
    (validation.hasWarnings && !warningsAcknowledged);

  // ---- commit ----------------------------------------------------------------
  const doCommit = useCallback(async () => {
    if (!preview) return;
    // Client-side blocker guard (the button is already disabled; this is a
    // last-line check so a stale handler can never fire a blocked commit). The
    // server re-validates and refuses blockers regardless — this just keeps the
    // UI honest and surfaces a friendly message instead of a thrown error.
    if (validation.hasBlockers) {
      setError(
        `Resolve the ${validation.blockingCount} blocking issue${
          validation.blockingCount === 1 ? '' : 's'
        } before committing.`,
      );
      return;
    }
    // A coach 'Create' that collides with an existing record is rejected server-
    // side; bail with a friendly message rather than committing a partial run.
    if (hasCreateConflicts) {
      setError(
        `${dupSummary.createConflictRows.length} row${
          dupSummary.createConflictRows.length === 1 ? '' : 's'
        } set to Create already exist. Switch them to Update, or roll back the existing import first.`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    setStep('committing');
    try {
      const res = await commitImport({
        teamId,
        sourceId,
        fileName: fileName || `import_${Date.now()}.csv`,
        statType,
        sessionDate,
        sessionName: sessionName || undefined,
        headers: preview.headers,
        mapping: preview.mapping,
        rows: preview.rows,
        matches,
        // ISSUE #379 — tells the server which canonical table (box-score RPC vs
        // baseball_player_season_stats) this commit ALSO writes to, so Stats
        // Center reflects the import instead of only the legacy stat row.
        dataShape,
        // GAP 1 + GAP 2 — hand the server the ORIGINAL file body so it preserves
        // the source-of-truth file + fingerprints it for the duplicate guard.
        rawFileBody: csvContent || undefined,
        forceReimport,
      });
      // GAP 2 — the server short-circuited an EXACT-duplicate file. Surface the
      // skip-or-force card and do not advance to the done step.
      if (res.duplicateFileRun) {
        setDuplicateFileRun(res.duplicateFileRun);
        setStep('preview');
        setBusy(false);
        return;
      }
      setResult(res);
      setStep('done');
      if (res.heldForReview) {
        addToast({
          type: 'success',
          title: 'Sent for review',
          description:
            'This source requires review — nothing was written yet. A coach must approve it from Recent imports.',
        });
      } else {
        const dupNote = res.duplicatesSkipped > 0 ? ` · ${res.duplicatesSkipped} duplicate` : '';
        const conflictNote =
          res.createConflicts > 0 ? ` · ${res.createConflicts} create conflict` : '';
        addToast({
          type: res.createConflicts > 0 ? 'warning' : 'success',
          title: 'Import committed',
          description: `${res.created} created · ${res.updated} updated · ${res.skipped} skipped${dupNote}${conflictNote}`,
        });
      }
    } catch {
      setError('The import could not be committed. No changes were saved if it failed early.');
      setStep('preview');
    } finally {
      setBusy(false);
    }
  }, [
    preview,
    teamId,
    sourceId,
    fileName,
    statType,
    sessionDate,
    sessionName,
    matches,
    dataShape,
    addToast,
    validation,
    hasCreateConflicts,
    dupSummary,
    csvContent,
    forceReimport,
  ]);

  // ---- rollback a run --------------------------------------------------------
  const doRollback = useCallback(
    async (importRunId: string) => {
      setBusy(true);
      try {
        const res = await rollbackImport({ teamId, importRunId });
        setRuns((prev) =>
          prev.map((r) =>
            r.id === importRunId
              ? { ...r, status: 'rolled_back', rolled_back_at: new Date().toISOString() }
              : r
          )
        );
        addToast({
          type: 'success',
          title: 'Import rolled back',
          description: `${res.reverted} removed · ${res.restored} restored`,
        });
      } catch {
        addToast({ type: 'error', title: 'Rollback failed', description: 'Please try again.' });
      } finally {
        setBusy(false);
      }
    },
    [teamId, addToast]
  );

  // ---- GAP 1: download a run's preserved source file -------------------------
  const doDownload = useCallback(
    async (importRunId: string) => {
      try {
        const { url } = await getImportRunFileUrl({ teamId, importRunId });
        if (!url) {
          addToast({
            type: 'info',
            title: 'No source file',
            description: 'This run was imported before source files were preserved.',
          });
          return;
        }
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch {
        addToast({ type: 'error', title: 'Download failed', description: 'Please try again.' });
      }
    },
    [teamId, addToast]
  );

  // ---- approve / reject a run held by required_review ------------------------
  const doReview = useCallback(
    async (importRunId: string, decision: 'approve' | 'reject') => {
      setBusy(true);
      try {
        const res = await reviewImportRun({ teamId, importRunId, decision });
        setRuns((prev) =>
          prev.map((r) =>
            r.id === importRunId
              ? {
                  ...r,
                  status: decision === 'approve' ? 'committed' : 'failed',
                  review_state: decision === 'approve' ? 'approved' : 'rejected',
                }
              : r
          )
        );
        addToast({
          type: 'success',
          title: decision === 'approve' ? 'Import approved' : 'Import rejected',
          description:
            decision === 'approve'
              ? `${res.created} created · ${res.updated} updated`
              : 'No rows were written.',
        });
      } catch {
        addToast({
          type: 'error',
          title: 'Review failed',
          description: 'Please try again.',
        });
      } finally {
        setBusy(false);
      }
    },
    [teamId, addToast]
  );

  const resetWizard = useCallback(() => {
    setStep('choose');
    setDataShape('game_box_score');
    setPreview(null);
    setMatches([]);
    setResult(null);
    setCsvContent('');
    setFileName('');
    setError(null);
    setWarningsAcknowledged(false);
  }, []);

  // ---- render ----------------------------------------------------------------
  // 'choose' and 'committing' are not in the visible stepper.
  const stepperStep = step === 'choose' || step === 'committing' ? null : step;
  const activeStepIdx = stepperStep ? VISIBLE_STEP_ORDER.indexOf(stepperStep) : -1;

  const shapeMeta = DATA_SHAPE_META[dataShape];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 py-8">
      {showHeader && (
        <Reveal>
          <SectionMasthead eyebrow="THE PRESSBOX · IMPORT CENTER" title="Import Center" ink="team">
            <p className="max-w-2xl font-annual text-body-lg leading-relaxed text-text-secondary">
              Bring stats into <span className="font-semibold text-text-primary">{teamName}</span> from an
              export. Every import is auditable and can be rolled back.
            </p>
          </SectionMasthead>
        </Reveal>
      )}

      {/* Stepper — hidden on the 'choose' step (pre-wizard selection). */}
      {step !== 'choose' && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Shape badge — shows what the coach chose. */}
          <span className="inline-flex items-center gap-1.5">
            <InkBadge label={shapeMeta.label} tone="team" variant="solid" />
            {/* An icon-only affordance riding beside an InkBadge, not a CTA —
                pressableClass (not <Button>) per the kit's interaction layer. */}
            {/* eslint-disable-next-line helm/no-raw-button */}
            <button
              type="button"
              aria-label="Change data shape"
              onClick={() => { setStep('choose'); setError(null); }}
              className={cn('rounded-full p-1', pressableClass({ ink: 'team' }))}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                width={11}
                height={11}
                fill="currentColor"
                aria-hidden
                className="text-text-tertiary"
              >
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
              </svg>
            </button>
          </span>
          <ol className="flex flex-wrap items-center gap-2" aria-label="Import steps">
            {VISIBLE_STEP_ORDER.map((s) => {
              const idx = VISIBLE_STEP_ORDER.indexOf(s);
              const state =
                idx < activeStepIdx ? 'done' : idx === activeStepIdx ? 'active' : 'upcoming';
              return (
                <li key={s} aria-current={state === 'active' ? 'step' : undefined}>
                  <InkBadge
                    label={STEP_LABELS[s]}
                    tone={state === 'upcoming' ? 'neutral' : 'team'}
                    variant={state === 'active' ? 'solid' : 'soft'}
                  />
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3"
        >
          <InkBadge label="Error" tone="sodium" variant="solid" />
          <p className="text-body-sm text-text-secondary">{error}</p>
        </div>
      )}

      <Reveal key={step}>
        {/* STEP: CHOOSE ---------------------------------------------------- */}
        {step === 'choose' && (
          <div className="space-y-4">
            <div className="mb-2">
              <h2 className="font-annual text-h2 font-semibold text-text-primary">What are you uploading?</h2>
              <p className="mt-1.5 text-body-sm text-text-secondary">
                Choose the data shape that matches your file. Each shape targets a different
                table and dedup model.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.values(DATA_SHAPE_META) as DataShapeMeta[]).map((meta) => (
                // A bespoke Living Annual paper tile, not a CTA — pressableClass
                // (not <Button>) per pressable.ts's "rows, cards, chips, paper
                // tiles" guidance.
                // eslint-disable-next-line helm/no-raw-button
                <button
                  key={meta.shape}
                  type="button"
                  onClick={() => {
                    setDataShape(meta.shape);
                    if (meta.redirectToEventLevel && onRequestEventLevel) {
                      onRequestEventLevel();
                    } else {
                      setStep('upload');
                    }
                  }}
                  aria-pressed={dataShape === meta.shape}
                  className={cn(
                    'flex flex-col items-start gap-2 rounded-card border px-5 py-5 text-left',
                    pressableClass({ ink: 'team', lift: true }),
                    dataShape === meta.shape
                      ? 'border-grade-plus bg-grade-plus/[0.06]'
                      : 'border-[color:var(--hairline)] bg-[var(--paper)]',
                  )}
                >
                  <span className="font-annual text-body-lg font-semibold text-text-primary">{meta.label}</span>
                  <span className="text-body-sm text-text-secondary">{meta.subtitle}</span>
                  <div className="mt-1 space-y-1 text-caption">
                    <span className="flex flex-wrap items-center gap-1.5 text-text-tertiary">
                      <span className="font-medium text-text-secondary">Target</span>
                      <code className="rounded border border-[color:var(--hairline)] px-1 py-0.5 font-mono text-text-secondary">
                        {meta.targetTable.split(' / ')[0]}
                      </code>
                      {meta.targetTable.includes('/') && (
                        <code className="rounded border border-[color:var(--hairline)] px-1 py-0.5 font-mono text-text-secondary">
                          + pitching
                        </code>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5 text-text-tertiary">
                      <span className="font-medium text-text-secondary">Dedup</span>
                      <span>{meta.dedupKey}</span>
                    </span>
                  </div>
                  {meta.redirectToEventLevel && (
                    <InkBadge label="Uses Event-level wizard" tone="neutral" className="mt-1" />
                  )}
                </button>
              ))}
            </div>

            {/* Column template preview — shows expected headers for the chosen shape. */}
            <div className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3">
              <p className="mb-2 text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                Expected columns for{' '}
                <span className="text-text-secondary">{DATA_SHAPE_META[dataShape].label}</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DATA_SHAPE_META[dataShape].columnTemplate.map((col) => (
                  <span
                    key={col}
                    className="rounded border border-[color:var(--hairline)] px-2 py-0.5 font-mono text-caption text-text-secondary"
                  >
                    {col}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-caption text-text-tertiary">
                Your file doesn&apos;t need to match exactly — column headers are mapped
                automatically.
              </p>
            </div>
          </div>
        )}

        {/* STEP: UPLOAD ---------------------------------------------------- */}
        {step === 'upload' && (
          <PaperCard className="space-y-5 px-6 py-6 sm:px-8 sm:py-8">
            {/* Context strip — shape + target table. */}
            <div className="flex flex-wrap items-center gap-2 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3">
              <InkBadge label={shapeMeta.label} tone="team" variant="solid" />
              <span className="text-text-tertiary">·</span>
              <span className="text-caption text-text-secondary">
                Writes to{' '}
                <code className="rounded border border-[color:var(--hairline)] px-1 py-0.5 font-mono text-caption text-text-secondary">
                  {shapeMeta.targetTable.split(' / ')[0]}
                </code>
                {shapeMeta.targetTable.includes('/') && (
                  <>
                    {' '}
                    <code className="rounded border border-[color:var(--hairline)] px-1 py-0.5 font-mono text-caption text-text-secondary">
                      baseball_box_score_pitching
                    </code>
                  </>
                )}
              </span>
              <span className="text-text-tertiary">·</span>
              <span className="text-caption text-text-tertiary">Dedup: {shapeMeta.dedupKey}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <NativeSelect
                  label="Source"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  options={sourceOptions.map((s) => ({
                    value: s.value,
                    label: s.registered ? `${s.label} ✓` : s.label,
                  }))}
                />
                {/* Show the registered policy for the chosen source so the
                    coach sees how it will be governed BEFORE uploading. */}
                {selectedSourceOption?.registered ? (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {selectedSourceOption.trustLevel && (
                      <InkBadge
                        label={TRUST_LABEL[selectedSourceOption.trustLevel] ?? selectedSourceOption.trustLevel}
                        tone="neutral"
                        variant="solid"
                      />
                    )}
                    {selectedSourceOption.requiredReview ? (
                      <InkBadge label="Requires review before commit" tone="sodium" variant="soft" />
                    ) : (
                      <InkBadge label="Auto-commits" tone="team" variant="soft" />
                    )}
                  </p>
                ) : (
                  <p className="mt-1.5 text-caption text-text-tertiary">
                    Not configured — uses default trust (unreviewed) and auto-commits. Register
                    it in Settings → Imports to control trust, review, and matching.
                  </p>
                )}
              </div>
              <NativeSelect
                label="Session type"
                value={statType}
                onChange={(e) =>
                  setStatType(e.target.value as 'game' | 'practice' | 'other')
                }
                options={STAT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              />
              <Input
                label={shapeMeta.sessionTypeLabel}
                type={dataShape === 'season_totals' ? 'number' : 'date'}
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                placeholder={dataShape === 'season_totals' ? String(new Date().getFullYear()) : undefined}
              />
              <Input
                label={dataShape === 'game_box_score' ? 'Opponent (optional)' : 'Session name (optional)'}
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder={dataShape === 'game_box_score' ? 'e.g. vs State, Away game' : 'e.g. Fall ball session'}
              />
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed border-[color:var(--hairline)] bg-[var(--paper)] px-6 py-10 text-center transition-colors hover:border-grade-plus/50 hover:bg-grade-plus/[0.04]">
              {/* Hidden native file input — the <Input> primitive does not
                  support type=file; this is a visually-hidden field driving
                  the styled dropzone label. */}
              { }
              <input
                type="file"
                accept=".csv,text/csv,.tsv,text/tab-separated-values,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              <span className="text-body-sm font-medium text-text-primary">
                {fileName ? fileName : 'Choose a CSV or Excel file'}
              </span>
              <span className="mt-1 text-caption text-text-tertiary">
                CSV or .xlsx — a header row + one row per player.
              </span>
            </label>

            {/* Show the expected column template for this shape so the coach
                can verify their file has the right columns before uploading. */}
            <details className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-2 text-body-sm">
              <summary className="cursor-pointer py-1 font-medium text-text-primary">
                Expected column template
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5 pb-1">
                {shapeMeta.columnTemplate.map((col) => (
                  <span
                    key={col}
                    className="rounded border border-[color:var(--hairline)] px-2 py-0.5 font-mono text-caption text-text-secondary"
                  >
                    {col}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-caption text-text-tertiary">
                Column names are matched automatically — abbreviations and variations are accepted.
              </p>
            </details>

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep('choose')}>
                Back
              </Button>
              <Button onClick={runPreview} busy={busy} disabled={!csvContent.trim()}>
                Analyze file
              </Button>
            </div>
          </PaperCard>
        )}

        {/* STEP: DETECT ---------------------------------------------------- */}
        {step === 'detect' && preview && (
          <PaperCard className="space-y-4 px-6 py-6 sm:px-8 sm:py-8">
            <h2 className="font-annual text-h3 font-semibold text-text-primary">Detected source</h2>
            <p className="text-body-sm text-text-secondary">
              We read <strong className="font-semibold text-text-primary">{preview.totalRows}</strong> rows. Best match for these columns:{' '}
              <strong className="font-semibold text-grade-plus">
                {BASEBALL_IMPORT_SOURCES.find((s) => s.id === preview.detectedSourceId)?.label ??
                  preview.detectedSourceId}
              </strong>
              . You selected <strong className="font-semibold text-text-primary">{preview.sourceLabel}</strong>.
            </p>
            <div className="flex flex-wrap gap-2">
              {preview.headers.map((h) => (
                <span
                  key={h}
                  className="rounded border border-[color:var(--hairline)] px-2 py-1 font-mono text-caption text-text-secondary"
                >
                  {h}
                </span>
              ))}
            </div>
            <StepNav
              onBack={() => setStep('upload')}
              onNext={() => setStep('map')}
              nextLabel="Review mapping"
            />
          </PaperCard>
        )}

        {/* STEP: MAP (+ normalize note) ------------------------------------ */}
        {step === 'map' && preview && (
          <PaperCard className="space-y-4 px-6 py-6 sm:px-8 sm:py-8">
            <h2 className="font-annual text-h3 font-semibold text-text-primary">Column mapping</h2>
            <p className="text-body-sm text-text-secondary">
              These source columns will be normalized into stat fields. Unmapped fields are
              skipped.
            </p>
            <div className="overflow-hidden rounded-card border border-[color:var(--hairline)]">
              <table className="w-full text-body-sm">
                <thead className="text-left text-text-tertiary">
                  <tr>
                    <th className="px-4 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">Stat field</th>
                    <th className="px-4 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">Source column</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(preview.mapping).map(([field, col]) => (
                    <tr key={field} className="border-t border-[color:var(--hairline)]">
                      <td className="px-4 py-2 text-text-primary">{field}</td>
                      <td className="px-4 py-2">
                        {col ? (
                          <span className="text-text-secondary">{col}</span>
                        ) : (
                          <span className="text-text-tertiary">— not found —</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <StepNav
              onBack={() => setStep('detect')}
              onNext={() => setStep('match')}
              nextLabel="Match players"
            />
          </PaperCard>
        )}

        {/* STEP: MATCH ----------------------------------------------------- */}
        {step === 'match' && preview && (
          <PaperCard className="space-y-4 px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-annual text-h3 font-semibold text-text-primary">Match players</h2>
              <p className="flex items-center gap-2 text-body-sm text-text-secondary">
                {counts.matched}/{counts.total} matched
                {validation.blockingCount > 0 && (
                  <InkBadge label={`${validation.blockingCount} blocking`} tone="sodium" variant="solid" />
                )}
              </p>
            </div>
            {matches.length === 0 ? (
              <EditorsLetter ink="team" title="Nothing to match" body="No rows were parsed from this file." />
            ) : (
              <div className="max-h-[28rem] overflow-auto rounded-card border border-[color:var(--hairline)]">
                <table className="w-full min-w-[640px] text-body-sm">
                  <thead className="sticky top-0 z-10 bg-[var(--paper)] text-left text-text-tertiary">
                    <tr>
                      <th className="sticky left-0 z-20 min-w-[120px] bg-[var(--paper)] px-3 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">
                        From file
                      </th>
                      <th className="min-w-[180px] px-3 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">Player</th>
                      <th className="min-w-[140px] px-3 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">How matched</th>
                      <th className="min-w-[96px] px-3 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">Confidence</th>
                      <th className="min-w-[150px] px-3 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">On commit</th>
                      <th className="min-w-[120px] px-3 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m) => {
                      const blocking = validation.blockingRowIndices.includes(m.rowIndex);
                      return (
                      <tr
                        key={m.rowIndex}
                        className={cn(
                          'border-t border-[color:var(--hairline)]',
                          blocking && 'bg-sodium/[0.05]',
                        )}
                      >
                        <td
                          className={cn(
                            'sticky left-0 z-10 min-w-[120px] bg-[var(--paper)] px-3 py-2 text-text-primary',
                          )}
                        >
                          {/* Dateline rule — replaces the retired border-l-2
                              stripe for blocking rows. Shared primitive
                              (src/components/ui/card.tsx) so the geometry
                              can't drift from its sibling call sites. */}
                          {blocking && <DatelineRule tone="bg-sodium" className="mb-1" />}
                          {m.sourceName || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <NativeSelect
                            aria-label={`Match player for ${m.sourceName || 'row'}`}
                            value={m.playerId ?? ''}
                            onChange={(e) =>
                              setRowPlayer(m.rowIndex, e.target.value || null)
                            }
                            options={[
                              { value: '', label: '— Unmatched —' },
                              // Show jersey · class · position so a coach can
                              // tell two same-name players apart at the point
                              // of resolution (the spec's manual-review tier).
                              ...players.map((p) => ({
                                value: p.id,
                                label: describeMatchablePlayer(p),
                              })),
                            ]}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <MatchTierBadge tier={m.matchTier} />
                        </td>
                        <td className="px-3 py-2">
                          <ConfidenceBadge value={m.confidence} matched={!!m.playerId} />
                        </td>
                        <td className="px-3 py-2">
                          <DuplicateVerdictCell match={m} duplicate={liveVerdict(m)} />
                        </td>
                        <td className="px-3 py-2">
                          <NativeSelect
                            aria-label={`Import action for ${m.sourceName || 'row'}`}
                            value={m.action}
                            onChange={(e) =>
                              setRowAction(
                                m.rowIndex,
                                e.target.value as BaseballImportRowMatch['action']
                              )
                            }
                            disabled={!m.playerId}
                            options={[
                              { value: 'update', label: 'Update' },
                              { value: 'create', label: 'Create' },
                              { value: 'skip', label: 'Skip' },
                            ]}
                          />
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <StepNav
              onBack={() => setStep('map')}
              onNext={() => setStep('preview')}
              nextLabel="Preview & validate"
            />
          </PaperCard>
        )}

        {/* STEP: PREVIEW / VALIDATE --------------------------------------- */}
        {step === 'preview' && preview && (
          <PaperCard className="space-y-6 px-6 py-6 sm:px-8 sm:py-8">
            {/* Header: what will land + the validation verdict at a glance. */}
            <div>
              <h2 className="font-annual text-h3 font-semibold text-text-primary">Validate &amp; commit</h2>
              <p className="mt-1 text-body-sm text-text-secondary">
                We checked every row before anything is written to{' '}
                <strong className="font-semibold text-text-primary">{teamName}</strong>. Resolve blockers to
                unlock the commit; warnings need a quick confirmation.
              </p>
            </div>

            {/* GAP 2 — EXACT-DUPLICATE FILE guard. The server recognized this
                identical file (by SHA-256) was already committed; offer skip
                or an explicit force re-import. */}
            {duplicateFileRun && (
              <div className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-fw-md border border-sodium/30 bg-sodium/[0.1] text-sodium">
                    <IconWarning size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-semibold text-text-primary">
                      This exact file was already imported
                      {duplicateFileRun.committedAt
                        ? ` on ${new Date(duplicateFileRun.committedAt).toLocaleDateString()}`
                        : ''}
                      .
                    </p>
                    <p className="mt-0.5 text-body-sm text-text-secondary">
                      Its fingerprint matches a committed run, so nothing was written. Skip it,
                      or re-import the identical file anyway.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => doDownload(duplicateFileRun.runId)}
                      >
                        View the existing import
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        busy={busy}
                        onClick={() => {
                          setForceReimport(true);
                          setDuplicateFileRun(null);
                          void doCommit();
                        }}
                      >
                        Re-import anyway
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <KPIContentsStrip
              columns={4}
              items={[
                { label: 'Rows', value: counts.total },
                { label: 'Create', value: counts.create, emphasis: true },
                { label: 'Update', value: counts.update, emphasis: true },
                { label: 'Skip', value: counts.skip },
              ]}
            />

            {/* Validation verdict banner — the single source of truth for the gate. */}
            <ValidationVerdict report={validation} willWrite={counts.create + counts.update} />

            {/* DUPLICATE / RE-IMPORT verdict — the create/update/skip decision
                against existing rows, shown BEFORE commit (duplicate_resolution_v2.md). */}
            <DuplicateSummary
              summary={dupSummary}
              overwrites={matches
                .filter((m) => m.playerId && m.action !== 'skip')
                .map((m) => liveVerdict(m))
                .filter(
                  (d): d is BaseballImportRowDuplicate =>
                    !!d && d.verdict === 'will_update'
                )}
              matches={matches}
              onFix={() => setStep('match')}
            />

            {counts.create + counts.update === 0 && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3"
              >
                <InkBadge label="Needs attention" tone="sodium" variant="solid" />
                <p className="text-body-sm text-text-secondary">
                  Nothing will be written — every row is set to skip or is unmatched. Go back and
                  match at least one player.
                </p>
              </div>
            )}

            {/* Issues grouped by severity, with row-level drill-in + fast fix. */}
            {validation.issues.length > 0 && (
              <div className="space-y-4">
                <IssueGroup
                  severity="blocking"
                  issues={validation.issues.filter((i) => i.severity === 'blocking')}
                  onFix={() => setStep('match')}
                />
                <IssueGroup
                  severity="warning"
                  issues={validation.issues.filter((i) => i.severity === 'warning')}
                  onFix={() => setStep('match')}
                />
                <IssueGroup
                  severity="info"
                  issues={validation.issues.filter((i) => i.severity === 'info')}
                  onFix={() => setStep('match')}
                />
              </div>
            )}

            {/* Warning acknowledgement — required when warnings exist + no blockers. */}
            {validation.hasWarnings && !validation.hasBlockers && (
              <label className="flex cursor-pointer items-start gap-3 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3">
                { }
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-[color:var(--hairline)] text-grade-plus focus:ring-grade-plus"
                  checked={warningsAcknowledged}
                  onChange={(e) => setWarningsAcknowledged(e.target.checked)}
                />
                <span className="text-body-sm text-text-secondary">
                  I&apos;ve reviewed the{' '}
                  <strong className="font-semibold text-text-primary">
                    {validation.warningCount} warning{validation.warningCount === 1 ? '' : 's'}
                  </strong>{' '}
                  above and want to import these rows anyway.
                </span>
              </label>
            )}

            <p className="text-body-sm text-text-secondary">
              Committing writes a single audited run. You can roll it back from the history
              below.
            </p>

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep('match')}>
                Back
              </Button>
              <Button onClick={doCommit} busy={busy} disabled={commitDisabled}>
                {validation.hasBlockers
                  ? `Resolve ${validation.blockingCount} blocker${validation.blockingCount === 1 ? '' : 's'} to commit`
                  : hasCreateConflicts
                    ? `Resolve ${dupSummary.createConflictRows.length} create conflict${
                        dupSummary.createConflictRows.length === 1 ? '' : 's'
                      } to commit`
                    : 'Commit import'}
              </Button>
            </div>
          </PaperCard>
        )}

        {/* STEP: COMMITTING ----------------------------------------------- */}
        {step === 'committing' && (
          <PaperCard className="space-y-3 px-6 py-6 sm:px-8 sm:py-8">
            <h2 className="font-annual text-h3 font-semibold text-text-primary">Committing import…</h2>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </PaperCard>
        )}

        {/* STEP: DONE ------------------------------------------------------ */}
        {step === 'done' && result && (
          <PaperCard className="space-y-4 px-6 py-6 sm:px-8 sm:py-8">
            {result.heldForReview ? (
              <>
                <h2 className="font-annual text-h3 font-semibold text-text-primary">Sent for review</h2>
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3"
                >
                  <InkBadge label="Held" tone="sodium" variant="soft" />
                  <p className="text-body-sm text-text-secondary">
                    This source is configured to require review, so{' '}
                    <strong className="font-semibold text-text-primary">nothing was written yet</strong>. The {result.skipped} staged row
                    {result.skipped === 1 ? '' : 's'} will only land once a coach approves this
                    run from <strong className="font-semibold text-text-primary">Recent imports</strong> below.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button onClick={resetWizard}>Import another file</Button>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-annual text-h3 font-semibold text-text-primary">Import complete</h2>
                <KPIContentsStrip
                  columns={4}
                  items={[
                    { label: 'Created', value: result.created, emphasis: true },
                    { label: 'Updated', value: result.updated, emphasis: true },
                    { label: 'Duplicates', value: result.duplicatesSkipped },
                    { label: 'Skipped', value: result.skipped },
                  ]}
                />
                {/* Honored-action outcomes — only shown when they happened, so a
                    clean import stays uncluttered (duplicate_resolution_v2.md). */}
                {result.createConflicts > 0 && (
                  <div
                    role="status"
                    className="flex items-start gap-3 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3"
                  >
                    <InkBadge label="Needs attention" tone="sodium" variant="solid" />
                    <p className="text-body-sm text-text-secondary">
                      <strong className="font-semibold text-text-primary">
                        {result.createConflicts} row{result.createConflicts === 1 ? '' : 's'}
                      </strong>{' '}
                      marked <strong className="font-semibold text-text-primary">Create</strong> already existed and{' '}
                      <strong className="font-semibold text-text-primary">were not overwritten</strong>. Roll back the existing import or
                      re-import those rows as <strong className="font-semibold text-text-primary">Update</strong> to apply them.
                    </p>
                  </div>
                )}
                {result.updateFellBackToInsert > 0 && (
                  <div className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3 text-body-sm text-text-secondary">
                    <strong className="font-semibold text-text-primary">
                      {result.updateFellBackToInsert} row
                      {result.updateFellBackToInsert === 1 ? '' : 's'}
                    </strong>{' '}
                    marked <strong className="font-semibold text-text-primary">Update</strong> had no existing record, so a new line was
                    created instead.
                  </div>
                )}
                <div className="flex gap-3">
                  <Button onClick={resetWizard}>Import another file</Button>
                  <Button variant="danger" onClick={() => doRollback(result.importRunId)}>
                    Roll back this import
                  </Button>
                </div>
              </>
            )}
          </PaperCard>
        )}
      </Reveal>

      {/* RUN HISTORY ----------------------------------------------------- */}
      <section className="pt-4">
        <Eyebrow ink="team">Recent imports</Eyebrow>
        <HairlineRule ink="team" className="mt-1.5 w-12" />
        <div className="mt-4">
          {runs.length === 0 ? (
            <EditorsLetter
              ink="team"
              title="No imports yet"
              body="Your committed imports will appear here so you can audit or roll them back."
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-[color:var(--hairline)]">
              <table className="w-full min-w-[600px] text-body-sm">
                <thead className="text-left text-text-tertiary">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[140px] bg-[var(--paper)] px-4 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">
                      Source
                    </th>
                    <th className="min-w-[160px] px-4 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">File</th>
                    <th className="min-w-[80px] px-4 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">Rows</th>
                    <th className="min-w-[110px] px-4 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">Status</th>
                    <th className="min-w-[110px] px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-t border-[color:var(--hairline)]">
                      <td className="sticky left-0 z-10 min-w-[140px] bg-[var(--paper)] px-4 py-2 text-text-primary">
                        {r.source_label ?? r.source_id}
                      </td>
                      <td className="px-4 py-2 text-text-secondary">{r.file_name ?? '—'}</td>
                      <td className="px-4 py-2 text-text-secondary">
                        {r.matched_rows}/{r.total_rows}
                      </td>
                      <td className="px-4 py-2">
                        <RunStatus status={r.status} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {/* GAP 1 — download the preserved source-of-truth file. */}
                          {r.file_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => doDownload(r.id)}
                              title="Download the original source file"
                            >
                              Source file
                            </Button>
                          )}
                          {r.review_state === 'pending_review' ? (
                            <>
                              <Button
                                size="sm"
                                variant="primary"
                                busy={busy}
                                onClick={() => doReview(r.id, 'approve')}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                busy={busy}
                                onClick={() => doReview(r.id, 'reject')}
                              >
                                Reject
                              </Button>
                            </>
                          ) : r.status === 'committed' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              busy={busy}
                              onClick={() => doRollback(r.id)}
                            >
                              Roll back
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Small presentational helpers
// -----------------------------------------------------------------------------

function StepNav({
  onBack,
  onNext,
  nextLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <Button variant="ghost" onClick={onBack}>
        Back
      </Button>
      <Button onClick={onNext}>{nextLabel}</Button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Validation verdict + grouped issue list (data_validation_v2.md severity model)
// -----------------------------------------------------------------------------

/** InkBadge tone/variant for a severity tier — sodium carries every advisory
 *  (solid = blocking, soft = warning), neutral for info. Never amber/yellow/red. */
const SEVERITY_META: Record<
  ImportSeverity,
  { label: string; plural: string; tone: 'sodium' | 'neutral'; variant: 'soft' | 'solid' }
> = {
  blocking: { label: 'Blocking', plural: 'Blockers', tone: 'sodium', variant: 'solid' },
  warning: { label: 'Warning', plural: 'Warnings', tone: 'sodium', variant: 'soft' },
  info: { label: 'Info', plural: 'Info', tone: 'neutral', variant: 'soft' },
};

function ValidationVerdict({
  report,
  willWrite,
}: {
  report: ImportValidationReport;
  willWrite: number;
}) {
  if (report.hasBlockers) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3"
      >
        <InkBadge label="Blocking" tone="sodium" variant="solid" />
        <p className="text-body-sm text-text-secondary">
          <strong className="font-semibold text-text-primary">
            {report.blockingCount} blocker{report.blockingCount === 1 ? '' : 's'}
          </strong>{' '}
          must be resolved before this import can be committed. Nothing will be written until they
          are cleared.
        </p>
      </div>
    );
  }
  if (willWrite === 0) return null;
  if (report.hasWarnings) {
    return (
      <div className="flex items-start gap-3 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3">
        <InkBadge label="Warning" tone="sodium" variant="soft" />
        <p className="text-body-sm text-text-secondary">
          No blockers — <strong className="font-semibold text-text-primary">{willWrite}</strong> row{willWrite === 1 ? '' : 's'} are ready to
          import. Review the {report.warningCount} warning{report.warningCount === 1 ? '' : 's'}{' '}
          below and confirm to continue.
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3">
      <InkBadge label="All clear" tone="team" variant="soft" />
      <p className="text-body-sm text-text-secondary">
        <strong className="font-semibold text-text-primary">{willWrite}</strong> row{willWrite === 1 ? '' : 's'} validated with no
        issues. Ready to commit.
      </p>
    </div>
  );
}

function IssueGroup({
  severity,
  issues,
  onFix,
}: {
  severity: ImportSeverity;
  issues: ImportValidationIssue[];
  onFix: () => void;
}) {
  const [open, setOpen] = useState(severity !== 'info');
  if (issues.length === 0) return null;
  const meta = SEVERITY_META[severity];
  const fixable = severity === 'blocking';

  return (
    <div className="overflow-hidden rounded-card border border-[color:var(--hairline)] bg-[var(--paper)]">
      {/* Disclosure header is a full-bleed summary row, not a CTA — kept a
          semantic raw <button> with aria-expanded so the fairway <Button>'s
          own styling never fights the severity InkBadge. */}
      {/* eslint-disable-next-line helm/no-raw-button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2">
          <InkBadge label={`${issues.length} ${issues.length === 1 ? meta.label : meta.plural}`} tone={meta.tone} variant={meta.variant} />
        </span>
        <span className="text-caption text-text-tertiary">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <>
          <HairlineRule ink="hairline" />
          <ul className="divide-y divide-[color:var(--hairline)]">
            {issues.map((issue, idx) => (
              <li
                key={`${issue.code}-${issue.rowIndex ?? 'file'}-${issue.field ?? idx}`}
                className="flex items-start justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-body-sm text-text-primary">{issue.message}</p>
                  <p className="mt-0.5 text-caption text-text-tertiary">
                    {issue.rowIndex != null
                      ? `Row ${issue.rowIndex + 1}${issue.rowLabel ? ` · ${issue.rowLabel}` : ''}`
                      : 'File-level'}
                    {issue.field ? ` · ${issue.field.replace(/_/g, ' ')}` : ''}
                  </p>
                </div>
                {fixable && (
                  <Button size="sm" variant="ghost" onClick={onFix} className="shrink-0 text-xs">
                    Fix in Match
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// The chosen-resolution tier badge (player_matching_v2.md). Shows HOW a row
// resolved — a deterministic id / clean exact match reads team-green; a
// fuzzy-only name reads sodium so the coach knows to give it a second look.
const MATCH_TIER_META: Record<
  BaseballImportMatchTier,
  { label: string; tone: 'team' | 'sodium' | 'neutral'; title: string }
> = {
  external_id: {
    label: 'ID match',
    tone: 'team',
    title: 'Resolved by a previously-mapped external id (deterministic).',
  },
  exact_roster: {
    label: 'Exact',
    tone: 'team',
    title: 'Name is an exact, unambiguous match to one roster player.',
  },
  name_jersey_class: {
    label: 'Name + #/class',
    tone: 'team',
    title: 'Name match confirmed by jersey number and/or class (grad year).',
  },
  fuzzy_name: {
    label: 'Fuzzy name',
    tone: 'sodium',
    title: 'Name-similarity match only — no jersey/class to confirm it. Double-check.',
  },
  manual: {
    label: 'Manual',
    tone: 'neutral',
    title: 'A coach assigned this row by hand.',
  },
  unmatched: {
    label: 'Unmatched',
    tone: 'neutral',
    title: 'No player resolved — match it or set it to Skip.',
  },
};

function MatchTierBadge({ tier }: { tier: BaseballImportMatchTier }) {
  const meta = MATCH_TIER_META[tier] ?? MATCH_TIER_META.unmatched;
  return (
    <span title={meta.title}>
      <InkBadge label={meta.label} tone={meta.tone} />
    </span>
  );
}

function ConfidenceBadge({ value, matched }: { value: number; matched: boolean }) {
  if (!matched) {
    return <InkBadge label="Unmatched" tone="neutral" />;
  }
  const pct = Math.round(value * 100);
  const tone = value >= 0.9 ? 'team' : 'sodium';
  const variant = value >= 0.7 ? 'soft' : 'solid';
  return <InkBadge label={`${pct}%`} tone={tone} variant={variant} />;
}

// -----------------------------------------------------------------------------
// Duplicate / re-import verdict UI (duplicate_resolution_v2.md)
// -----------------------------------------------------------------------------

const VERDICT_META: Record<
  BaseballImportDuplicateVerdict,
  { label: string; tone: 'team' | 'sodium' | 'neutral'; title: string }
> = {
  new: {
    label: 'New',
    tone: 'team',
    title: 'No existing record for this player + session — commit will create a new line.',
  },
  will_update: {
    label: 'Overwrites',
    tone: 'sodium',
    title: 'An existing record matches — commit will OVERWRITE it. Open Preview to see what changes.',
  },
  exact_duplicate: {
    label: 'Duplicate',
    tone: 'neutral',
    title: 'Identical to an existing record from the same source — a re-import no-op you can skip.',
  },
  unresolved: {
    label: '—',
    tone: 'neutral',
    title: 'No player resolved yet — match the row to see its commit decision.',
  },
};

/** Per-row commit decision shown in the Match table. Flags the hard conflict
 * where a coach set 'Create' on a row that already exists (rejected on commit). */
function DuplicateVerdictCell({
  match,
  duplicate,
}: {
  match: BaseballImportRowMatch;
  duplicate?: BaseballImportRowDuplicate;
}) {
  if (!match.playerId || match.action === 'skip') {
    return <span className="text-caption text-text-tertiary">—</span>;
  }
  const verdict = duplicate?.verdict ?? 'new';
  const meta = VERDICT_META[verdict];
  const conflict = match.action === 'create' && verdict !== 'new';
  if (conflict) {
    return (
      <span title="You set this row to Create, but a matching record already exists. It will be rejected — switch to Update or roll back the existing import.">
        <InkBadge label="Conflict: already exists" tone="sodium" variant="solid" />
      </span>
    );
  }
  return (
    <span title={meta.title}>
      <InkBadge
        label={`${meta.label}${
          verdict === 'will_update' && duplicate && duplicate.changedFields.length > 0
            ? ` · ${duplicate.changedFields.length} field${duplicate.changedFields.length === 1 ? '' : 's'}`
            : ''
        }`}
        tone={meta.tone}
      />
    </span>
  );
}

/** The duplicate verdict roll-up + before -> after diff for the Preview step. */
function DuplicateSummary({
  summary,
  overwrites,
  matches,
  onFix,
}: {
  summary: {
    willCreate: number;
    willUpdate: number;
    exactDuplicate: number;
    createConflictRows: number[];
  };
  /** The LIVE will_update verdicts (already invalidated for stale re-matches). */
  overwrites: BaseballImportRowDuplicate[];
  matches: BaseballImportRowMatch[];
  onFix: () => void;
}) {
  const [open, setOpen] = useState(false);
  const nameByRow = useMemo(() => {
    const m = new Map<number, string>();
    for (const row of matches) m.set(row.rowIndex, row.playerName || row.sourceName || 'row');
    return m;
  }, [matches]);

  const hasAny = summary.willCreate + summary.willUpdate + summary.exactDuplicate > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-3">
      {/* Conflict alert takes priority — these block the commit. */}
      {summary.createConflictRows.length > 0 && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3"
        >
          <p className="flex items-start gap-3 text-body-sm text-text-secondary">
            <InkBadge label="Conflict" tone="sodium" variant="solid" />
            <span>
              <strong className="font-semibold text-text-primary">
                {summary.createConflictRows.length} row
                {summary.createConflictRows.length === 1 ? '' : 's'}
              </strong>{' '}
              set to <strong className="font-semibold text-text-primary">Create</strong> already exist. Creating would lose the existing line —
              switch them to Update or roll back the existing import first.
            </span>
          </p>
          <Button size="sm" variant="ghost" onClick={onFix} className="shrink-0 text-xs">
            Fix in Match
          </Button>
        </div>
      )}

      {/* The create/update/skip roll-up — the spec's "show decisions before commit". */}
      <div className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-body-sm">
          <span className="font-medium text-text-primary">On commit:</span>
          <span className="text-grade-plus">
            <strong className="font-semibold">{summary.willCreate}</strong> new
          </span>
          <span className="text-sodium">
            <strong className="font-semibold">{summary.willUpdate}</strong> overwrite existing
          </span>
          <span className="text-text-tertiary">
            <strong className="font-semibold">{summary.exactDuplicate}</strong> exact duplicate
            {summary.exactDuplicate === 1 ? '' : 's'}
          </span>
          {overwrites.length > 0 && (
            // A plain inline text disclosure toggle, not a CTA — the <Button>
            // primitive's padding/variant would dominate this summary row.
            // eslint-disable-next-line helm/no-raw-button
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="ml-auto text-caption font-medium text-text-secondary underline-offset-2 hover:underline"
            >
              {open ? 'Hide changes' : 'Show what changes'}
            </button>
          )}
        </div>

        {open && overwrites.length > 0 && (
          <>
            <HairlineRule ink="hairline" className="mt-3" />
            <ul className="mt-3 space-y-2">
              {overwrites.map((d) => (
                <li key={d.rowIndex} className="text-caption">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{nameByRow.get(d.rowIndex)}</span>
                    {d.existingSource && (
                      <span className="rounded border border-[color:var(--hairline)] px-1.5 py-0.5 text-text-tertiary">
                        was {d.existingSource.replace(/^import:/, '')}
                      </span>
                    )}
                  </div>
                  {d.changedFields.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {d.changedFields.slice(0, 8).map((c) => (
                        <span
                          key={c.field}
                          className="rounded border border-[color:var(--hairline)] px-1.5 py-0.5 text-text-secondary"
                        >
                          {c.field.replace(/_/g, ' ')}:{' '}
                          <span className="text-text-tertiary line-through">{c.before ?? '—'}</span>{' '}
                          <span aria-hidden>→</span>{' '}
                          <span className="font-medium text-text-primary">{c.after ?? '—'}</span>
                        </span>
                      ))}
                      {d.changedFields.length > 8 && (
                        <span className="text-text-tertiary">
                          +{d.changedFields.length - 8} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="mt-0.5 text-text-tertiary">
                      Same values — overwrites the source/trust stamp only.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

const RUN_STATUS_META: Record<string, { tone: 'team' | 'sodium' | 'neutral'; variant: 'soft' | 'solid' }> = {
  committed: { tone: 'team', variant: 'soft' },
  rolled_back: { tone: 'neutral', variant: 'soft' },
  failed: { tone: 'sodium', variant: 'solid' },
  pending: { tone: 'neutral', variant: 'soft' },
  parsing: { tone: 'neutral', variant: 'soft' },
  matching: { tone: 'neutral', variant: 'soft' },
  review: { tone: 'sodium', variant: 'soft' },
};

function RunStatus({ status }: { status: string }) {
  const meta = RUN_STATUS_META[status] ?? { tone: 'neutral' as const, variant: 'soft' as const };
  return <InkBadge label={status.replace('_', ' ')} tone={meta.tone} variant={meta.variant} />;
}
