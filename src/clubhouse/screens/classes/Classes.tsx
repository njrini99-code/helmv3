'use client';

import { useMemo } from 'react';
import { useClassAwareness } from '../../shell/context';
import type { ChClassesPage } from '../../data/classes-shape';
import { ClassesView } from './ClassesView';
import { createLiveClassStatusWrites } from './class-status-writes';
import { createLiveClassesWrites } from './writes';

/** The live Classes: server data from the route and the real writes. Preview and tests render ClassesView with their own. */
export function Classes({ data, playerId, teamId }: { data: ChClassesPage; playerId: string; teamId: string }) {
  // P-10: with `class_awareness_v1` on the page also gets the Class status panel and its writes; off, nothing new is built.
  const aware = useClassAwareness();
  const writes = useMemo(() => createLiveClassesWrites({ playerId, teamId, term: data.term.label, classAwareness: aware }), [playerId, teamId, data.term.label, aware]);
  const statusWrites = useMemo(() => (aware ? createLiveClassStatusWrites({ playerId, teamId }) : undefined), [aware, playerId, teamId]);
  return <ClassesView data={data} writes={writes} statusWrites={statusWrites} />;
}
