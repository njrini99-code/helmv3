'use client';

import { useMemo } from 'react';
import type { ChClassesPage } from '../../data/classes-shape';
import { ClassesView } from './ClassesView';
import { createLiveClassesWrites } from './writes';

/** The live Classes: server data from the route and the real writes. Preview and tests render ClassesView with their own. */
export function Classes({ data, playerId, teamId }: { data: ChClassesPage; playerId: string; teamId: string }) {
  const writes = useMemo(() => createLiveClassesWrites({ playerId, teamId, term: data.term.label }), [playerId, teamId, data.term.label]);
  return <ClassesView data={data} writes={writes} />;
}
