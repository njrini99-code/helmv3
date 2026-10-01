import type { TerminalRoundSubmissionData } from '@/app/golf/actions/round-drafts';
import { getFailedRounds, getPendingRounds, type OfflineRound as QueuedRound } from '@/lib/offline/indexed-db';
import { getRoundRecoverySnapshots, type RoundRecoverySnapshot } from '@/lib/offline/shot-storage';
import type { HoleStats } from '@/lib/types/golf';
import type { ChRoundType } from '../../../data/rounds-shape';

/**
 * What this device holds of a round the server may not have, read the way Fairway's recovery screen reads it
 * (`FairwayRecoverRound`, which stays until Fairway is retired: its tests pin its source, so this is a port, not a
 * move). Four stores, one round: the synchronous emergency save in localStorage, the recovery journal and the failed
 * submit queue in IndexedDB, and the old `golf_offline_db`. A round is shown once however many stores hold it.
 *
 * Browser storage belongs to the device, not the account, so a copy is offered only to the player who made it (swap
 * audit R-5, security review): a shared phone must never show another golfer's shots, nor let a restore create their
 * round under this account.
 */

export type ChDeviceSource = 'recovery-cache' | 'modern-indexeddb' | 'legacy-indexeddb' | 'localstorage';

/** The saved draft, in the shape every store is mapped to. */
export interface ChDeviceDraft {
  step: string;
  roundId?: string;
  setupData: {
    courseName: string;
    courseCity: string;
    courseState: string;
    courseRating: string;
    courseSlope: string;
    teesPlayed: string;
    roundType: ChRoundType;
    roundDate: string;
    qualifierId?: string;
    qualifierRoundNumber?: number;
  };
  holes: Array<{ number: number; par: number; yardage: number; score: number | null }>;
  completedHoleStats: HoleStats[];
  currentHoleIndex: number;
  inProgressShots?: Record<number, unknown[]>;
  submissionIntent?: string;
  terminalSubmission?: TerminalRoundSubmissionData;
}

/** One record in one store. */
export interface ChDeviceCopy {
  id: string;
  playerId: string;
  source: ChDeviceSource;
  /** The server's id for the round, once one is known (the failed-submit queue records it). */
  serverRoundId?: string;
  /** The id this copy is stored under, as its store keys it: null for a new round's draft. Unset where the copy's own id is the key. */
  storageId?: string | null;
  /** The sync queue's status; set only for the failed-submit queue. */
  syncStatus?: QueuedRound['syncStatus'];
  /** Why the queue's last attempt failed, as the engine recorded it. */
  syncError?: string;
  draftData: ChDeviceDraft;
  timestamp: number;
}

/** A round on the device, once, with every copy of it. */
export interface ChRecoverRound {
  /** Identity for the list: the server round's id when it has one, else the round's course, day, type and score. */
  key: string;
  /** The newest copy: what a restore sends. */
  primary: ChDeviceCopy;
  /** Every copy of the round, the primary included. A discard clears all of them, or the next scan finds another. */
  copies: ChDeviceCopy[];
  course: string;
  type: ChRoundType;
  /** The round's day (`setupData.roundDate`, ISO), or ''. */
  date: string;
  holesDone: number;
  /** 9 or 18 when the draft has its holes, else null. */
  holesTotal: number | null;
  /** The strokes of the holes played, or null before one is scored. */
  score: number | null;
  savedAt: number;
  /** The server round this one belongs to, when it has one. A round with none exists only on this device. */
  roundId: string | null;
  /** Every hole is scored and the exact final submission is kept: a restore submits it. Otherwise it opens the round to finish. */
  finished: boolean;
  /** Sits in the sync queue, so the sync engine can send it again. */
  queued: boolean;
  /** The sync queue gave up on it, for now. */
  syncFailed: boolean;
  syncError: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** The legacy database `FairwayRecoverRound` also reads (older drafts). */
const LEGACY_DB_NAME = 'golf_offline_db';
const LEGACY_ROUNDS_STORE = 'offline_rounds';
/** Must match emergency-save.ts. */
const EMERGENCY_SAVE_PREFIX = 'golf_emergency_save';

const isScored = (hole: unknown): hole is HoleStats =>
  hole != null && typeof hole === 'object' && 'score' in hole && (hole as HoleStats).score > 0;

export const scoredHoles = (copy: ChDeviceCopy): HoleStats[] => (Array.isArray(copy.draftData?.completedHoleStats) ? copy.draftData.completedHoleStats.filter(isScored) : []);

/** Whether the copy holds anything a player did: a scored hole, or a shot on the hole in progress. */
export function hasRecoverableProgress(copy: ChDeviceCopy): boolean {
  const hasInProgressShot = Object.values(copy.draftData?.inProgressShots ?? {}).some((shots) => Array.isArray(shots) && shots.length > 0);
  return scoredHoles(copy).length > 0 || hasInProgressShot;
}

/**
 * The id the copy is stored under, as `FairwayRecoverRound` finds it. This is a storage key, so it can be a new
 * round's `new_<player>` stand-in; use `serverRoundIdOf` for anything sent to the server.
 */
export function storedRoundId(copy: ChDeviceCopy): string | undefined {
  const explicit = typeof copy.draftData.roundId === 'string' && copy.draftData.roundId.length > 0 ? copy.draftData.roundId : undefined;
  if (copy.serverRoundId) return copy.serverRoundId;
  if (explicit) return explicit;
  if (copy.id.startsWith('localStorage_')) {
    const local = copy.id.replace('localStorage_', '');
    return local !== 'new' ? local : undefined;
  }
  return UUID_PATTERN.test(copy.id) ? copy.id : undefined;
}

/**
 * The server round this copy belongs to: its stored id when that is a real round id. A new round's draft is keyed
 * `new_<player>`, which names no round, and the server refuses it, so such a copy is a round with none yet.
 */
export function serverRoundIdOf(copy: ChDeviceCopy): string | undefined {
  const id = storedRoundId(copy);
  return id && UUID_PATTERN.test(id) ? id : undefined;
}

/** The key an emergency save or recovery snapshot of this copy is stored under (null for a new round's draft). */
export function localKeyOf(copy: ChDeviceCopy): string | null {
  return copy.storageId !== undefined ? copy.storageId : (storedRoundId(copy) ?? null);
}

function dedupKey(copy: ChDeviceCopy): string {
  const id = serverRoundIdOf(copy);
  if (id) return `server:${id}`;
  const scored = scoredHoles(copy);
  return [
    copy.draftData.setupData.courseName || 'unknown-course',
    copy.draftData.setupData.roundDate || 'unknown-date',
    copy.draftData.setupData.roundType || 'unknown-type',
    scored.length,
    scored.reduce((sum, hole) => sum + hole.score, 0),
  ].join('|');
}

/** Whether a restore of this copy submits the finished round (true), or opens it to continue (false). */
export function isFinishedSubmit(copy: ChDeviceCopy): boolean {
  const draft = copy.draftData;
  const allHolesScored = draft.holes.length > 0 && scoredHoles(copy).length === draft.holes.length && draft.holes.every((hole) => hole.score != null);
  return draft.submissionIntent === 'submit' && allHolesScored && !!serverRoundIdOf(copy) && !!draft.terminalSubmission;
}

function toRecoverRound(group: ChDeviceCopy[]): ChRecoverRound {
  const primary = group[0]!;
  const draft = primary.draftData;
  const scored = scoredHoles(primary);
  const total = draft.holes.length;
  const queuedCopies = group.filter((copy) => copy.source === 'modern-indexeddb');
  const failed = queuedCopies.find((copy) => copy.syncStatus === 'failed');
  return {
    key: dedupKey(primary),
    primary,
    copies: group,
    course: draft.setupData.courseName?.trim() || 'Unknown course',
    type: draft.setupData.roundType || 'practice',
    date: draft.setupData.roundDate || '',
    holesDone: scored.length,
    holesTotal: total === 9 || total === 18 ? total : null,
    score: scored.length > 0 ? scored.reduce((sum, hole) => sum + hole.score, 0) : null,
    savedAt: primary.timestamp,
    roundId: group.map(serverRoundIdOf).find(Boolean) ?? null,
    finished: isFinishedSubmit(primary),
    queued: queuedCopies.length > 0,
    syncFailed: !!failed,
    syncError: failed?.syncError ?? null,
  };
}

/**
 * The rounds to offer `playerId`, newest first: another player's copies and copies with no player work in them are
 * dropped, and copies of the same round (by server id, else by what was played) collapse into one that remembers
 * them all. `copies` come in precedence order (recovery journal, queue, legacy database, emergency saves) and a tie
 * in time keeps that order.
 */
export function buildRecoverRounds(copies: ChDeviceCopy[], playerId: string): ChRecoverRound[] {
  const groups = new Map<string, ChDeviceCopy[]>();
  for (const copy of [...copies].sort((left, right) => right.timestamp - left.timestamp)) {
    if (copy.playerId !== playerId) continue;
    if (!hasRecoverableProgress(copy)) continue;
    const key = dedupKey(copy);
    const group = groups.get(key);
    if (group) group.push(copy);
    else groups.set(key, [copy]);
  }
  return [...groups.values()].map(toRecoverRound);
}

// ── Readers: one per store, each mapping its records to `ChDeviceCopy` ──

const blankSetup = (): ChDeviceDraft['setupData'] => ({ courseName: '', courseCity: '', courseState: '', courseRating: '', courseSlope: '', teesPlayed: '', roundType: 'practice', roundDate: '' });

/** A stored record (the failed-submit queue's, or the old database's, which has the same shape) as a copy. */
function fromStored(round: QueuedRound, source: 'modern-indexeddb' | 'legacy-indexeddb'): ChDeviceCopy | null {
  const draft = round.draftData as Partial<ChDeviceDraft> | undefined;
  if (!draft?.setupData || !Array.isArray(draft.completedHoleStats)) return null;
  const queued = source === 'modern-indexeddb';
  return {
    id: round.id,
    playerId: round.playerId,
    source,
    serverRoundId: round.serverRoundId,
    ...(queued ? { syncStatus: round.syncStatus, syncError: round.error } : {}),
    draftData: {
      step: typeof draft.step === 'string' ? draft.step : 'tracking',
      roundId: typeof draft.roundId === 'string' ? draft.roundId : undefined,
      setupData: {
        courseName: draft.setupData.courseName || '',
        courseCity: draft.setupData.courseCity || '',
        courseState: draft.setupData.courseState || '',
        courseRating: draft.setupData.courseRating || '',
        courseSlope: draft.setupData.courseSlope || '',
        teesPlayed: draft.setupData.teesPlayed || '',
        roundType: draft.setupData.roundType || 'practice',
        roundDate: draft.setupData.roundDate || '',
        qualifierId: draft.setupData.qualifierId,
        qualifierRoundNumber: draft.setupData.qualifierRoundNumber,
      },
      holes: Array.isArray(draft.holes) ? draft.holes : [],
      completedHoleStats: draft.completedHoleStats,
      currentHoleIndex: typeof draft.currentHoleIndex === 'number' ? draft.currentHoleIndex : 0,
      inProgressShots: draft.inProgressShots,
      submissionIntent: typeof draft.submissionIntent === 'string' ? draft.submissionIntent : undefined,
      terminalSubmission: draft.terminalSubmission,
    },
    timestamp: round.timestamp,
  };
}

function fromSnapshot(snapshot: RoundRecoverySnapshot): ChDeviceCopy {
  const data = snapshot.data;
  return {
    id: `recoveryCache_${snapshot.key}`,
    playerId: data.playerId,
    source: 'recovery-cache',
    serverRoundId: data.roundId ?? undefined,
    storageId: data.roundId,
    draftData: {
      step: 'tracking',
      roundId: data.roundId ?? undefined,
      setupData: { ...blankSetup(), ...data.setupData },
      holes: (data.holes ?? []).map((hole) => ({ number: hole.number, par: hole.par, yardage: hole.yardage, score: hole.score ?? null })),
      completedHoleStats: data.completedHoleStats,
      currentHoleIndex: data.currentHoleIndex,
      inProgressShots: data.inProgressShotsByHole,
      submissionIntent: data.submissionIntent,
      terminalSubmission: data.terminalSubmission,
    },
    timestamp: data.timestamp,
  };
}

/**
 * The emergency saves in localStorage: the fallback that survives when IndexedDB was cleared or sits in another
 * storage partition. Active rounds never expire; a save with a timestamp and a player is enough, and one with no
 * player work in it is skipped.
 */
export function readEmergencySaves(): ChDeviceCopy[] {
  const found: ChDeviceCopy[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(EMERGENCY_SAVE_PREFIX)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!Number.isFinite(parsed.timestamp) || typeof parsed.playerId !== 'string') continue;
        const completedHoleStats = Array.isArray(parsed.completedHoleStats) ? parsed.completedHoleStats : [];
        const hasProgress =
          completedHoleStats.some(isScored) || Object.values(parsed.inProgressShotsByHole ?? {}).some((shots) => Array.isArray(shots) && shots.length > 0);
        if (!hasProgress) continue;
        const storageId = key.replace(`${EMERGENCY_SAVE_PREFIX}_`, '') || `ls_${Date.now()}_${i}`;
        found.push({
          id: `localStorage_${storageId}`,
          playerId: parsed.playerId,
          source: 'localstorage',
          storageId,
          draftData: {
            step: 'tracking',
            roundId: storageId !== 'new' ? storageId : undefined,
            setupData: { ...blankSetup(), ...(parsed.setupData && typeof parsed.setupData === 'object' ? parsed.setupData : {}) },
            holes: Array.isArray(parsed.holes) ? parsed.holes : [],
            completedHoleStats,
            currentHoleIndex: parsed.currentHoleIndex ?? 0,
            inProgressShots: parsed.inProgressShotsByHole,
            submissionIntent: parsed.submissionIntent,
            terminalSubmission: parsed.terminalSubmission,
          },
          timestamp: parsed.timestamp,
        });
      } catch {
        // A malformed entry is skipped, not fatal.
      }
    }
  } catch {
    // localStorage is unavailable.
  }
  return found;
}

/**
 * Opens the old database without making one: a device that never had it would otherwise get an empty database
 * created by the read, so the open is aborted when it would have to upgrade.
 */
function openLegacyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME);
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Failed to open IndexedDB'));
  });
}

async function readLegacyRounds(): Promise<ChDeviceCopy[]> {
  const db = await openLegacyDatabase();
  try {
    const records = await new Promise<QueuedRound[]>((resolve, reject) => {
      const request = db.transaction(LEGACY_ROUNDS_STORE, 'readonly').objectStore(LEGACY_ROUNDS_STORE).getAll();
      request.onsuccess = () => resolve((request.result || []) as QueuedRound[]);
      request.onerror = () => reject(new Error('Failed to read rounds'));
    });
    return records.map((round) => fromStored(round, 'legacy-indexeddb')).filter((copy): copy is ChDeviceCopy => copy !== null);
  } finally {
    db.close();
  }
}

/** Removes one record of the old database by its id. Resolves when it is gone or was never there. */
export async function deleteLegacyRound(id: string, acknowledgedTimestamp?: number): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openLegacyDatabase();
  } catch {
    // No such database: nothing to remove.
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(LEGACY_ROUNDS_STORE, 'readwrite');
      const store = transaction.objectStore(LEGACY_ROUNDS_STORE);
      const read = store.get(id);
      read.onsuccess = () => {
        const current = read.result as { timestamp?: unknown } | undefined;
        if (!current) return;
        // After a confirmed save, a newer copy written in the meantime stays.
        if (acknowledgedTimestamp !== undefined && typeof current.timestamp === 'number' && current.timestamp > acknowledgedTimestamp) return;
        store.delete(id).onerror = () => reject(new Error('Failed to clear the legacy round'));
      };
      read.onerror = () => reject(new Error('Failed to read the legacy round'));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error('Failed to clear the legacy round'));
      transaction.onabort = () => reject(new Error('Clearing the legacy round was aborted'));
    });
  } finally {
    db.close();
  }
}

/** The stores, readable one at a time so a test (or a device where one fails) can stand in for each. */
export interface ChDeviceReaders {
  recoveryCache(): Promise<ChDeviceCopy[]>;
  queue(): Promise<ChDeviceCopy[]>;
  legacy(): Promise<ChDeviceCopy[]>;
  emergencySaves(): ChDeviceCopy[];
}

export const LIVE_DEVICE_READERS: ChDeviceReaders = {
  recoveryCache: async () => (await getRoundRecoverySnapshots()).map(fromSnapshot),
  queue: async () => {
    const [pending, failed] = await Promise.all([getPendingRounds(), getFailedRounds()]);
    const seen = new Set<string>();
    return [...pending, ...failed]
      .filter((round) => !seen.has(round.id) && (seen.add(round.id), true))
      .map((round) => fromStored(round, 'modern-indexeddb'))
      .filter((copy): copy is ChDeviceCopy => copy !== null);
  },
  legacy: readLegacyRounds,
  emergencySaves: readEmergencySaves,
};

export interface ChDeviceScan {
  rounds: ChRecoverRound[];
  /** No store could be read and nothing was found in the one that always can: the answer is unknown, not "none". */
  unreadable: boolean;
}

/**
 * Reads every store, tolerating each one's failure (a failed store is a store with nothing in it, as on Fairway's
 * screen), and builds the rounds for `playerId`. "Unreadable" is reported only when nothing was found and every
 * IndexedDB store failed: the emergency save in localStorage is read regardless, since it needs no database.
 */
export async function scanDevice(playerId: string, readers: ChDeviceReaders = LIVE_DEVICE_READERS): Promise<ChDeviceScan> {
  const [cache, queue, legacy] = await Promise.allSettled([readers.recoveryCache(), readers.queue(), readers.legacy()]);
  const ok = (result: PromiseSettledResult<ChDeviceCopy[]>) => (result.status === 'fulfilled' ? result.value : []);
  const rounds = buildRecoverRounds([...ok(cache), ...ok(queue), ...ok(legacy), ...readers.emergencySaves()], playerId);
  const unreadable = rounds.length === 0 && cache.status === 'rejected' && queue.status === 'rejected' && legacy.status === 'rejected';
  return { rounds, unreadable };
}
