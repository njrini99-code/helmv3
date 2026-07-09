'use client';

// =============================================================================
// src/components/baseball/settings/SettingsAuditClient.tsx
//
// Wave 4 / packet: settings-os
//
// Read-only consuming UI for the append-only settings audit log
// (v4 §Data Retention And Audit). getSettingsAuditLog was already implemented and
// capability-gated — this surface makes the trail reachable. No mutations: the
// log is append-only by design (RLS has no UPDATE/DELETE policy).
//
// Palette: cream/green GolfHelm look reused verbatim. No navy/amber/new palette.
// No golf vocabulary. source -> signal -> action -> timeline honored: each row is
// a timeline entry (actor + event + before/after) anchored to the change.
//
// 90+ bar improvements over original:
//  - Event-type filter (chips for sensitive vs routine vs export categories)
//  - framer-motion stagger-in list with useReducedMotion guard
//  - Before/after value summary rendered when present
// =============================================================================

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { IconClock, IconFilter } from '@/components/icons';
import type {
  BaseballSettingsAuditEntry,
  BaseballSettingsAuditEvent,
} from '@/lib/types/baseball-settings';

interface Props {
  teamName: string;
  entries: BaseballSettingsAuditEntry[];
}

const EVENT_LABEL: Record<BaseballSettingsAuditEvent, string> = {
  program_type_changed: 'Program type changed',
  role_changed: 'Role changed',
  capability_changed: 'Capability changed',
  visibility_changed: 'Visibility changed',
  public_profile_changed: 'Public profile changed',
  guardian_access_changed: 'Guardian access changed',
  scout_access_changed: 'Scout access changed',
  ai_settings_changed: 'AI settings changed',
  import_source_changed: 'Import source changed',
  integration_changed: 'Integration changed',
  notification_settings_changed: 'Notification settings changed',
  data_retention_changed: 'Data retention changed',
  demo_mode_changed: 'Demo mode changed',
  data_exported: 'Data exported',
  settings_changed: 'Settings changed',
};

// Sensitive-access events get a warm-amber accent; routine changes stay green.
const SENSITIVE: ReadonlySet<BaseballSettingsAuditEvent> = new Set([
  'role_changed',
  'capability_changed',
  'guardian_access_changed',
  'scout_access_changed',
  'public_profile_changed',
  'data_exported',
]);

// Filter categories
type FilterCategory = 'all' | 'sensitive' | 'imports' | 'ai' | 'routine';

const FILTER_CATEGORIES: { value: FilterCategory; label: string }[] = [
  { value: 'all', label: 'All changes' },
  { value: 'sensitive', label: 'Sensitive access' },
  { value: 'imports', label: 'Imports & integrations' },
  { value: 'ai', label: 'AI settings' },
  { value: 'routine', label: 'Routine' },
];

const IMPORT_EVENTS: ReadonlySet<BaseballSettingsAuditEvent> = new Set([
  'import_source_changed',
  'integration_changed',
]);
const AI_EVENTS: ReadonlySet<BaseballSettingsAuditEvent> = new Set([
  'ai_settings_changed',
]);

function matchesFilter(entry: BaseballSettingsAuditEntry, filter: FilterCategory): boolean {
  if (filter === 'all') return true;
  if (filter === 'sensitive') return SENSITIVE.has(entry.event_type);
  if (filter === 'imports') return IMPORT_EVENTS.has(entry.event_type);
  if (filter === 'ai') return AI_EVENTS.has(entry.event_type);
  if (filter === 'routine')
    return (
      !SENSITIVE.has(entry.event_type) &&
      !IMPORT_EVENTS.has(entry.event_type) &&
      !AI_EVENTS.has(entry.event_type)
    );
  return true;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Render a compact diff of before/after when present (e.g. "active → disabled"). */
function DiffPreview({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  if (!before && !after) return null;
  const keys = Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ).slice(0, 3);
  if (keys.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-1 gap-0.5 text-xs">
      {keys.map((k) => {
        const bv = before?.[k];
        const av = after?.[k];
        const changed = JSON.stringify(bv) !== JSON.stringify(av);
        if (!changed) return null;
        return (
          <div key={k} className="flex items-baseline gap-1.5 text-warm-400">
            <dt className="font-mono text-warm-500">{k}:</dt>
            <dd className="line-through text-warm-400">{String(bv ?? '—')}</dd>
            <span aria-hidden>→</span>
            <dd className="text-warm-700 font-medium">{String(av ?? '—')}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function SettingsAuditClient({ teamName, entries }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const reduceMotion = useReducedMotion();

  const filtered = entries.filter((e) => matchesFilter(e, activeFilter));

  const listVariants = {
    hidden: {},
    show: { transition: { staggerChildren: reduceMotion ? 0 : 0.03 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 5 },
    show: { opacity: 1, y: 0, transition: { duration: 0.15 } },
  };

  return (
    <>
      <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 font-semibold text-warm-900">Settings Audit Log</h1>
          <p className="mt-1 text-body-sm text-warm-500">{`${teamName} • append-only history`}</p>
        </div>
      </div>

      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        <div className="rounded-xl border border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-600">
          This log is append-only. Every sensitive settings change is recorded and
          can never be edited or deleted from here.
        </div>

        {/* Event-type filter chips */}
        {entries.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter by event type">
            <IconFilter size={14} className="text-warm-400 flex-shrink-0" />
            {FILTER_CATEGORIES.map((cat) => {
              const count =
                cat.value === 'all'
                  ? entries.length
                  : entries.filter((e) => matchesFilter(e, cat.value)).length;
              const active = activeFilter === cat.value;
              return (
                <Button
                  key={cat.value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveFilter(cat.value)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-warm-200 bg-cream-50 text-warm-500 hover:border-warm-300 hover:text-warm-700',
                  )}
                >
                  {cat.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                      active ? 'bg-primary-100 text-primary-700' : 'bg-warm-100 text-warm-500',
                    )}
                  >
                    {count}
                  </span>
                </Button>
              );
            })}
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            variant="card"
            glass
            icon={<IconClock size={40} />}
            title={
              activeFilter !== 'all'
                ? `No ${FILTER_CATEGORIES.find((c) => c.value === activeFilter)?.label.toLowerCase()} changes yet`
                : 'No setting changes yet'
            }
            description={
              activeFilter !== 'all'
                ? 'Try a different filter or check back after more settings are changed.'
                : 'When a coach changes the program type, access policy, AI settings, imports, or integrations, the change will appear here.'
            }
            action={
              activeFilter !== 'all'
                ? { label: 'Show all changes', onClick: () => setActiveFilter('all') }
                : undefined
            }
          />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeFilter}
              className="relative space-y-3"
              variants={listVariants}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            >
              {filtered.map((e) => {
                const sensitive = SENSITIVE.has(e.event_type);
                return (
                  <motion.div key={e.id} variants={itemVariants}>
                    <Card variant="glass">
                      <CardContent className="p-5">
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                              sensitive ? 'bg-amber-500' : 'bg-primary-500',
                            )}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                                  sensitive
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-primary-50 text-primary-700 border-primary-200',
                                )}
                              >
                                {EVENT_LABEL[e.event_type] ?? e.event_type}
                              </span>
                              <span className="text-xs text-warm-400">
                                {formatWhen(e.created_at)}
                              </span>
                            </div>
                            <p className="text-sm leading-relaxed text-warm-800 mt-2">
                              {e.summary}
                            </p>
                            <DiffPreview
                              before={e.before_value}
                              after={e.after_value}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </>
  );
}
