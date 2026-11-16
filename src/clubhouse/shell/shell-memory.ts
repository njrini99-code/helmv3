'use client';

import { useEffect, useMemo } from 'react';
import type { ChShellData } from '../data/shell';

/** What the shell keeps across a failed read: the Resume accessory's round and the head coach's title. */
export type ChShellRemembered = Pick<ChShellData, 'roundInProgress' | 'viewerIsHeadCoach'>;

/**
 * The last answer each of those reads gave, per signed-in user and team, for as long as the app is open: the shell's data
 * arrives with every server render of the dashboard layout (a navigation into it, a refresh, a team switch), and a read
 * that failed on one render must not undo what the last one said. In memory only, never stored.
 */
const lastKnown = new Map<string, ChShellRemembered>();

/**
 * GAP-S-14: the shell as drawn. A read that failed this time (`shell.unknown`) is not an answer: the last value it had
 * stays, so a round in progress keeps its Resume and a head coach keeps the title. With nothing to keep, the loader's
 * fallback shows (no Resume, plain "Coach") but is not remembered, so the next read that answers decides.
 */
export function withLastKnown(shell: ChShellData, last: ChShellRemembered | undefined): ChShellData {
  const unknown = shell.unknown;
  if (!unknown?.length || !last) return shell;
  return {
    ...shell,
    ...(unknown.includes('roundInProgress') && last.roundInProgress !== undefined ? { roundInProgress: last.roundInProgress } : {}),
    ...(unknown.includes('viewerIsHeadCoach') && last.viewerIsHeadCoach !== undefined ? { viewerIsHeadCoach: last.viewerIsHeadCoach } : {}),
  };
}

/** What to remember after this render: each read that answered, and the older answer for one that failed. */
export function rememberShell(shell: ChShellData, last: ChShellRemembered | undefined): ChShellRemembered {
  const unknown = shell.unknown ?? [];
  return {
    roundInProgress: unknown.includes('roundInProgress') ? last?.roundInProgress : shell.roundInProgress,
    viewerIsHeadCoach: unknown.includes('viewerIsHeadCoach') ? last?.viewerIsHeadCoach : shell.viewerIsHeadCoach,
  };
}

/** The live shell's data with the last known values kept (ClubhouseShell). `key` is the signed-in user and team. */
export function useLastKnownShell(shell: ChShellData, key: string): ChShellData {
  const shown = useMemo(() => withLastKnown(shell, lastKnown.get(key)), [shell, key]);
  useEffect(() => {
    lastKnown.set(key, rememberShell(shell, lastKnown.get(key)));
  }, [shell, key]);
  return shown;
}
