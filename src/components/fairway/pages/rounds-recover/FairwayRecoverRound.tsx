'use client';

/**
 * ============================================================================
 * Fairway · pages/rounds-recover · FairwayRecoverRound  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the PLAYER /golf/dashboard/rounds/recover route — the
 * incomplete-round recovery flow. A self-contained client (mirroring the legacy
 * RecoverRoundClient shape) that scans the SAME offline storage — modern + legacy
 * IndexedDB plus localStorage emergency saves — and re-submits a recoverable
 * draft through the SAME verbatim server action (submitGolfRoundComprehensive).
 *
 * PLUMBING IS PRESERVED 1:1 with the legacy client:
 *   • identical state machine (rounds / loading / recovering / error),
 *   • identical scan useEffect (Promise.allSettled over legacy + modern stores,
 *     localStorage fallback, hasRecoverableStats filter, dedup),
 *   • identical recover handler — same submitGolfRoundComprehensive call, same
 *     re-try-without-id branch, same already-submitted short-circuit, same
 *     non-destructive cleanupRecoveredRound (delete only AFTER a confirmed
 *     server submit; NEVER delete-then-reinsert),
 *   • no new fetch is introduced — the storage scan IS the data source.
 * Only the PRESENTATION changes: Fairway Surface/Button/EmptyState/InlineNotice/
 * ViewHeader + fairwayToast (never legacy useToast).
 *
 * HONESTY (DESIGN-SYSTEM §0 #8): zero recoverable rounds → an honest EmptyState
 * ("No rounds to recover"), never a fabricated entry. Scores/holes/dates are read
 * straight from the saved draft; nothing is invented.
 *
 * Tokens ONLY: bg-canvas, text-text-*, font-fw-display/sans/mono, rounded-card,
 * shadow-soft, border-border-subtle, tabular-nums. No glass / warm-* / blur.
 * ========================================================================== */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { submitGolfRoundComprehensive } from '@/app/golf/actions/golf';
import { fairwayToast } from '@/components/fairway';
import type { HoleStats } from '@/lib/types/golf';
import {
  getPendingRounds as getModernPendingRounds,
  deleteOfflineRound as deleteModernOfflineRound,
  type OfflineRound as ModernOfflineRound,
} from '@/lib/offline/indexed-db';
import { clearEmergencySave } from '@/lib/utils/emergency-save';
import { Flag, ArrowLeft } from 'lucide-react';
import { ViewHeader, Surface, Button, EmptyState, InlineNotice } from '@/components/fairway';

// Legacy IndexedDB access kept for older locally saved drafts
const LEGACY_DB_NAME = 'golf_offline_db';
const ROUNDS_STORE = 'offline_rounds';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Emergency save localStorage key prefix (must match emergency-save.ts)
const EMERGENCY_SAVE_PREFIX = 'golf_emergency_save';
const EMERGENCY_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

type StorageSource = 'legacy-indexeddb' | 'modern-indexeddb' | 'localstorage';

interface OfflineRoundData {
  id: string;
  playerId: string;
  storageSource: StorageSource;
  serverRoundId?: string;
  draftData: {
    step: string;
    roundId?: string;
    setupData: {
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
    };
    holes: Array<{ number: number; par: number; yardage: number; score: number | null }>;
    completedHoleStats: HoleStats[];
    currentHoleIndex: number;
    inProgressShots?: Record<number, unknown[]>;
    submissionIntent?: string;
  };
  timestamp: number;
}

function hasRecoverableStats(round: OfflineRoundData): boolean {
  const completedHoleStats = round.draftData?.completedHoleStats;
  if (!Array.isArray(completedHoleStats)) {
    return false;
  }

  return completedHoleStats.some(
    (hole): hole is HoleStats => hole != null && typeof hole === 'object' && 'score' in hole && hole.score > 0
  );
}

function isCompletedRoundError(message?: string): boolean {
  if (typeof message !== 'string') {
    return false;
  }

  const normalized = message.toLowerCase();
  return normalized.includes('already been completed')
    || normalized.includes('already been submitted')
    || normalized.includes('may have already been completed');
}

function getExistingRoundId(round: OfflineRoundData): string | undefined {
  const explicitRoundId = typeof round.draftData.roundId === 'string' && round.draftData.roundId.length > 0
    ? round.draftData.roundId
    : undefined;
  if (round.serverRoundId) {
    return round.serverRoundId;
  }
  if (explicitRoundId) {
    return explicitRoundId;
  }
  if (round.id.startsWith('localStorage_')) {
    const localId = round.id.replace('localStorage_', '');
    return localId !== 'new' ? localId : undefined;
  }
  return UUID_PATTERN.test(round.id) ? round.id : undefined;
}

function getRoundDedupKey(round: OfflineRoundData): string {
  const existingRoundId = getExistingRoundId(round);
  if (existingRoundId) {
    return `server:${existingRoundId}`;
  }

  const completedCount = round.draftData.completedHoleStats.filter(
    (hole): hole is HoleStats => hole != null && typeof hole === 'object' && 'score' in hole && hole.score > 0
  ).length;
  const totalScore = round.draftData.completedHoleStats
    .filter((hole): hole is HoleStats => hole != null && typeof hole === 'object' && 'score' in hole && hole.score > 0)
    .reduce((sum, hole) => sum + hole.score, 0);

  return [
    round.draftData.setupData.courseName || 'unknown-course',
    round.draftData.setupData.roundDate || 'unknown-date',
    round.draftData.setupData.roundType || 'unknown-type',
    completedCount,
    totalScore,
  ].join('|');
}

function openLegacyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Failed to open IndexedDB'));
  });
}

async function getAllLegacyOfflineRounds(): Promise<OfflineRoundData[]> {
  const db = await openLegacyDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ROUNDS_STORE, 'readonly');
    const store = transaction.objectStore(ROUNDS_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(
      (request.result || []).map((round: Omit<OfflineRoundData, 'storageSource'>) => ({
        ...round,
        storageSource: 'legacy-indexeddb',
      }))
    );
    request.onerror = () => reject(new Error('Failed to read rounds'));
  });
}

async function deleteLegacyOfflineRoundById(roundId: string): Promise<void> {
  const db = await openLegacyDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ROUNDS_STORE, 'readwrite');
    const store = transaction.objectStore(ROUNDS_STORE);
    store.delete(roundId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to delete'));
  });
}

/**
 * Scan localStorage for emergency saves and convert them to OfflineRoundData format.
 * This is a fallback for when IndexedDB data is unavailable (e.g. cleared by browser,
 * different storage partition) but the synchronous localStorage emergency save survived.
 */
function getEmergencySavesFromLocalStorage(): OfflineRoundData[] {
  const results: OfflineRoundData[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(EMERGENCY_SAVE_PREFIX)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        // Skip expired saves
        if (Date.now() - parsed.timestamp > EMERGENCY_MAX_AGE_MS) continue;
        // Must have completed hole stats with actual scores
        if (!parsed.completedHoleStats || !Array.isArray(parsed.completedHoleStats)) continue;
        const completedCount = parsed.completedHoleStats.filter(
          (h: HoleStats | null) => h != null && typeof h === 'object' && 'score' in h && h.score > 0
        ).length;
        if (completedCount === 0) continue;

        // Convert to OfflineRoundData format
        const roundId = key.replace(`${EMERGENCY_SAVE_PREFIX}_`, '') || `ls_${Date.now()}_${i}`;
        results.push({
          id: `localStorage_${roundId}`,
          playerId: '',
          storageSource: 'localstorage',
          draftData: {
            step: 'tracking',
            roundId: roundId !== 'new' ? roundId : undefined,
            setupData: parsed.setupData,
            holes: parsed.holes || [],
            completedHoleStats: parsed.completedHoleStats,
            currentHoleIndex: parsed.currentHoleIndex ?? 0,
            inProgressShots: parsed.inProgressShotsByHole,
            submissionIntent: parsed.submissionIntent,
          },
          timestamp: parsed.timestamp,
        });
      } catch {
        // Skip malformed entries
      }
    }
  } catch {
    // localStorage unavailable
  }
  return results;
}

function mapModernPendingRound(round: ModernOfflineRound): OfflineRoundData | null {
  const draftData = round.draftData as Partial<OfflineRoundData['draftData']> | undefined;
  if (!draftData?.setupData || !Array.isArray(draftData.completedHoleStats)) {
    return null;
  }

  return {
    id: round.id,
    playerId: round.playerId,
    storageSource: 'modern-indexeddb',
    serverRoundId: round.serverRoundId,
    draftData: {
      step: typeof draftData.step === 'string' ? draftData.step : 'tracking',
      roundId: typeof draftData.roundId === 'string' ? draftData.roundId : undefined,
      setupData: {
        courseName: draftData.setupData.courseName || '',
        courseCity: draftData.setupData.courseCity || '',
        courseState: draftData.setupData.courseState || '',
        courseRating: draftData.setupData.courseRating || '',
        courseSlope: draftData.setupData.courseSlope || '',
        teesPlayed: draftData.setupData.teesPlayed || '',
        roundType: draftData.setupData.roundType || 'practice',
        roundDate: draftData.setupData.roundDate || '',
        qualifierId: draftData.setupData.qualifierId,
        qualifierRoundNumber: draftData.setupData.qualifierRoundNumber,
      },
      holes: Array.isArray(draftData.holes) ? draftData.holes : [],
      completedHoleStats: draftData.completedHoleStats,
      currentHoleIndex: typeof draftData.currentHoleIndex === 'number' ? draftData.currentHoleIndex : 0,
      inProgressShots: draftData.inProgressShots,
      submissionIntent: typeof draftData.submissionIntent === 'string' ? draftData.submissionIntent : undefined,
    },
    timestamp: round.timestamp,
  };
}

export interface FairwayRecoverRoundProps {
  playerId: string;
}

const ROUNDS_HREF = '/golf/dashboard/rounds';

function formatRoundDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function FairwayRecoverRound({ playerId }: FairwayRecoverRoundProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rounds, setRounds] = useState<OfflineRoundData[]>([]);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState<string | null>(null);
  const [error, setError] = useState('');
  const openedFromSubmitFailure = searchParams.get('from') === 'submit';

  useEffect(() => {
    Promise.allSettled([
      getAllLegacyOfflineRounds(),
      getModernPendingRounds().then(allRounds => allRounds.map(mapModernPendingRound).filter(Boolean) as OfflineRoundData[]),
    ])
      .then(([legacyResult, modernResult]) => {
        const legacyRounds = legacyResult.status === 'fulfilled' ? legacyResult.value : [];
        const modernRounds = modernResult.status === 'fulfilled' ? modernResult.value : [];
        const emergencySaves = getEmergencySavesFromLocalStorage();
        const dedupedRounds: OfflineRoundData[] = [];
        const seenKeys = new Set<string>();

        for (const round of [...modernRounds, ...legacyRounds, ...emergencySaves]) {
          if (!hasRecoverableStats(round)) {
            continue;
          }

          const dedupKey = getRoundDedupKey(round);
          if (seenKeys.has(dedupKey)) {
            continue;
          }

          seenKeys.add(dedupKey);
          dedupedRounds.push(round);
        }

        if (dedupedRounds.length === 0 && legacyResult.status === 'rejected' && modernResult.status === 'rejected') {
          setError('Could not access offline storage. Make sure you are using the same browser and device.');
          return;
        }

        setRounds(dedupedRounds);
      })
      .catch(() => {
        const emergencySaves = getEmergencySavesFromLocalStorage();
        if (emergencySaves.length > 0) {
          setRounds(emergencySaves.filter(hasRecoverableStats));
        } else {
          setError('Could not access offline storage. Make sure you are using the same browser and device.');
        }
      })
      .finally(() => setLoading(false));
  }, [playerId]);

  const cleanupRecoveredRound = async (round: OfflineRoundData): Promise<void> => {
    const existingRoundId = getExistingRoundId(round);
    clearEmergencySave(existingRoundId ?? null);

    if (round.storageSource === 'localstorage') {
      const lsKey = round.id.replace('localStorage_', '');
      try { localStorage.removeItem(`${EMERGENCY_SAVE_PREFIX}_${lsKey}`); } catch { /* ignore */ }
      return;
    }

    if (round.storageSource === 'modern-indexeddb') {
      await deleteModernOfflineRound(round.id);
      return;
    }

    await deleteLegacyOfflineRoundById(round.id);
  };

  const handleRecover = async (round: OfflineRoundData) => {
    setRecovering(round.id);
    setError('');

    try {
      const draft = round.draftData;
      const stats = draft.completedHoleStats.filter(
        (h): h is HoleStats => h != null && typeof h === 'object' && 'score' in h && h.score > 0
      );

      if (stats.length === 0) {
        setError('No completed hole data found in this draft.');
        setRecovering(null);
        return;
      }

      const roundData = {
        courseName: draft.setupData.courseName,
        courseCity: draft.setupData.courseCity || undefined,
        courseState: draft.setupData.courseState || undefined,
        courseRating: draft.setupData.courseRating ? parseFloat(draft.setupData.courseRating) : undefined,
        courseSlope: draft.setupData.courseSlope ? parseInt(draft.setupData.courseSlope) : undefined,
        teesPlayed: draft.setupData.teesPlayed || undefined,
        roundType: draft.setupData.roundType,
        roundDate: draft.setupData.roundDate,
        qualifierId: draft.setupData.qualifierId || undefined,
        qualifierRoundNumber: draft.setupData.qualifierRoundNumber || undefined,
        holes: stats,
      };

      const existingRoundId = getExistingRoundId(round);
      let result = await submitGolfRoundComprehensive(roundData, existingRoundId);

      if (!result.success && existingRoundId && /round not found or you do not have permission/i.test(result.error)) {
        result = await submitGolfRoundComprehensive(roundData);
      }

      if (!result.success) {
        if (existingRoundId && isCompletedRoundError(result.error)) {
          await cleanupRecoveredRound(round).catch(() => {});
          fairwayToast.success('Round was already submitted. Opening the saved round.');
          router.push(`/golf/dashboard/rounds/${existingRoundId}`);
          return;
        }

        setError(result.error || 'Failed to recover round.');
        setRecovering(null);
        return;
      }

      // Clean up the offline data
      try {
        await cleanupRecoveredRound(round);
      } catch {
        // Non-critical
      }

      fairwayToast.success('Round recovered successfully!');
      router.push(`/golf/dashboard/rounds/${result.data.roundId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed. Please try again.');
      setRecovering(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-lg items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex items-center justify-center gap-2" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-accent-500 animate-pulse" style={{ animationDelay: '0ms' }} />
            <span className="h-2.5 w-2.5 rounded-full bg-accent-500 animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="h-2.5 w-2.5 rounded-full bg-accent-500 animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="font-fw-sans text-body-sm text-text-tertiary">Scanning offline storage…</p>
        </div>
      </div>
    );
  }

  const count = rounds.length;

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="Recover Round"
        title="Restore an unfinished round."
        description="Drafts saved on this device when a submit could not finish appear here — recover one to post it without re-entering anything."
        meta={
          count > 0 ? (
            <span className="tabular-nums">{count} recoverable {count === 1 ? 'round' : 'rounds'}</span>
          ) : undefined
        }
      />

      <div className="mt-8 flex flex-col gap-4">
        {openedFromSubmitFailure && (
          <InlineNotice tone="warning" title="Your round was saved locally">
            Submit could not finish against the server, so your round was kept on this device. Recover it
            below without re-entering anything.
          </InlineNotice>
        )}

        {error && (
          <InlineNotice tone="danger" title="Couldn’t recover that round">
            {error}
          </InlineNotice>
        )}

        {count === 0 ? (
          <Surface elevation="shadow" padding="lg">
            <EmptyState
              icon={Flag}
              title="No rounds to recover"
              description="There are no recoverable rounds in this browser’s offline storage. This page only finds drafts saved on the same device and browser that tracked the round."
              action={
                <Button variant="secondary" size="sm" onClick={() => router.push(ROUNDS_HREF)}>
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  <span>Back to Rounds</span>
                </Button>
              }
            />
          </Surface>
        ) : (
          <div className="flex flex-col gap-3">
            {rounds.map((round) => {
              const draft = round.draftData;
              const completedCount = draft.completedHoleStats.filter(
                (h): h is HoleStats => h != null && typeof h === 'object' && 'score' in h && h.score > 0
              ).length;
              const totalScore = draft.completedHoleStats
                .filter((h): h is HoleStats => h != null && typeof h === 'object' && 'score' in h && h.score > 0)
                .reduce((sum, h) => sum + h.score, 0);
              const savedAt = new Date(round.timestamp);
              const isRecovering = recovering === round.id;
              const roundDateLabel = formatRoundDate(draft.setupData.roundDate);

              return (
                <Surface key={round.id} elevation="shadow" padding="md" className="flex flex-col gap-4">
                  {/* Header — course + round type */}
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 truncate font-fw-sans text-body-lg font-medium text-text-primary">
                      {draft.setupData.courseName || 'Unknown course'}
                    </h3>
                    <span className="flex-shrink-0 font-fw-sans text-caption capitalize text-text-tertiary">
                      {draft.setupData.roundType}
                    </span>
                  </div>

                  {/* The draft's saved progress — holes / score / date */}
                  <div className="grid grid-cols-3 gap-3 rounded-fw-md bg-surface-sunken px-4 py-3">
                    <ScoreCell label="Holes">
                      <span className="font-fw-mono text-body-lg font-medium tabular-nums text-text-primary">
                        {completedCount}
                      </span>
                    </ScoreCell>
                    <ScoreCell label="Score">
                      <span className="font-fw-mono text-body-lg font-medium tabular-nums text-text-primary">
                        {totalScore > 0 ? totalScore : '—'}
                      </span>
                    </ScoreCell>
                    <ScoreCell label="Round date">
                      <span className="font-fw-sans text-body-sm font-medium text-text-primary">
                        {roundDateLabel || '—'}
                      </span>
                    </ScoreCell>
                  </div>

                  <p className="font-fw-sans text-caption text-text-tertiary">
                    Last saved {savedAt.toLocaleString()}
                  </p>

                  {/* Action — recover this draft */}
                  <Button
                    variant="primary"
                    onClick={() => handleRecover(round)}
                    disabled={isRecovering || recovering !== null}
                    className="w-full"
                  >
                    {isRecovering ? 'Recovering…' : 'Recover this round'}
                  </Button>
                </Surface>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </span>
      {children}
    </div>
  );
}
