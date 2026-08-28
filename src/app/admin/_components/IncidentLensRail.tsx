import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  INCIDENT_LENSES,
  INCIDENT_LENS_LABEL,
  INCIDENT_LENS_DESCRIPTION,
  type IncidentLens,
  type IncidentLensCounts,
} from '@/lib/admin/incidents/types';

/**
 * The Incidents tab's segmented control over `IncidentLens` — filters over
 * ONE unified model, not separate datasets (`types.ts`'s own comment on
 * `INCIDENT_LENSES` is the source of truth for why that distinction matters:
 * Reliability stopped being a competing incident list the moment it became a
 * lens here).
 *
 * REAL LINKS, NOT BUTTONS. Every lens is a distinct, bookmarkable state — an
 * operator pastes a link to "regressions" into Slack and it has to open
 * exactly that filter, work with JS disabled, and be reachable by Tab/Enter
 * like any other navigation. A button that calls `setState` gives up all of
 * that for nothing this control needs. `hrefFor` is supplied by the caller
 * (the page owns the URL shape — a query param, a path segment) rather than
 * assumed here, so this component makes no claim about the route structure
 * it sits inside.
 *
 * `aria-current="page"` marks the active lens rather than an ARIA `tablist`
 * pattern: these are links to different views of the same page, which is
 * exactly the semantics `aria-current="page"` exists for, and it avoids the
 * WCAG 4.1.2 trap of a tablist built from plain navigation links.
 *
 * A ZERO COUNT STILL RENDERS ITS LENS. A lens that disappears when its count
 * hits zero makes the full set unlearnable — an operator who has never seen
 * "Regressions" show a number has no way to know it exists. It renders
 * de-emphasised instead, so the full vocabulary stays visible without
 * competing for attention with lenses that actually have something in them.
 */
export function IncidentLensRail({
  active,
  counts,
  hrefFor,
}: {
  active: IncidentLens;
  counts: IncidentLensCounts;
  hrefFor: (lens: IncidentLens) => string;
}) {
  return (
    <nav aria-label="Incident lens" className="min-w-0">
      {/* The rail scrolls in its own axis so a narrow phone never pans the
          whole page sideways — `INCIDENT_LENSES` is seven entries and will
          not all fit at 390px. `snap-x` gives the scroll a resting point per
          pill instead of stopping mid-label. Scrollbar hidden the same way
          FairwayHubSubNav hides its own — the fade/edge affordance that strip
          adds is Fairway-specific chrome this admin surface doesn't share,
          so this keeps to the plainer Row.tsx/IncidentCard vocabulary. */}
      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="flex snap-x snap-mandatory items-center gap-1.5 py-0.5">
          {INCIDENT_LENSES.map((lens) => {
            const isActive = lens === active;
            const count = counts[lens];
            return (
              <li key={lens} className="shrink-0 snap-start">
                <Link
                  href={hrefFor(lens)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-caption font-semibold leading-none transition-colors',
                    isActive
                      ? 'bg-accent-600 text-white'
                      : 'bg-warm-100 text-warm-600 hover:bg-warm-200',
                    // De-emphasise an empty lens, but never the active one —
                    // an operator who deep-links into an empty lens should
                    // still see it read as selected, not as disabled.
                    count === 0 && !isActive && 'opacity-50',
                  )}
                >
                  {INCIDENT_LENS_LABEL[lens]}
                  <span className="font-fw-mono text-caption tabular-nums opacity-80">{count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* The "why these rows?" note — one line, always the active lens's own
          description, never a generic caption. */}
      <p className="mt-1.5 text-caption text-warm-500">{INCIDENT_LENS_DESCRIPTION[active]}</p>
    </nav>
  );
}
