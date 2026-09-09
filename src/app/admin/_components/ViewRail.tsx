import { SegmentedLinks, type SegmentedLinksOption } from '@/components/fairway';
import {
  ADMIN_VIEWS,
  hrefForView,
  type AdminViewHost,
  type AdminViewOf,
} from '@/lib/admin/views';

/**
 * The segmented rail every multi-view Bridge page mounts at its top.
 *
 * ONE RAIL, NOT ONE PER PAGE. The 30→19 consolidation gave eight destinations
 * a `?view=` axis; hand-rolling the control on each would reproduce exactly the
 * drift the Bridge just spent a redesign removing (five copies of a
 * `SectionLabel` helper, three disagreeing "daily four" shortcut sets). This
 * resolves `hrefForView` for every registered view of `host` — so RULE 1 (the
 * default view emits no `?view=`) and RULE 3 (every other query param survives
 * the switch) hold on every page for free, and a page cannot forget either.
 *
 * A SERVER COMPONENT that hands `SegmentedLinks` (a Client Component) plain
 * strings. `hrefForView` is a function and cannot cross that boundary as a
 * prop — the same reason `IncidentLensRail` resolves its own `hrefFor` before
 * rendering.
 *
 * Labels are supplied by the caller rather than derived from the view key: the
 * key is a URL token (`ekg`, `flow`, `journey`) and the label is operator
 * English ("Team EKG", "Program flow"). Deriving one from the other would put
 * URL vocabulary on screen.
 */
export function ViewRail<H extends AdminViewHost>({
  host,
  active,
  labels,
  descriptions,
  searchParams,
  ariaLabel,
}: {
  host: H;
  active: AdminViewOf<H>;
  /** Operator-facing label per view key. */
  labels: Record<AdminViewOf<H>, string>;
  /** Optional one-line "why these rows?" note per view, shown under the rail. */
  descriptions?: Partial<Record<AdminViewOf<H>, string>>;
  /** The page's own `searchParams`, so a switch preserves every other filter. */
  searchParams?: Record<string, string | string[] | undefined>;
  ariaLabel: string;
}) {
  const views = ADMIN_VIEWS[host] as readonly AdminViewOf<H>[];
  const options: ReadonlyArray<SegmentedLinksOption<AdminViewOf<H>>> = views.map((view) => ({
    value: view,
    label: labels[view],
    href: hrefForView(host, view, searchParams),
  }));

  return (
    <SegmentedLinks
      options={options}
      value={active}
      ariaLabel={ariaLabel}
      description={descriptions?.[active]}
    />
  );
}
