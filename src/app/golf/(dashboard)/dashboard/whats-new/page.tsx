import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2,
  Sparkles,
  Activity,
  Target,
  Trophy,
  Flag,
} from 'lucide-react';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { AnimatedNumber } from '@/components/ui/animated-number';
import {
  getWhatsNewForCoach,
  type WhatsNewItem,
  type WhatsNewType,
} from '@/app/golf/actions/whats-new';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayWhatsNew } from '@/components/fairway/pages/whats-new';

// ============================================================================
// METADATA
// ============================================================================

export const metadata = {
  title: "What's New | CoachHelm",
  description: 'Lifecycle activity across your team in the past 7 days',
};

// ============================================================================
// TYPE DESCRIPTORS
// ============================================================================

interface TypeDescriptor {
  label: string;
  Icon: typeof CheckCircle2;
  iconClass: string;
  bgClass: string;
}

const TYPE_DESCRIPTORS: Record<WhatsNewType, TypeDescriptor> = {
  insight_resolved: {
    label: 'Insight resolved',
    Icon: CheckCircle2,
    iconClass: 'text-primary-600',
    bgClass: 'bg-primary-50',
  },
  insight_matured: {
    label: 'Insight matured',
    Icon: Trophy,
    iconClass: 'text-amber-600',
    bgClass: 'bg-amber-50',
  },
  insight_detected: {
    label: 'New insight',
    Icon: Sparkles,
    iconClass: 'text-blue-600',
    bgClass: 'bg-blue-50',
  },
  pattern_validated: {
    label: 'Pattern validated',
    Icon: Activity,
    iconClass: 'text-violet-600',
    bgClass: 'bg-violet-50',
  },
  focus_area_created: {
    label: 'New focus area',
    Icon: Target,
    iconClass: 'text-primary-600',
    bgClass: 'bg-primary-50',
  },
  focus_area_completed: {
    label: 'Focus area completed',
    Icon: Flag,
    iconClass: 'text-primary-600',
    bgClass: 'bg-primary-50',
  },
};

// ============================================================================
// DATE HELPERS
// ============================================================================

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function dayBucketKey(d: Date): string {
  const sd = startOfDay(d);
  return sd.toISOString();
}

function dayBucketLabel(bucketIso: string, todayKey: string, yesterdayKey: string): string {
  if (bucketIso === todayKey) return 'Today';
  if (bucketIso === yesterdayKey) return 'Yesterday';
  return new Date(bucketIso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ============================================================================
// EMPTY / ERROR STATES
// ============================================================================

function EmptyState() {
  return (
    <Card variant="overlay" padding="md" className="text-center py-12 px-6">
      <div className="w-14 h-14 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
        <Sparkles size={28} className="text-warm-400" aria-hidden />
      </div>
      <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">No activity yet</h2>
      <p className="text-warm-600 text-sm max-w-md mx-auto">
        No CoachHelm activity in the past 7 days. New insights and lifecycle changes
        will appear here as your team plays more rounds.
      </p>
    </Card>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <Card variant="overlay" padding="md" className="text-center py-12 px-6">
      <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">
        Unable to load activity
      </h2>
      <p className="text-warm-600 text-sm">{error}</p>
    </Card>
  );
}

// ============================================================================
// FEED ROW
// ============================================================================

function FeedRow({ item }: { item: WhatsNewItem }) {
  const descriptor = TYPE_DESCRIPTORS[item.type];
  const { Icon } = descriptor;

  return (
    <div className="flex items-start gap-3 py-3">
      <div
        className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${descriptor.bgClass}`}
      >
        <Icon size={18} className={descriptor.iconClass} aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-medium uppercase tracking-wide text-warm-500">
            {descriptor.label}
          </span>
          <span className="text-xs text-warm-400" aria-hidden>·</span>
          <Link
            href={`/golf/dashboard/players/${item.playerId}`}
            className="text-sm font-medium text-warm-700 hover:text-primary-600 transition-colors"
          >
            {item.playerName}
          </Link>
          <span className="text-xs text-warm-400 ml-auto">
            {timeOfDay(item.occurredAt)}
          </span>
        </div>
        <p className="text-sm font-medium text-warm-900 mt-0.5 truncate">
          {item.title}
        </p>
        {item.description && (
          <p className="text-sm text-warm-600 mt-0.5 line-clamp-2">
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default async function WhatsNewPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach } = session;
  if (!coach) {
    redirect("/golf/dashboard?message=What%27s+New+is+a+coach-only+feature");
  }

  const result = await getWhatsNewForCoach();

  // Group by day
  const todayKey = dayBucketKey(new Date());
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yesterdayKey = dayBucketKey(yest);

  const grouped = new Map<string, WhatsNewItem[]>();
  if (result.success && result.items) {
    for (const item of result.items) {
      const key = dayBucketKey(new Date(item.occurredAt));
      const arr = grouped.get(key);
      if (arr) arr.push(item);
      else grouped.set(key, [item]);
    }
  }
  const dayKeys = Array.from(grouped.keys()).sort((a, b) => (a < b ? 1 : -1));
  const totalItems = result.success && result.items ? result.items.length : 0;

  if (isRedesignEnabled())
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayWhatsNew
          success={result.success}
          error={result.error}
          items={result.items}
          truncated={result.truncated}
        />
      </div>
    );

  return (
    <div className="min-h-full bg-transparent">
      <LargeTitleHeader
        title="What's New"
        subtitle="CoachHelm activity across your team in the past 7 days"
      />

      <div className="max-w-[720px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <Reveal>
          <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
            <PageHeader
              eyebrow="This Week"
              eyebrowAccent="primary"
              title="What's new across your team."
              subtitle={
                totalItems > 0
                  ? `${totalItems} update${totalItems === 1 ? '' : 's'} in the past 7 days.`
                  : 'CoachHelm activity will appear here as your team plays more rounds.'
              }
            />
          </div>
        </Reveal>
        {!result.success ? (
          <ErrorState error={result.error ?? 'Failed to load activity'} />
        ) : dayKeys.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-6">
            {dayKeys.map((key) => {
              const items = grouped.get(key) ?? [];
              const label = dayBucketLabel(key, todayKey, yesterdayKey);
              return (
                <section key={key}>
                  <div className="flex items-baseline gap-2 mb-2 px-1">
                    <h2 className="text-sm font-medium text-warm-900">{label}</h2>
                    <AnimatedNumber
                      value={items.length}
                      decimals={0}
                      prefix="("
                      suffix=")"
                      className="text-xs text-warm-500 tabular-nums"
                    />
                  </div>
                  <Card variant="overlay" padding="md" className="px-5 py-1 divide-y divide-warm-100">
                    {items.map((item, idx) => (
                      <FeedRow
                        key={`${item.type}-${item.insightId ?? item.patternId ?? item.focusAreaId ?? idx}-${item.occurredAt}`}
                        item={item}
                      />
                    ))}
                  </Card>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
