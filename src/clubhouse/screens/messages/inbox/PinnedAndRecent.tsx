'use client';

import type { ChMessagesApi } from '../api/types';
import { type ChConv, pinnedThreads } from '../model';
import type { ReactNode } from 'react';
import { ListPresence } from '../../../ui/ListPresence';

/**
 * The rail's flat "Pinned" and "Recent" labels over rows (no cards on the rail; the phone draws cards). A label with no
 * rows under it is left out (MSG-123). Rows glide to their new places together when a filter changes and new ones fade in
 * (`arrive="inbox"`, MOT-LIST-4); `cut`: the leaving rows go in one frame.
 */
export function PinnedAndRecent({ api, list, row, cut = false }: { api: ChMessagesApi; list: ChConv[]; row: (c: ChConv) => ReactNode; cut?: boolean }) {
  const pinnedRows = api.pins ? pinnedThreads(list, api.pins.ids) : [];
  const recent = list.filter((c) => !pinnedRows.includes(c));
  return (
    <>
      {pinnedRows.length > 0 && (
        <section className="ch-ms-sec" aria-label="Pinned">
          <div className="ch-ms-sec__l">Pinned</div>
          <div className="ch-ms-sec__card">
            <ListPresence arrive="inbox" cut={cut}>
              {pinnedRows.map(row)}
            </ListPresence>
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section className="ch-ms-sec" aria-label="Recent">
          <div className="ch-ms-sec__l">Recent</div>
          <div className="ch-ms-sec__card">
            <ListPresence arrive="inbox" cut={cut}>
              {recent.map(row)}
            </ListPresence>
          </div>
        </section>
      )}
    </>
  );
}
