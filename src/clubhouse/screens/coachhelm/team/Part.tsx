'use client';

import { Suspense, use, type ReactNode } from 'react';
import type { ChTeamPart } from '../../../data/coachhelm-team-shape';

function Read<T>({ value, children }: { value: Promise<ChTeamPart<T>>; children: (p: ChTeamPart<T>) => ReactNode }) {
  return <>{children(use(value))}</>;
}

/** A part the hole doesn't wait on: a value, or a promise drawn in its own Suspense. Absent (flag off): nothing, never an empty card. */
export function Part<T>({ value, fallback, children }: { value: Promise<ChTeamPart<T>> | ChTeamPart<T> | undefined; fallback: ReactNode; children: (p: ChTeamPart<T>) => ReactNode }) {
  if (value == null) return null;
  if ('then' in value)
    return (
      <Suspense fallback={fallback}>
        <Read value={value}>{children}</Read>
      </Suspense>
    );
  return <>{children(value)}</>;
}
