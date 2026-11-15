'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FORM_WINDOW_LABEL, SPAN_PARAM, type ChFormWindow } from '../../data/span';
import { usePushOnce } from '../../lib/nav-once';
import { Segmented } from '../../ui/Segmented';

/** The address for a window: this page and its other params, with `range=season` or `range=all` set, and removed for Last 10 (the default is never written). */
export function formWindowHref(pathname: string, search: string, w: ChFormWindow): string {
  const q = new URLSearchParams(search);
  if (w === 'last10') q.delete(SPAN_PARAM);
  else q.set(SPAN_PARAM, w);
  const s = q.toString();
  return s ? `${pathname}?${s}` : pathname;
}

const OPTIONS: ChFormWindow[] = ['last10', 'season', 'all'];

/**
 * Team scoring's switch, in the numbers' own card: Last 10, Season, All time, the choices Stats offers for this figure (prod audit
 * 2026-11-15, HOME-P-10). Last 10 is each player's newest ten rounds across seasons (Q-122), as Stats names that window; Season is
 * from 1 August in the team's zone. The choice lives in the address (`?range=season`, `?range=all`), so it survives a reload and can
 * be shared; the page reads again on the server for the new basis. The pill moves with the tap and stays on the choice while the
 * page loads.
 */
export function HomeSpanSwitch({ value: shown }: { value: ChFormWindow }) {
  const router = useRouter();
  const pushOnce = usePushOnce(router);
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<ChFormWindow | null>(null);
  const value = pending && chosen ? chosen : shown;
  return (
    <div className="ch-span" data-ch-span={value}>
      <Segmented<ChFormWindow>
        weight="filter"
        size="sm"
        label="Rounds shown"
        hook="home-span"
        value={value}
        onChange={(v) => {
          setChosen(v);
          // The address as it is when the tap lands (this page's own path and params), read here, not at render, so the switch needs nothing but the router.
          start(() => pushOnce(formWindowHref(window.location.pathname, window.location.search, v), { scroll: false }));
        }}
        options={OPTIONS.map((o) => ({ value: o, label: FORM_WINDOW_LABEL[o] }))}
      />
    </div>
  );
}
