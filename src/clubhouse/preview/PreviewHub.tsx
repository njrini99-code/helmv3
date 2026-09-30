'use client';

import { useMemo } from 'react';
import type { ChTeamHub } from '../data/hub';
import { parseHubTab, TeamHub } from '../screens/hub/TeamHub';
import type { ChHubWrites } from '../screens/hub/writes';

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 400));

/** Team Hub with fake writes for the dev preview: each lands after a beat, or fails (`?state=failwrites`). Nothing reaches the server. */
export function PreviewHub({ data, state, tab }: { data: ChTeamHub; state?: string; tab?: string }) {
  const fail = state === 'failwrites';
  const writes = useMemo<ChHubWrites>(() => {
    const r = () => wait(fail ? { success: false, error: 'Preview: this save is set to fail.' } : { success: true });
    return {
      reply: r,
      acknowledge: r,
      completeTask: r,
      uncompleteTask: r,
      openDocument: () => wait(fail ? { success: false } : { success: true, data: { url: 'about:blank' } }),
      postAnnouncement: () => wait(fail ? { success: false } : { success: true, data: { announcementId: 'new' } }),
      editAnnouncement: r,
      deleteAnnouncement: r,
      assignTask: r,
      deleteTask: r,
      planTrip: r,
      uploadDocument: r,
      deleteDocument: r,
    };
  }, [fail]);
  return <TeamHub data={data} writes={writes} initialTab={parseHubTab(tab, data.role)} viewerName={data.role === 'coach' ? 'Maya Reyes' : 'Theo Marchetti'} />;
}
