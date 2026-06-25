'use client';

// =============================================================================
// src/app/lifting/(dashboard)/dashboard/import/import-client.tsx
//
// Helm Lifting Lab — CSV import client.
//
// Three-step flow:
//   1. Upload  — drag-and-drop or browse CSV; pick source + import kind
//   2. Preview — parsed rows table, athlete matching, validation summary
//   3. Commit  — confirm or rollback the staged run
//
// Wires to the three server actions:
//   initiateImportRun  — creates the staged run + rows in DB
//   commitImportRun    — marks run committed; data writers apply changes
//   rollbackImportRun  — marks run rolled_back
// =============================================================================

import { useCallback, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileUp,
  RefreshCw,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';

import { initiateImportRun, commitImportRun, rollbackImportRun } from '@/app/lifting/actions/imports';
import type { ImportActionResult } from '@/app/lifting/actions/imports';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImportSource =
  | 'teambuildr'
  | 'trainheroic'
  | 'bridge'
  | 'volt'
  | 'google_sheets'
  | 'csv'
  | 'manual';

type ImportKind =
  | 'lift_assignment'
  | 'lift_result'
  | 'testing'
  | 'wellness'
  | 'attendance';

type ImportStep = 'upload' | 'preview' | 'result';

interface ParsedRow {
  rowNumber: number;
  rawJson: Record<string, unknown>;
  headers: string[];
}

interface RecentImportRun {
  id: string;
  fileName: string | null;
  source: string;
  importKind: string;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  status: string;
  createdAt: string;
}

interface ImportClientProps {
  orgId: string;
  sport: 'baseball' | 'golf';
  canEdit: boolean;
  recentRuns: RecentImportRun[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOURCE_OPTIONS: { value: ImportSource; label: string }[] = [
  { value: 'csv', label: 'Generic CSV' },
  { value: 'teambuildr', label: 'TeamBuildr' },
  { value: 'trainheroic', label: 'TrainHeroic' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'volt', label: 'Volt' },
  { value: 'google_sheets', label: 'Google Sheets' },
  { value: 'manual', label: 'Manual Entry' },
];

const KIND_OPTIONS: { value: ImportKind; label: string; description: string }[] = [
  { value: 'lift_result', label: 'Lift Results', description: 'Set logs, actual loads & reps' },
  { value: 'testing', label: 'Testing / Max', description: '1RM, 3RM, velocity testing data' },
  { value: 'wellness', label: 'Wellness', description: 'Readiness, sleep, bodyweight' },
  { value: 'lift_assignment', label: 'Assignments', description: 'Pre-built session assignments' },
  { value: 'attendance', label: 'Attendance', description: 'Session attendance records' },
];

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headerLine = lines[0] ?? '';
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: ParsedRow[] = [];

  for (let i = 1; i < Math.min(lines.length, 5001); i++) {
    const dataLine = lines[i] ?? '';
    const values = dataLine.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const rawJson: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      rawJson[h] = values[idx] ?? '';
    });
    rows.push({ rowNumber: i, rawJson, headers });
  }

  return { headers, rows };
}

function statusColor(status: string): string {
  switch (status) {
    case 'committed': return 'bg-primary-50 text-primary-700 border-primary-100';
    case 'staged':
    case 'validated': return 'bg-amber-50 text-amber-700 border-amber-100';
    case 'rolled_back': return 'bg-warm-100 text-warm-600 border-warm-200';
    case 'failed': return 'bg-red-50 text-red-700 border-red-100';
    default: return 'bg-warm-100 text-warm-600 border-warm-200';
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(status)}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export function ImportClient({ orgId, sport, canEdit, recentRuns }: ImportClientProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [source, setSource] = useState<ImportSource>('csv');
  const [importKind, setImportKind] = useState<ImportKind>('lift_result');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stagedRunId, setStagedRunId] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<ImportActionResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --
  // Step 1: file handling
  // --

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParseError('Please upload a .csv file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setParseError('File must be under 10 MB.');
      return;
    }
    setParseError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (rows.length === 0) {
        setParseError('No data rows found. Check that your file has a header row and at least one data row.');
        return;
      }
      setParsedHeaders(headers);
      setParsedRows(rows);
      setStep('preview');
    };
    reader.onerror = () => setParseError('Failed to read file. Please try again.');
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  // --
  // Step 2 → Step 3: initiate run
  // --

  const handleInitiate = useCallback(async () => {
    if (parsedRows.length === 0) return;
    setIsSubmitting(true);
    setActionError(null);

    try {
      const result = await initiateImportRun({
        orgId,
        source,
        importKind,
        sport,
        fileName,
        rows: parsedRows.map((r) => ({
          rowNumber: r.rowNumber,
          rawJson: r.rawJson,
          matchStatus: 'unmatched' as const,
        })),
      });

      if (!result.success || !result.runId) {
        setActionError(result.error ?? 'Import initiation failed. Please try again.');
        return;
      }

      setStagedRunId(result.runId);
      setCommitResult(result);
      setStep('result');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unexpected error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [parsedRows, orgId, source, importKind, sport, fileName]);

  // --
  // Step 3: commit
  // --

  const handleCommit = useCallback(async () => {
    if (!stagedRunId) return;
    setIsSubmitting(true);
    setActionError(null);

    try {
      const result = await commitImportRun({ orgId, runId: stagedRunId });
      if (!result.success) {
        setActionError(result.error ?? 'Commit failed. Please try again.');
        return;
      }
      setCommitResult(result);
      setStagedRunId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unexpected error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [stagedRunId, orgId]);

  // --
  // Step 3: rollback
  // --

  const handleRollback = useCallback(async (reason?: string) => {
    if (!stagedRunId) return;
    setIsSubmitting(true);
    setActionError(null);

    try {
      const result = await rollbackImportRun({ orgId, runId: stagedRunId, reason: reason ?? null });
      if (!result.success) {
        setActionError(result.error ?? 'Rollback failed. Please try again.');
        return;
      }
      // Reset to upload step
      resetToUpload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unexpected error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [stagedRunId, orgId]);

  const resetToUpload = () => {
    setStep('upload');
    setFileName(null);
    setParsedHeaders([]);
    setParsedRows([]);
    setParseError(null);
    setStagedRunId(null);
    setCommitResult(null);
    setActionError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!canEdit) {
    return (
      <div className="space-y-6">
        <ImportPageHeader step={step} />
        <div className="rounded-2xl border border-white/20 bg-white/70 backdrop-blur-xl p-10 text-center">
          <FileUp className="w-8 h-8 text-warm-300 mx-auto mb-3" />
          <p className="text-warm-700 font-semibold">View-only access</p>
          <p className="text-sm text-warm-400 mt-1">You can view import history but cannot upload new data.</p>
        </div>
        {recentRuns.length > 0 && <RecentRunsTable runs={recentRuns} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ImportPageHeader step={step} />

      {/* Step breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-warm-500">
        {(['upload', 'preview', 'result'] as ImportStep[]).map((s, idx) => (
          <span key={s} className="flex items-center gap-2">
            {idx > 0 && <ChevronRight className="w-4 h-4 text-warm-300" />}
            <span
              className={
                s === step
                  ? 'text-primary-600 font-semibold'
                  : step === 'result' && s !== 'result'
                  ? 'text-warm-300'
                  : 'text-warm-400'
              }
            >
              {idx + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
          </span>
        ))}
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-auto shrink-0 text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── STEP 1: Upload ─── */}
      {step === 'upload' && (
        <UploadStep
          source={source}
          importKind={importKind}
          isDragOver={isDragOver}
          parseError={parseError}
          fileInputRef={fileInputRef}
          onSourceChange={setSource}
          onKindChange={setImportKind}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onFileInput={onFileInput}
        />
      )}

      {/* ─── STEP 2: Preview ─── */}
      {step === 'preview' && (
        <PreviewStep
          fileName={fileName}
          headers={parsedHeaders}
          rows={parsedRows}
          importKind={importKind}
          source={source}
          isSubmitting={isSubmitting}
          onBack={resetToUpload}
          onConfirm={handleInitiate}
        />
      )}

      {/* ─── STEP 3: Commit / Rollback ─── */}
      {step === 'result' && commitResult && (
        <ResultStep
          result={commitResult}
          stagedRunId={stagedRunId}
          isSubmitting={isSubmitting}
          onCommit={handleCommit}
          onRollback={handleRollback}
          onNewImport={resetToUpload}
        />
      )}

      {/* Recent import runs */}
      {recentRuns.length > 0 && step === 'upload' && (
        <RecentRunsTable runs={recentRuns} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ImportPageHeader({ step }: { step: ImportStep }) {
  const subtitles: Record<ImportStep, string> = {
    upload: 'Upload a CSV from TeamBuildr, TrainHeroic, or any lifting platform.',
    preview: 'Review the parsed rows before staging them in the database.',
    result: 'Review the staged run and commit or roll it back.',
  };

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold text-warm-900 tracking-tight">Import Data</h1>
      <p className="text-warm-500 text-sm mt-1">{subtitles[step]}</p>
    </div>
  );
}

interface UploadStepProps {
  source: ImportSource;
  importKind: ImportKind;
  isDragOver: boolean;
  parseError: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSourceChange: (s: ImportSource) => void;
  onKindChange: (k: ImportKind) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function UploadStep({
  source,
  importKind,
  isDragOver,
  parseError,
  fileInputRef,
  onSourceChange,
  onKindChange,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileInput,
}: UploadStepProps) {
  return (
    <div className="space-y-5">
      {/* Source + kind selectors */}
      <div className="rounded-2xl border border-white/20 bg-white/70 backdrop-blur-xl p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-warm-700 uppercase tracking-wide mb-1.5">
              Data source
            </label>
            <select
              value={source}
              onChange={(e) => onSourceChange(e.target.value as ImportSource)}
              className="w-full rounded-xl border border-warm-200 bg-white/80 px-3 py-2 text-sm text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-400"
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-warm-700 uppercase tracking-wide mb-1.5">
              Import type
            </label>
            <select
              value={importKind}
              onChange={(e) => onKindChange(e.target.value as ImportKind)}
              className="w-full rounded-xl border border-warm-200 bg-white/80 px-3 py-2 text-sm text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-400"
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label} — {o.description}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`rounded-2xl border-2 border-dashed transition-all p-10 flex flex-col items-center gap-3 cursor-pointer ${
          isDragOver
            ? 'border-primary-400 bg-primary-50/50'
            : 'border-warm-200 bg-white/50 hover:border-warm-300 hover:bg-white/70'
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        aria-label="Upload CSV file"
      >
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
            isDragOver ? 'bg-primary-100 text-primary-600' : 'bg-warm-100 text-warm-500'
          }`}
        >
          <Upload className="w-6 h-6" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-warm-800">
            {isDragOver ? 'Drop your CSV here' : 'Drag & drop your CSV here'}
          </p>
          <p className="text-xs text-warm-400 mt-0.5">or click to browse · max 10 MB · .csv only</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={onFileInput}
          aria-label="CSV file input"
        />
      </div>

      {parseError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {parseError}
        </div>
      )}
    </div>
  );
}

interface PreviewStepProps {
  fileName: string | null;
  headers: string[];
  rows: ParsedRow[];
  importKind: ImportKind;
  source: ImportSource;
  isSubmitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

function PreviewStep({
  fileName,
  headers,
  rows,
  importKind,
  source,
  isSubmitting,
  onBack,
  onConfirm,
}: PreviewStepProps) {
  const previewRows = rows.slice(0, 10);
  const kindLabel = KIND_OPTIONS.find((o) => o.value === importKind)?.label ?? importKind;
  const sourceLabel = SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? source;

  return (
    <div className="space-y-5">
      {/* Summary card */}
      <div className="rounded-2xl border border-white/20 bg-white/70 backdrop-blur-xl p-5">
        <h2 className="text-sm font-bold text-warm-900 uppercase tracking-wide mb-3">Import summary</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { label: 'File', value: fileName ?? '—' },
            { label: 'Source', value: sourceLabel },
            { label: 'Type', value: kindLabel },
            { label: 'Total rows', value: rows.length.toLocaleString() },
            { label: 'Columns', value: headers.length.toString() },
          ].map(({ label, value }) => (
            <div key={label} className="bg-warm-50/60 rounded-xl px-4 py-3">
              <p className="text-xs text-warm-500 font-medium">{label}</p>
              <p className="text-sm font-semibold text-warm-900 mt-0.5 truncate">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Preview table */}
      <div className="rounded-2xl border border-white/20 bg-white/70 backdrop-blur-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-warm-900 uppercase tracking-wide">
            Preview (first {previewRows.length} rows)
          </h2>
          {rows.length > 10 && (
            <span className="text-xs text-warm-400">+{rows.length - 10} more rows</span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-warm-100">
                <th className="pr-3 pb-2 text-left text-warm-400 font-medium">#</th>
                {headers.slice(0, 8).map((h) => (
                  <th key={h} className="px-3 pb-2 text-left text-warm-600 font-semibold truncate max-w-[120px]">
                    {h}
                  </th>
                ))}
                {headers.length > 8 && (
                  <th className="px-3 pb-2 text-left text-warm-400 font-medium">
                    +{headers.length - 8} more
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr key={row.rowNumber} className="border-b border-warm-50 hover:bg-warm-50/40">
                  <td className="pr-3 py-2 text-warm-400">{row.rowNumber}</td>
                  {headers.slice(0, 8).map((h) => (
                    <td key={h} className="px-3 py-2 text-warm-700 truncate max-w-[120px]">
                      {String(row.rawJson[h] ?? '')}
                    </td>
                  ))}
                  {headers.length > 8 && <td className="px-3 py-2 text-warm-300">…</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Athlete matching note */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Rows will be staged as{' '}
          <strong>unmatched</strong> — your data operations team reviews and applies matched
          rows after committing. This staging step is safe and reversible.
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-semibold text-warm-700 bg-warm-100 rounded-xl hover:bg-warm-200 transition-all disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          onClick={onConfirm}
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-xl hover:bg-primary-700 transition-all shadow-sm shadow-primary-600/20 disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Staging…
            </>
          ) : (
            <>
              <FileUp className="w-4 h-4" />
              Stage import ({rows.length.toLocaleString()} rows)
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface ResultStepProps {
  result: ImportActionResult;
  stagedRunId: string | null;
  isSubmitting: boolean;
  onCommit: () => void;
  onRollback: (reason?: string) => void;
  onNewImport: () => void;
}

function ResultStep({
  result,
  stagedRunId,
  isSubmitting,
  onCommit,
  onRollback,
  onNewImport,
}: ResultStepProps) {
  const isCommitted = !stagedRunId;

  return (
    <div className="space-y-5">
      {/* Result card */}
      <div className="rounded-2xl border border-white/20 bg-white/70 backdrop-blur-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          {isCommitted ? (
            <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <FileUp className="w-5 h-5" />
            </div>
          )}
          <div>
            <h2 className="text-base font-bold text-warm-900">
              {isCommitted ? 'Import committed' : 'Import staged — review before committing'}
            </h2>
            <p className="text-sm text-warm-500">
              {isCommitted
                ? 'Data writers will process matched rows. You can start a new import.'
                : 'Review the stats below, then commit to apply or roll back to discard.'}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total rows', value: result.totalRows ?? 0 },
            { label: 'Matched', value: result.matchedRows ?? 0 },
            { label: 'Unmatched', value: result.unmatchedRows ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="bg-warm-50/60 rounded-xl px-4 py-3 text-center">
              <p className="text-2xl font-bold tabular-nums text-warm-900">{value}</p>
              <p className="text-xs font-medium text-warm-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Run ID */}
        {result.runId && (
          <p className="text-xs text-warm-300 font-mono">
            Run ID: {result.runId}
          </p>
        )}
      </div>

      {/* Actions */}
      {!isCommitted && stagedRunId ? (
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => onRollback('User cancelled from import preview')}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-all disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Roll back
          </button>
          <button
            onClick={onCommit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-xl hover:bg-primary-700 transition-all shadow-sm shadow-primary-600/20 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Committing…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Commit import
              </>
            )}
          </button>
        </div>
      ) : (
        <button
          onClick={onNewImport}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-700 bg-primary-50 rounded-xl hover:bg-primary-100 transition-all"
        >
          <Upload className="w-4 h-4" />
          New import
        </button>
      )}
    </div>
  );
}

function RecentRunsTable({ runs }: { runs: RecentImportRun[] }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/70 backdrop-blur-xl p-5 space-y-3">
      <h2 className="text-sm font-bold text-warm-900 uppercase tracking-wide">Recent imports</h2>
      <div className="space-y-2">
        {runs.map((run) => (
          <div
            key={run.id}
            className="flex items-center gap-4 px-4 py-3 bg-white/40 rounded-xl border border-white/10"
          >
            <div className="w-8 h-8 rounded-lg bg-warm-100 flex items-center justify-center text-warm-500 shrink-0">
              <FileUp className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-warm-900 truncate">
                {run.fileName ?? 'Unknown file'}
              </p>
              <p className="text-xs text-warm-400">
                {run.source} · {run.importKind} · {run.totalRows.toLocaleString()} rows ·{' '}
                {new Date(run.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <StatusBadge status={run.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
