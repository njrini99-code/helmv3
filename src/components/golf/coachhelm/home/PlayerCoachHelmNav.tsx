'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useScrollFade } from '@/lib/fairway/use-scroll-fade';
import { replaceStageUrl } from '@/components/fairway/modules/StageRouter';

const SECTIONS = [
  { key: 'home', label: 'Overview' },
  { key: 'development', label: 'Development' },
  { key: 'profile', label: 'Game profile' },
  { key: 'standing', label: 'Standing' },
  { key: 'insights', label: 'Insights' },
  { key: 'deep-dive', label: 'Deep dive' },
] as const;

const SECTION_KEYS = new Set<string>(SECTIONS.map((section) => section.key));

/**
 * Label of the CoachHelm section the `?view=` param currently selects.
 *
 * The stage has no visible page title — `PlayerSpine` is the hero — so the
 * surface shipped with NO `<h1>` at all and jumped straight to `<h2>`
 * (audit P-21). Callers render this inside a visually-hidden heading so the
 * document has a top-level title that tracks the active section.
 */
export function useCoachHelmSectionLabel(): string {
  const searchParams = useSearchParams();
  const requested = searchParams.get('view');
  const key = requested && SECTION_KEYS.has(requested) ? requested : 'home';
  return SECTIONS.find((section) => section.key === key)?.label ?? 'Overview';
}

export function PlayerCoachHelmNav() {
  const searchParams = useSearchParams();
  const { ref: fadeRef, fadeStyle } = useScrollFade<HTMLUListElement>('x');
  const requested = searchParams.get('view');
  const requestedActive = requested && SECTION_KEYS.has(requested) ? requested : 'home';
  const [active, setActive] = useState(requestedActive);

  useEffect(() => setActive(requestedActive), [requestedActive]);

  function hrefFor(key: string): string {
    const next = new URLSearchParams(searchParams.toString());
    if (key === 'home') next.delete('view');
    else next.set('view', key);
    const query = next.toString();
    return query ? `/golf/dashboard/coachhelm?${query}` : '/golf/dashboard/coachhelm';
  }

  return (
    <nav aria-label="CoachHelm sections" className="min-w-0 border-b border-border-subtle">
      <ul
        ref={fadeRef}
        style={fadeStyle}
        className="flex max-w-full items-center gap-1 overflow-x-auto pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SECTIONS.map((section) => {
          const selected = active === section.key;
          return (
            <li key={section.key} className="shrink-0">
              <Link
                href={hrefFor(section.key)}
                replace
                scroll={false}
                onClick={(event) => {
                  if (
                    event.defaultPrevented ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  setActive(section.key);
                  replaceStageUrl('view', section.key, 'home');
                }}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'relative inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-t-fw-sm px-3.5 py-2',
                  'font-fw-sans text-label font-medium outline-none transition-colors duration-150',
                  'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                  selected ? 'text-text-primary' : 'text-text-secondary hover:bg-surface-tint hover:text-text-primary',
                )}
              >
                {section.label}
                {selected ? <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-500" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
