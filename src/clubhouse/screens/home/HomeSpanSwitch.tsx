'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SPAN_PARAM, type ChSpan } from '../../data/span';
import { usePushOnce } from '../../lib/nav-once';
import { SpanSwitch } from '../../ui/SpanSwitch';

/** The address for a span: this page and its other params, with `range=all` set for All time and removed for the season (the default is never written). */
export function spanHref(pathname: string, search: string, span: ChSpan): string {
  const q = new URLSearchParams(search);
  if (span === 'all') q.set(SPAN_PARAM, 'all');
  else q.delete(SPAN_PARAM);
  const s = q.toString();
  return s ? `${pathname}?${s}` : pathname;
}

/**
 * Home's switch, in the numbers' own card. The choice lives in the address (`?range=all`), so it survives a reload and can be shared;
 * the page reads again on the server for the new basis. The pill moves with the tap and stays on the choice while the page loads.
 */
export function HomeSpanSwitch({ span }: { span: ChSpan }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const search = useSearchParams()?.toString() ?? '';
  const pushOnce = usePushOnce(router);
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<ChSpan | null>(null);
  return (
    <SpanSwitch
      hook="home-span"
      value={pending && chosen ? chosen : span}
      onChange={(v) => {
        setChosen(v);
        start(() => pushOnce(spanHref(pathname, search, v), { scroll: false }));
      }}
    />
  );
}
