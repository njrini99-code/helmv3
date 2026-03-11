'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { submitGolfRoundComprehensive } from '@/app/golf/actions/golf';
import { useToast } from '@/components/ui/toast';
import type { HoleStats } from '@/lib/types/golf';

// Direct IndexedDB access to read offline round data
const DB_NAME = 'golf_offline_db';
const ROUNDS_STORE = 'offline_rounds';

// Emergency save localStorage key prefix (must match emergency-save.ts)
const EMERGENCY_SAVE_PREFIX = 'golf_emergency_save';
const EMERGENCY_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface OfflineRoundData {
  id: string;
  playerId: string;
  draftData: {
    step: string;
    setupData: {
      courseName: string;
      courseCity: string;
      courseState: string;
      courseRating: string;
      courseSlope: string;
      teesPlayed: string;
      roundType: 'practice' | 'tournament' | 'qualifier';
      roundDate: string;
    };
    holes: Array<{ number: number; par: number; yardage: number; score: number | null }>;
    completedHoleStats: HoleStats[];
    currentHoleIndex: number;
    inProgressShots?: Record<number, unknown[]>;
  };
  timestamp: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Failed to open IndexedDB'));
  });
}

async function getAllOfflineRounds(): Promise<OfflineRoundData[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ROUNDS_STORE, 'readonly');
    const store = transaction.objectStore(ROUNDS_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(new Error('Failed to read rounds'));
  });
}

async function deleteOfflineRoundById(roundId: string): Promise<void> {
  const db = await openDatabase();
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
          draftData: {
            step: 'tracking',
            setupData: parsed.setupData,
            holes: parsed.holes || [],
            completedHoleStats: parsed.completedHoleStats,
            currentHoleIndex: parsed.currentHoleIndex ?? 0,
            inProgressShots: parsed.inProgressShotsByHole,
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

export default function RecoverRoundClient({ playerId }: { playerId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [rounds, setRounds] = useState<OfflineRoundData[]>([]);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAllOfflineRounds()
      .then(allRounds => {
        // Filter to rounds that have completed hole stats
        const recoverable = allRounds.filter(r => {
          const draft = r.draftData;
          if (!draft?.completedHoleStats) return false;
          const completedCount = draft.completedHoleStats.filter(
            (h): h is HoleStats => h != null && typeof h === 'object' && 'score' in h && h.score > 0
          ).length;
          return completedCount > 0;
        });

        // Also check localStorage emergency saves as a fallback source
        const emergencySaves = getEmergencySavesFromLocalStorage();
        // Deduplicate: only add localStorage saves that don't already exist in IndexedDB
        const indexedDbIds = new Set(recoverable.map(r => r.id));
        const uniqueEmergencySaves = emergencySaves.filter(es => !indexedDbIds.has(es.id));

        setRounds([...recoverable, ...uniqueEmergencySaves]);
      })
      .catch(() => {
        // IndexedDB failed — fall back to localStorage-only recovery
        const emergencySaves = getEmergencySavesFromLocalStorage();
        if (emergencySaves.length > 0) {
          setRounds(emergencySaves);
        } else {
          setError('Could not access offline storage. Make sure you are using the same browser and device.');
        }
      })
      .finally(() => setLoading(false));
  }, [playerId]);

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
        holes: stats,
      };

      // Submit as a new round (the old one was deleted)
      const result = await submitGolfRoundComprehensive(roundData);

      if (!result.success) {
        setError(result.error || 'Failed to recover round.');
        setRecovering(null);
        return;
      }

      // Clean up the offline data
      try {
        if (round.id.startsWith('localStorage_')) {
          // This was a localStorage emergency save — clean up the localStorage key
          const lsKey = round.id.replace('localStorage_', '');
          try { localStorage.removeItem(`${EMERGENCY_SAVE_PREFIX}_${lsKey}`); } catch { /* ignore */ }
        } else {
          await deleteOfflineRoundById(round.id);
        }
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
    <div className="min-h-full bg-transparent flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 sm:p-8">
          <h1 className="text-2xl font-semibold text-warm-900 mb-2">Recover Round</h1>
          <p className="text-warm-500 text-sm mb-6">
            Found {rounds.length} recoverable round{rounds.length !== 1 ? 's' : ''} in your browser&apos;s offline storage.
          </p>

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
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-warm-900">
                        {draft.setupData.courseName || 'Unknown Course'}
                      </h3>
                      <span className="text-xs text-warm-400 capitalize">
                        {draft.setupData.roundType}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-warm-500 mb-3">
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
  );
}
