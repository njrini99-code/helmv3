'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { ChResult, ChSetupPorts } from '../screens/rounds/setup/shape';
import { RoundSetup } from '../screens/rounds/setup/RoundSetup';
import { PREVIEW_SETUP_COURSES, PREVIEW_SETUP_QUALIFIERS, PREVIEW_SETUP_TEES, PREVIEW_SETUP_TODAY, previewTeeHoles } from './fixtures-setup';

const wait = <T,>(v: T, ms = 450) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const failed = (what: string): ChResult<never> => ({ ok: false, error: `Preview: ${what} is set to fail.` });

/**
 * Round setup with fake ports for the dev preview. `?state=` failcourses |
 * failtees | failholes | failstart make that read or the start fail;
 * noqualifiers and qualifiersfailed change the qualifier list. Start opens
 * the tracking preview. Nothing reaches the server.
 */
export function PreviewSetup({ state }: { state?: string }) {
  const router = useRouter();
  const ports = useMemo<ChSetupPorts>(
    () => ({
      listCourses: () => wait(state === 'failcourses' ? failed('the course library') : { ok: true, data: PREVIEW_SETUP_COURSES }),
      listTees: (id) => wait(state === 'failtees' ? failed('the tees') : { ok: true, data: PREVIEW_SETUP_TEES[id] ?? [] }),
      teeHoles: (id) => wait(state === 'failholes' ? failed('the scorecard') : { ok: true, data: previewTeeHoles(id) }),
      start: () => wait(state === 'failstart' ? failed('starting a round') : { ok: true, data: { roundId: 'preview-round' } }, 900),
    }),
    [state],
  );
  const qualifiers = state === 'noqualifiers' ? [] : state === 'qualifiersfailed' ? null : PREVIEW_SETUP_QUALIFIERS;
  return <RoundSetup ports={ports} qualifiers={qualifiers} today={PREVIEW_SETUP_TODAY} backHref="/clubhouse-preview/rounds" onStarted={() => router.push('/clubhouse-preview/track')} />;
}
