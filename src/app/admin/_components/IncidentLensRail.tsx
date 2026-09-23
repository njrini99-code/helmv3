import {
  INCIDENT_LENSES,
  INCIDENT_LENS_LABEL,
  INCIDENT_LENS_DESCRIPTION,
  type IncidentLens,
  type IncidentLensCounts,
} from '@/lib/admin/incidents/types';
import { SegmentedLinks, type SegmentedLinksOption } from '@/components/fairway';

/**
 * The Incidents tab's segmented control over `IncidentLens` — filters over
 * ONE unified model, not separate datasets (`types.ts`'s own comment on
 * `INCIDENT_LENSES` is the source of truth for why that distinction matters:
 * Reliability stopped being a competing incident list the moment it became a
 * lens here).
 *
 * A thin wrapper over the Fairway `SegmentedLinks` primitive
 * (`src/components/fairway/controls/segmented-links.tsx`) — the same
 * real-links-not-tablist recipe this file used to implement by hand, now
 * shared with every URL-driven segmented control in the admin console. The
 * reasoning below is unchanged from before the extraction; only the
 * rendering moved.
 *
 * REAL LINKS, NOT BUTTONS. Every lens is a distinct, bookmarkable state — an
 * operator pastes a link to "regressions" into Slack and it has to open
 * exactly that filter, work with JS disabled, and be reachable by Tab/Enter
 * like any other navigation. A button that calls `setState` gives up all of
 * that for nothing this control needs. `hrefFor` is supplied by the caller
 * (the page owns the URL shape — a query param, a path segment) rather than
 * assumed here, so this component makes no claim about the route structure
 * it sits inside. `hrefFor` is resolved to plain strings right here, in this
 * Server Component — `SegmentedLinks` is a Client Component, and a function
 * cannot be passed across that boundary as a prop.
 *
 * `aria-current="page"` marks the active lens rather than an ARIA `tablist`
 * pattern: these are links to different views of the same page, which is
 * exactly the semantics `aria-current="page"` exists for, and it avoids the
 * WCAG 4.1.2 trap of a tablist built from plain navigation links.
 * `SegmentedLinks` never renders `role="tab"` for this reason.
 *
 * A ZERO COUNT STILL RENDERS ITS LENS. A lens that disappears when its count
 * hits zero makes the full set unlearnable — an operator who has never seen
 * "Regressions" show a number has no way to know it exists. It renders
 * de-emphasised instead, so the full vocabulary stays visible without
 * competing for attention with lenses that actually have something in them.
 *
 * `INCIDENT_LENSES` is nine entries and will not all fit at 390px —
 * `SegmentedLinks` scrolls the rail in its own axis (`snap-x`, scrollbar
 * hidden) so a narrow phone never pans the whole page sideways.
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
  const options: ReadonlyArray<SegmentedLinksOption<IncidentLens>> = INCIDENT_LENSES.map((lens) => ({
    value: lens,
    label: INCIDENT_LENS_LABEL[lens],
    href: hrefFor(lens),
    count: counts[lens],
  }));

  return (
    <SegmentedLinks
      options={options}
      value={active}
      ariaLabel="Incident lens"
      description={INCIDENT_LENS_DESCRIPTION[active]}
    />
  );
}
