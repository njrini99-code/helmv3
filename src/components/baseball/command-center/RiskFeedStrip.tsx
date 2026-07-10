'use client';

// =============================================================================
// src/components/baseball/command-center/RiskFeedStrip.tsx
//
// Wave 4 / P4.1 — Command Center risk / AI-flag strip.
//
// Renders the staff-facing risk feed from the command-center read model
// (RiskFeedItem[] off getCommandCenter). Each item is honestly source-labeled
// (AI engine vs coach-authored) and shows its real confidence when present —
// never a fabricated 100%. Severity buckets (critical/warning/info) drive the
// accent. Honest, real empty/error states; no black backgrounds.
//
// This is a pure presentational client component: it takes already-resolved,
// already-authorized data (the page builds it server-side via the read model)
// plus capability-aware callbacks. It owns NO data fetching.
// =============================================================================

import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import {
  IconShieldAlert,
  IconWarning,
  IconInfo,
  IconBrain,
  IconUser,
  IconExternalLink,
  IconCheckCircle2,
} from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { InkBadge, PaperCard } from '@/components/baseball/living-annual';
import type {
  RiskFeedItem,
  RiskSeverity,
} from '@/lib/baseball/read-models/command-center';

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

interface RiskFeedStripProps {
  items: RiskFeedItem[];
  /** True while the read model is still loading (server passes false normally). */
  loading?: boolean;
  /** Honest error string from the read model, if any. */
  error?: string | null;
  /**
   * Capability-aware: when the viewer can open player detail, clicking a
   * player-scoped risk routes to that player. Omitted/undefined => no row action
   * (the strip is read-only for that viewer).
   */
  onOpenPlayer?: (playerId: string) => void;
  /** Optional cap on rendered items (the read model already limits; this trims). */
  maxItems?: number;
}

// -----------------------------------------------------------------------------
// Severity styling
// -----------------------------------------------------------------------------

// Ink system, not raw Tailwind severity colors (Living Annual doctrine — no
// raw red/amber). `critical` reads pursuit clay at InkBadge's "solid" weight
// (mirrors signalSeverityPresentation's 'critical' branch elsewhere in the
// baseball tree), `warning` the same lane at "soft" weight, and `info` stays
// the already-tokenized neutral/graphite lane — the solid/soft split is the
// non-color cue that keeps critical vs. watch visually distinguishable.
const SEVERITY_META: Record<
  RiskSeverity,
  {
    label: string;
    ring: string;
    tone: NonNullable<React.ComponentProps<typeof InkBadge>['tone']>;
    variant: NonNullable<React.ComponentProps<typeof InkBadge>['variant']>;
    icon: React.ReactNode;
    dot: string;
  }
> = {
  critical: {
    label: 'Critical',
    ring: 'border-pursuit/40',
    tone: 'pursuit',
    variant: 'solid',
    icon: <IconShieldAlert size={15} className="text-pursuit" />,
    dot: 'bg-pursuit',
  },
  warning: {
    label: 'Watch',
    ring: 'border-pursuit/15',
    tone: 'pursuit',
    variant: 'soft',
    icon: <IconWarning size={15} className="text-pursuit" />,
    dot: 'bg-pursuit/60',
  },
  info: {
    label: 'Info',
    ring: 'border-warm-200/60',
    tone: 'neutral',
    variant: 'soft',
    icon: <IconInfo size={15} className="text-warm-500" />,
    dot: 'bg-warm-400',
  },
};

function confidenceLabel(confidence: number | null): string | null {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  return `${pct}% confidence`;
}

// -----------------------------------------------------------------------------
// Row
// -----------------------------------------------------------------------------

function RiskRow({
  item,
  onOpenPlayer,
}: {
  item: RiskFeedItem;
  onOpenPlayer?: (playerId: string) => void;
}) {
  const meta = SEVERITY_META[item.severity];
  const isAi = item.sourceRef.source === 'ai';
  const conf = confidenceLabel(item.confidence);
  const clickable = !!onOpenPlayer && !!item.playerId;

  const Inner = (
    <>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex-shrink-0">{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-warm-900 truncate">{item.title}</p>
            <InkBadge label={meta.label} tone={meta.tone} variant={meta.variant} />
          </div>
          {item.body && (
            <p className="text-xs text-warm-600 mt-1 line-clamp-2">{item.body}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 text-eyebrow font-medium ${
                isAi ? 'text-primary-600' : 'text-warm-500'
              }`}
            >
              {isAi ? <IconBrain size={12} /> : <IconUser size={12} />}
              {item.sourceRef.label}
            </span>
            {conf && (
              <span className="text-eyebrow text-warm-400 tabular-nums">· {conf}</span>
            )}
            {clickable && (
              <span className="ml-auto inline-flex items-center gap-1 text-eyebrow font-medium text-primary-600">
                Open <IconExternalLink size={11} />
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );

  const base =
    'block w-full text-left rounded-xl border bg-cream-50 p-3 transition-[transform,box-shadow,background-color]';

  if (clickable) {
    return (
      // Custom full-width card affordance (hover lift + focus-visible ring) the
      // design-system Button does not express; intentional raw button.
      // eslint-disable-next-line helm/no-raw-button
      <button
        type="button"
        onClick={() => item.playerId && onOpenPlayer?.(item.playerId)}
        className={`${base} ${SEVERITY_META[item.severity].ring} hover:shadow-sm hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300`}
      >
        {Inner}
      </button>
    );
  }

  return <div className={`${base} ${SEVERITY_META[item.severity].ring}`}>{Inner}</div>;
}

// -----------------------------------------------------------------------------
// RiskFeedStrip
// -----------------------------------------------------------------------------

export function RiskFeedStrip({
  items,
  loading = false,
  error = null,
  onOpenPlayer,
  maxItems,
}: RiskFeedStripProps) {
  const reduceMotion = useReducedMotion();
  const shown = typeof maxItems === 'number' ? items.slice(0, maxItems) : items;

  const criticalCount = items.filter((i) => i.severity === 'critical').length;

  return (
    <PaperCard as="section" aria-label="Risk and AI flags" className="p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600/10">
            <IconShieldAlert size={15} className="text-primary-600" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-warm-900 leading-none">Risk & Flags</h3>
            <p className="text-eyebrow text-warm-400 mt-0.5">
              AI + coach signals needing attention
            </p>
          </div>
        </div>
        {!loading && items.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warm-50 border border-warm-200 text-eyebrow font-semibold text-warm-600 tabular-nums">
            {criticalCount > 0 && (
              <span className="inline-flex items-center gap-1 text-pursuit">
                <span className="w-1.5 h-1.5 rounded-full bg-pursuit" />
                {criticalCount}
              </span>
            )}
            {items.length} open
          </span>
        )}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="block" className="h-[72px] rounded-xl" />
          ))}
        </div>
      ) : error ? (
        // Honest error — feed degraded, not silently empty.
        <div className="rounded-xl border border-pursuit/20 bg-pursuit/10 p-4 text-center">
          <IconWarning size={20} className="text-pursuit mx-auto mb-1.5" />
          <p className="text-sm text-pursuit font-medium">{error}</p>
          <p className="text-xs text-warm-500 mt-0.5">Some signals could not be loaded.</p>
        </div>
      ) : shown.length === 0 ? (
        // Honest empty — no risks is a GOOD state, shown as such.
        <div className="rounded-xl border border-warm-200/60 bg-cream-50 p-6 text-center">
          <IconCheckCircle2 size={24} className="text-primary-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-warm-800">No open flags</p>
          <p className="text-xs text-warm-500 mt-0.5">
            AI and coach risk signals will appear here as they surface.
          </p>
        </div>
      ) : (
        <LazyMotion features={domAnimation}>
          <m.ul
            className="space-y-2"
            initial={reduceMotion ? false : 'hidden'}
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.04 } },
            }}
          >
            {shown.map((item) => (
              <m.li
                key={item.id}
                variants={{
                  hidden: { opacity: 0, y: 6 },
                  show: { opacity: 1, y: 0 },
                }}
              >
                <RiskRow item={item} onOpenPlayer={onOpenPlayer} />
              </m.li>
            ))}
          </m.ul>
        </LazyMotion>
      )}
    </PaperCard>
  );
}
