'use client';

// =============================================================================
// src/components/baseball/import-center/EventImportWizard.tsx
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// The ADVANCED, event-level import wizard for the CONCRETE vendor adapters
// (TrackMan / Rapsodo / Blast / Diamond Kinetics / GameChanger / StatCrew). It
// drives the real FILE -> event-row pipeline:
//   upload -> parse(adapter) -> match distinct players -> Import Diff Viewer
//   -> commit (event tables) / rollback.
//
// Distinct-player matching (not per-row): a 300-pitch TrackMan file resolves ~9
// pitchers once, so the coach confirms a short list, not 300 rows. The diff
// viewer (previewCommit) shows exactly what commit() will write.
//
// LIVING ANNUAL PRESENTATION — every step is a PaperCard on the fairway Button
// + InkBadge vocabulary; the step mount transition runs on the kit's `<Reveal>`
// (Stage-0 interaction layer) instead of a hand-rolled framer-motion fade.
// Honest loading/empty/error states, never a yellow/amber box. All writes go
// through the SAME capability-gated server actions — adapter wiring untouched.
// =============================================================================

import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/fairway';
import { NativeSelect } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/sonner';
import { IconWarning } from '@/components/icons';
import { PaperCard, InkBadge, KPIContentsStrip, Reveal } from '@/components/baseball/living-annual';

import { ImportDiffViewer } from '@/components/baseball/import-center/ImportDiffViewer';
import { SourceDetectionCard } from '@/components/baseball/import-center/SourceDetectionCard';
import { ManualMapPanel } from '@/components/baseball/import-center/ManualMapPanel';
import {
  previewEventImport,
  commitEventImport,
  rollbackEventImport,
  getEventImportRunFileUrl,
  reviewEventImportRun,
  type EventImportPreview,
  type CommitEventImportResult,
} from '@/app/baseball/actions/stat-event-imports';
import {
  previewImport,
  commitImport,
} from '@/app/baseball/actions/imports';
import type { BaseballSourceKey } from '@/lib/types/baseball-stat-events';
import { encodeBinaryBody, isBinaryFileName } from '@/lib/baseball/adapters/import-file-body';

type RosterPlayer = { id: string; first_name: string | null; last_name: string | null };

interface Props {
  teamId: string;
  teamName: string;
  players: RosterPlayer[];
  /** sources that have a concrete event adapter (key + label). */
  eventSources: Array<{ key: BaseballSourceKey; label: string; accept: string }>;
}

type Step =
  | 'upload'
  | 'detect'
  | 'match'
  | 'preview'
  | 'committing'
  | 'done'
  | 'manualmap'; // GAP 6 — PDF preserve-for-manual bridge

export function EventImportWizard({ teamId, teamName, players, eventSources }: Props) {
  const { addToast } = useToast();

  const [step, setStep] = useState<Step>('upload');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sourceKey, setSourceKey] = useState<BaseballSourceKey>(
    eventSources[0]?.key ?? 'trackman_csv',
  );
  const [fileName, setFileName] = useState('');
  const [fileBody, setFileBody] = useState('');

  const [preview, setPreview] = useState<EventImportPreview | null>(null);
  // handle -> overridden playerId (null = explicitly unmatched).
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [result, setResult] = useState<CommitEventImportResult | null>(null);

  const activeSource = eventSources.find((s) => s.key === sourceKey) ?? eventSources[0];

  const onFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    // XLSX/PDF are binary (a ZIP / PDF container); readAsText would corrupt them.
    // Binary files are read as bytes and wrapped in the transport envelope the
    // server decodes; text files (CSV/TSV/XML) are read as text as before.
    if (isBinaryFileName(file.name)) {
      reader.onload = () => {
        const buf = reader.result as ArrayBuffer | null;
        if (!buf) {
          setError('Could not read that file.');
          return;
        }
        setFileBody(encodeBinaryBody(buf, file.type || 'application/octet-stream'));
        setFileName(file.name);
      };
      reader.onerror = () => setError('Could not read that file.');
      reader.readAsArrayBuffer(file);
      return;
    }
    reader.onload = () => {
      setFileBody(String(reader.result ?? ''));
      setFileName(file.name);
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
  }, []);

  const runPreview = useCallback(async () => {
    if (!fileBody.trim()) {
      setError('Choose a file before continuing.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await previewEventImport({ teamId, sourceKey, fileBody });
      // A preserve-for-manual source (PDF) intentionally yields zero committable
      // rows but carries recovered text — route it to the Detect step so the coach
      // can read + hand-map it, instead of treating it as a hard parse failure.
      const isManualPreserve = !!res.detection.preservedText;
      if (res.eventRowCount === 0 && !isManualPreserve) {
        setError(
          res.plan.warnings[0] ??
            'No event rows could be parsed from that file. Check it is the right source.',
        );
        setBusy(false);
        return;
      }
      setPreview(res);
      // Seed overrides from the auto-resolution.
      const seed: Record<string, string | null> = {};
      for (const r of res.resolutions) seed[r.handle] = r.playerId;
      setOverrides(seed);
      // v10 Import Dossier: show Provider detection (source + grain + trust +
      // auto-commit band) BEFORE player matching.
      setStep('detect');
    } catch {
      setError('We could not analyze that file. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [fileBody, sourceKey, teamId]);

  // Re-derive the plan client-side as the coach changes matches, so the diff
  // viewer updates live without a server round-trip per change. We recompute the
  // matched-player count + which rows would be skipped; the server re-validates
  // and re-plans authoritatively on commit.
  const livePlan = useMemo(() => {
    if (!preview) return null;
    const matchedHandles = new Set(
      Object.entries(overrides)
        .filter(([, pid]) => !!pid)
        .map(([h]) => h),
    );
    const matchedPlayers = matchedHandles.size;
    // Adjust the server plan's skip/create counts for handle overrides: any row
    // whose handle is now unmatched moves to skipped; this mirrors the server
    // logic closely enough for the preview. The server is the source of truth.
    return {
      plan: preview.plan,
      matchedPlayers,
      totalPlayers: preview.resolutions.length,
      matchedHandles,
    };
  }, [preview, overrides]);

  const canCommit = useMemo(() => {
    if (!preview) return false;
    return Object.values(overrides).some((pid) => !!pid);
  }, [preview, overrides]);

  const doCommit = useCallback(
    async (force = false) => {
      if (!preview) return;
      setBusy(true);
      setError(null);
      setStep('committing');
      try {
        const res = await commitEventImport({
          teamId,
          sourceKey,
          fileName: fileName || `${sourceKey}_${Date.now()}`,
          rows: preview.rows,
          resolutionOverrides: Object.entries(overrides).map(([handle, playerId]) => ({
            handle,
            playerId,
          })),
          // GAP 1 + GAP 2 — preserve + fingerprint the original file.
          rawFileBody: fileBody || undefined,
          forceReimport: force,
          // GAP 4 — echo the detection band so the server re-derives review-hold.
          detectionAutoCommit: preview.detection.autoCommit,
        });
        setResult(res);
        setStep('done');
        // GAP 2 — exact-duplicate file: stay on done with the dup messaging.
        if (res.duplicateFileRun) {
          addToast({
            type: 'info',
            title: 'Already imported',
            description: 'This exact file was already committed. Nothing was written.',
          });
        } else if (res.heldForReview) {
          // GAP 4 — held for review: zero rows written, awaiting approval.
          addToast({
            type: 'success',
            title: 'Sent for review',
            description:
              'This source holds for review — nothing was written yet. Approve it from Recent imports.',
          });
        } else {
          addToast({
            type: 'success',
            title: res.correctionOf ? 'Correction imported' : 'Events imported',
            description: `${res.created} new · ${res.updated} updated · ${res.skipped} skipped`,
          });
        }
      } catch {
        setError('The import could not be committed.');
        setStep('preview');
      } finally {
        setBusy(false);
      }
    },
    [preview, teamId, sourceKey, fileName, overrides, fileBody, addToast],
  );

  // GAP 6 — bridge a manually-mapped PDF block into the FLAT pipeline so it
  // inherits matching / validation / dedupe / trust-stamping / timeline / rollback.
  const doManualMap = useCallback(
    async (csvBlock: string) => {
      setBusy(true);
      setError(null);
      try {
        // Preview through the flat generic-CSV path (a real parse + match) then
        // commit it; the PDF is preserved as the run's source file via rawFileBody.
        const flatPreview = await previewImport({
          teamId,
          sourceId: 'generic_csv',
          csvContent: csvBlock,
          statType: 'game',
          sessionDate: new Date().toISOString().slice(0, 10),
        });
        if (flatPreview.totalRows === 0) {
          setError('No rows could be read from the mapped lines. Check the columns and try again.');
          setBusy(false);
          return;
        }
        const res = await commitImport({
          teamId,
          sourceId: 'generic_csv',
          fileName: fileName || `${sourceKey}_manual_${Date.now()}.pdf`,
          statType: 'game',
          sessionDate: new Date().toISOString().slice(0, 10),
          sessionName: `Hand-mapped from ${fileName || 'PDF'}`,
          headers: flatPreview.headers,
          mapping: flatPreview.mapping,
          rows: flatPreview.rows,
          matches: flatPreview.matches,
          // Preserve the ORIGINAL PDF as the source file so the drawer can show
          // "mapped by hand from <file>.pdf".
          rawFileBody: fileBody || undefined,
        });
        addToast({
          type: res.heldForReview ? 'success' : 'success',
          title: res.heldForReview ? 'Sent for review' : 'Mapped rows imported',
          description: res.heldForReview
            ? 'Nothing written yet — approve it from Recent imports.'
            : `${res.created} created · ${res.updated} updated · ${res.skipped} skipped`,
        });
        reset();
      } catch {
        setError('The mapped rows could not be imported. Please try again.');
      } finally {
        setBusy(false);
      }
    },
    // reset is declared below; safe — useCallback captures the latest at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamId, fileName, sourceKey, fileBody, addToast],
  );

  const doRollback = useCallback(
    async (importRunId: string) => {
      setBusy(true);
      try {
        const res = await rollbackEventImport({ teamId, importRunId });
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
    [teamId, addToast],
  );

  // GAP 1 — download the run's preserved source file via a signed URL.
  const doDownload = useCallback(
    async (importRunId: string) => {
      try {
        const { url } = await getEventImportRunFileUrl({ teamId, importRunId });
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
    [teamId, addToast],
  );

  const reset = useCallback(() => {
    setStep('upload');
    setPreview(null);
    setOverrides({});
    setResult(null);
    setFileBody('');
    setFileName('');
    setError(null);
  }, []);

  return (
    <div className="space-y-6">
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
        {/* UPLOAD */}
        {step === 'upload' && (
          <PaperCard className="space-y-5 px-6 py-6 sm:px-8 sm:py-8">
            <div>
              <h2 className="font-annual text-h3 font-semibold text-text-primary">Event-level import</h2>
              <p className="mt-1 text-body-sm text-text-secondary">
                Pitch, batted-ball and swing data parsed with the vendor&apos;s real format —
                not as a generic spreadsheet. Every row carries its source, trust and context.
              </p>
            </div>
            <NativeSelect
              label="Source"
              value={sourceKey}
              onChange={(e) => setSourceKey(e.target.value as BaseballSourceKey)}
              options={eventSources.map((s) => ({ value: s.key, label: s.label }))}
            />
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed border-[color:var(--hairline)] bg-[var(--paper)] px-6 py-10 text-center transition-colors hover:border-grade-plus/50 hover:bg-grade-plus/[0.04]">
              { }
              <input
                type="file"
                accept={activeSource?.accept ?? '.csv,.xml'}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              <span className="text-body-sm font-medium text-text-primary">
                {fileName || `Choose a ${activeSource?.label ?? ''} file`}
              </span>
              <span className="mt-1 text-caption text-text-tertiary">
                {activeSource?.accept.includes('xml')
                  ? 'XML play-by-play export.'
                  : 'CSV / TSV export from the device or platform.'}
              </span>
            </label>
            <div className="flex items-center justify-end">
              <Button onClick={runPreview} busy={busy} disabled={!fileBody.trim()}>
                Parse file
              </Button>
            </div>
          </PaperCard>
        )}

        {/* DETECT (provider detection — source + grain + trust + auto-commit) */}
        {step === 'detect' && preview && (
          <PaperCard className="space-y-5 px-6 py-6 sm:px-8 sm:py-8">
            <div>
              <h2 className="font-annual text-h3 font-semibold text-text-primary">Provider detection</h2>
              <p className="mt-1 text-body-sm text-text-secondary">
                This is what we recognized in your file. Confirm it looks right before matching
                players.
              </p>
            </div>
            <SourceDetectionCard detection={preview.detection} fileName={fileName} />
            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep('upload')}>
                Back
              </Button>
              {preview.eventRowCount > 0 ? (
                <Button onClick={() => setStep('match')}>Match players</Button>
              ) : preview.detection.preservedText ? (
                // GAP 6 — preserve-for-manual (PDF): offer the manual-mapping
                // bridge into the flat pipeline instead of a dead end.
                <Button onClick={() => setStep('manualmap')}>Map these lines</Button>
              ) : (
                <Button variant="ghost" onClick={reset}>
                  Start over
                </Button>
              )}
            </div>
          </PaperCard>
        )}

        {/* MATCH (distinct players) */}
        {step === 'match' && preview && (
          <PaperCard className="space-y-4 px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex items-baseline justify-between">
              <h2 className="font-annual text-h3 font-semibold text-text-primary">Confirm players</h2>
              <p className="text-body-sm text-text-secondary">
                {Object.values(overrides).filter(Boolean).length}/{preview.resolutions.length}{' '}
                matched
              </p>
            </div>
            <p className="text-body-sm text-text-secondary">
              {preview.eventRowCount} events from {preview.resolutions.length} players. Confirm
              each one — events for unmatched players are skipped.
            </p>
            <div className="max-h-[26rem] overflow-auto rounded-card border border-[color:var(--hairline)]">
              <table className="w-full min-w-[560px] text-body-sm">
                <thead className="sticky top-0 z-10 bg-[var(--paper)] text-left text-text-tertiary">
                  <tr>
                    <th className="px-3 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">From file</th>
                    <th className="px-3 py-2 text-right text-eyebrow font-semibold uppercase tracking-[0.14em]">Events</th>
                    <th className="px-3 py-2 text-eyebrow font-semibold uppercase tracking-[0.14em]">Player</th>
                    <th className="px-3 py-2 text-right text-eyebrow font-semibold uppercase tracking-[0.14em]">Auto match</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.resolutions.map((r) => (
                    <tr key={r.handle} className="border-t border-[color:var(--hairline)]">
                      <td className="px-3 py-2 text-text-primary">{r.externalName || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                        {r.rowCount}
                      </td>
                      <td className="px-3 py-2">
                        <NativeSelect
                          aria-label={`Match player for ${r.externalName || 'row'}`}
                          value={overrides[r.handle] ?? ''}
                          onChange={(e) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [r.handle]: e.target.value || null,
                            }))
                          }
                          options={[
                            { value: '', label: '— Unmatched —' },
                            ...players.map((p) => ({
                              value: p.id,
                              label: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
                            })),
                          ]}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ConfBadge value={r.confidence} matched={!!r.playerId} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep('detect')}>
                Back
              </Button>
              <Button onClick={() => setStep('preview')}>Review changes</Button>
            </div>
          </PaperCard>
        )}

        {/* PREVIEW (Diff Viewer) */}
        {step === 'preview' && preview && livePlan && (
          <PaperCard className="space-y-5 px-6 py-6 sm:px-8 sm:py-8">
            <h2 className="font-annual text-h3 font-semibold text-text-primary">Review changes</h2>
            <ImportDiffViewer
              sourceLabel={preview.sourceLabel}
              rowsRead={preview.rowsRead}
              eventRowCount={preview.eventRowCount}
              plan={preview.plan}
              validation={preview.validation}
              matchedPlayers={livePlan.matchedPlayers}
              totalPlayers={livePlan.totalPlayers}
            />
            <p className="text-body-sm text-text-secondary">
              Committing writes to <strong className="font-semibold text-text-primary">{teamName}</strong> as one audited run you can roll
              back.
            </p>
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep('match')}>
                Back
              </Button>
              <Button onClick={() => doCommit()} busy={busy} disabled={!canCommit}>
                Commit import
              </Button>
            </div>
          </PaperCard>
        )}

        {/* MANUAL MAP (GAP 6 — PDF preserve-for-manual bridge) */}
        {step === 'manualmap' && preview && (
          <ManualMapPanel
            preservedText={preview.detection.preservedText ?? ''}
            fileName={fileName}
            busy={busy}
            onCancel={() => setStep('detect')}
            onConfirm={doManualMap}
          />
        )}

        {/* COMMITTING */}
        {step === 'committing' && (
          <PaperCard className="space-y-3 px-6 py-6 sm:px-8 sm:py-8">
            <h2 className="font-annual text-h3 font-semibold text-text-primary">Writing events…</h2>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </PaperCard>
        )}

        {/* DONE */}
        {step === 'done' && result && (
          <PaperCard className="space-y-4 px-6 py-6 sm:px-8 sm:py-8">
            {result.duplicateFileRun ? (
              // GAP 2 — exact-duplicate file: nothing written; offer force.
              <>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-fw-md border border-sodium/30 bg-sodium/[0.1] text-sodium">
                    <IconWarning size={18} />
                  </span>
                  <div>
                    <h2 className="font-annual text-h3 font-semibold text-text-primary">Already imported</h2>
                    <p className="mt-1 text-body-sm text-text-secondary">
                      This exact file
                      {result.duplicateFileRun.committedAt
                        ? ` was committed on ${new Date(result.duplicateFileRun.committedAt).toLocaleDateString('en-US')}`
                        : ' was already committed'}
                      , so nothing was written. Re-import the identical file only if you mean to.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button onClick={reset}>Import another file</Button>
                  <Button
                    variant="ghost"
                    busy={busy}
                    onClick={() => doCommit(true)}
                  >
                    Re-import anyway
                  </Button>
                </div>
              </>
            ) : result.heldForReview ? (
              // GAP 4 — held for review: zero rows; coach approves later.
              <>
                <h2 className="font-annual text-h3 font-semibold text-text-primary">Sent for review</h2>
                <p className="text-body-sm text-text-secondary">
                  This source holds for coach review, so no events were written. The run is in
                  the review queue — approve or reject it from <strong className="font-semibold text-text-primary">Recent imports</strong>{' '}
                  in the standard import center.
                </p>
                <div className="flex gap-3">
                  <Button onClick={reset}>Import another file</Button>
                  {result.importRunId && (
                    <Button
                      variant="primary"
                      busy={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await reviewEventImportRun({
                            teamId,
                            importRunId: result.importRunId,
                            decision: 'approve',
                          });
                          addToast({
                            type: 'success',
                            title: 'Approved',
                            description: 'The held events were written.',
                          });
                          reset();
                        } catch {
                          addToast({ type: 'error', title: 'Approval failed', description: 'Please try again.' });
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Approve now
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 className="font-annual text-h3 font-semibold text-text-primary">
                  {result.correctionOf ? 'Correction imported' : 'Import complete'}
                </h2>
                {result.correctionOf && (
                  <p className="text-body-sm text-text-secondary">
                    This file corrected an earlier import. Prior values were superseded (kept for
                    history) — rolling back restores them.
                  </p>
                )}
                <KPIContentsStrip
                  columns={3}
                  items={[
                    { label: 'New', value: result.created, emphasis: true },
                    { label: 'Updated', value: result.updated, emphasis: true },
                    { label: 'Skipped', value: result.skipped },
                  ]}
                />
                <div className="flex flex-wrap gap-3">
                  <Button onClick={reset}>Import another file</Button>
                  <Button variant="ghost" onClick={() => doDownload(result.importRunId)}>
                    Download source file
                  </Button>
                  <Button variant="danger" onClick={() => doRollback(result.importRunId)}>
                    Roll back this import
                  </Button>
                </div>
              </>
            )}
          </PaperCard>
        )}
      </Reveal>
    </div>
  );
}

function ConfBadge({ value, matched }: { value: number; matched: boolean }) {
  if (!matched) return <InkBadge label="Manual" tone="neutral" />;
  const pct = Math.round(value * 100);
  const tone = value >= 0.9 ? 'team' : 'sodium';
  const variant = value >= 0.9 ? 'soft' : value >= 0.7 ? 'soft' : 'solid';
  return <InkBadge label={`${pct}%`} tone={tone} variant={variant} />;
}
