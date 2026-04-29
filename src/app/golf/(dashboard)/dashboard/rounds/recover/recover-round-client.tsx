'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { submitGolfRoundComprehensive } from '@/app/golf/actions/golf';
import { useToast } from '@/components/ui/toast';
import type { HoleStats } from '@/lib/types/golf';
import {
  getPendingRounds as getModernPendingRounds,
  deleteOfflineRound as deleteModernOfflineRound,
  type OfflineRound as ModernOfflineRound
} from '@/lib/offline/indexed-db';
import { clearEmergencySave } from '@/lib/utils/emergency-save';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';

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

export default function RecoverRoundClient({ playerId }: { playerId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
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
          showToast('Round was already submitted. Opening the saved round.', 'success');
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

      showToast('Round recovered successfully!', 'success');
      router.push(`/golf/dashboard/rounds/${result.data.roundId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed. Please try again.');
      setRecovering(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="w-3 h-3 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="w-3 h-3 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="w-3 h-3 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-warm-500">Scanning offline storage...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-transparent">
      <MobileNavHeader
        title="Recover Round"
        subtitle="Restore from offline storage"
        backHref="/golf/dashboard/rounds"
        backLabel="Rounds"
      />
      <div className="flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 sm:p-8">
          <p className="text-warm-500 text-sm mb-6">
            Found {rounds.length} recoverable round{rounds.length !== 1 ? 's' : ''} in your browser&apos;s offline storage.
          </p>

          {openedFromSubmitFailure && (
            <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
              Your round was saved locally because submit could not finish against the server. Recover it here without re-entering anything.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          {rounds.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 20a8 8 0 100-16 8 8 0 000 16z" />
                </svg>
              </div>
              <p className="text-warm-600 font-medium mb-1">No recoverable rounds found</p>
              <p className="text-warm-400 text-sm mb-4">
                This must be opened on the same device and browser that was used to track the round.
              </p>
              <button
                onClick={() => router.push('/golf/dashboard/rounds')}
                className="px-4 py-2 bg-warm-100 text-warm-700 rounded-xl text-sm font-medium hover:bg-warm-200 transition-colors"
              >
                Back to Rounds
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {rounds.map(round => {
                const draft = round.draftData;
                const completedCount = draft.completedHoleStats.filter(
                  (h): h is HoleStats => h != null && typeof h === 'object' && 'score' in h && h.score > 0
                ).length;
                const totalScore = draft.completedHoleStats
                  .filter((h): h is HoleStats => h != null && typeof h === 'object' && 'score' in h && h.score > 0)
                  .reduce((sum, h) => sum + h.score, 0);
                const savedAt = new Date(round.timestamp);
                const isRecovering = recovering === round.id;

                return (
                  <div
                    key={round.id}
                    className="bg-white/60 border border-warm-200/50 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <h3 className="font-medium text-warm-900 truncate min-w-0">
                        {draft.setupData.courseName || 'Unknown Course'}
                      </h3>
                      <span className="text-xs text-warm-400 capitalize flex-shrink-0">
                        {draft.setupData.roundType}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-warm-500 mb-3">
                      <span>{completedCount} holes completed</span>
                      {totalScore > 0 && <span>Score: {totalScore}</span>}
                      <span>{draft.setupData.roundDate}</span>
                    </div>
                    <p className="text-xs text-warm-400 mb-3">
                      Last saved: {savedAt.toLocaleString()}
                    </p>
                    <button
                      onClick={() => handleRecover(round)}
                      disabled={isRecovering || recovering !== null}
                      className="w-full py-2.5 rounded-xl bg-primary-600 text-white font-medium text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isRecovering ? 'Recovering...' : 'Recover This Round'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
