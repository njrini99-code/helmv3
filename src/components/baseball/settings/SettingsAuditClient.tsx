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
// No golf vocabulary. source -> signal -> action -> timeline honored: each row is
// a timeline entry (actor + event + before/after) anchored to the change.
//
// DESIGN MIGRATION (settings unification)
// ---------------------------------------
// Like Season and Integrations, this screen had a hand-rolled
// `border-b border-warm-200/60` title bar instead of a masthead, legacy
// `Card variant="glass"` rows, the generic `@/components/ui/empty-state`
// EmptyState, and `primary-*` filter chips. It now composes from
// `SettingsChrome` + the Living Annual kit. The sensitive/routine distinction
// keeps its two-ink read (clay vs green) and still carries in the LABEL as well
// as the color.
//
// 90+ bar improvements over original:
//  - Event-type filter (chips for sensitive vs routine vs export categories)
//  - framer-motion stagger-in list with useReducedMotion guard
//  - Before/after value summary rendered when present
// =============================================================================

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IconFilter } from '@/components/icons';
import {
  EditorsLetter,
  InkBadge,
  PaperCard,
} from '@/components/baseball/living-annual';
import {
  SettingsNotice,
  SettingsShell,
} from '@/components/baseball/settings/SettingsChrome';

/** Selected vs unselected chrome for the event-category filter chips. */
const CHIP_BASE =
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-200';
const CHIP_SELECTED = 'border-grade-plus bg-grade-plus/10 text-text-primary';
const CHIP_IDLE =
  'border-[color:var(--hairline)] bg-[var(--paper-canvas)] text-text-secondary hover:border-grade-plus/40';
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

// Sensitive-access events get a pursuit (clay) ink accent; routine changes stay green.
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
          <div key={k} className="flex items-baseline gap-1.5 text-text-tertiary">
            <dt className="font-mono text-text-tertiary">{k}:</dt>
            <dd className="text-text-tertiary line-through">{String(bv ?? '—')}</dd>
            <span aria-hidden>→</span>
            <dd className="font-medium text-text-primary">{String(av ?? '—')}</dd>
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
    <SettingsShell title="Settings Audit Log" lede={`${teamName} • append-only history`}>
      <SettingsNotice>
        This log is append-only. Every sensitive settings change is recorded and
        can never be edited or deleted from here.
      </SettingsNotice>

      {/* Event-type filter chips */}
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by event type">
          <IconFilter size={14} className="flex-shrink-0 text-text-tertiary" />
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
                className={cn(CHIP_BASE, active ? CHIP_SELECTED : CHIP_IDLE)}
              >
                {cat.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                    active
                      ? 'bg-grade-plus/20 text-text-primary'
                      : 'bg-[var(--paper)] text-text-tertiary',
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
        <EditorsLetter
          ink="team"
          title={
            activeFilter !== 'all'
              ? `No ${FILTER_CATEGORIES.find((c) => c.value === activeFilter)?.label.toLowerCase()} changes yet.`
              : 'No setting changes yet.'
          }
          body={
            activeFilter !== 'all'
              ? 'Try a different filter or check back after more settings are changed.'
              : 'When a coach changes the program type, access policy, AI settings, imports, or integrations, the change will appear here.'
          }
          action={
            activeFilter !== 'all' ? (
              <Button size="sm" variant="secondary" onClick={() => setActiveFilter('all')}>
                Show all changes
              </Button>
            ) : undefined
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
                  <PaperCard className="p-5">
                    <div className="flex items-start gap-3">
                      {/* Lane dot: clay for a sensitive-access event, green for a
                          routine one. Decorative only — the event LABEL beside it
                          says which, so the timeline never depends on color. */}
                      <span
                        className={cn(
                          'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                          sensitive ? 'bg-pursuit' : 'bg-grade-plus',
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <InkBadge
                            label={EVENT_LABEL[e.event_type] ?? e.event_type}
                            tone={sensitive ? 'pursuit' : 'team'}
                            variant="solid"
                          />
                          <span className="text-xs text-text-tertiary">
                            {formatWhen(e.created_at)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-text-primary">
                          {e.summary}
                        </p>
                        <DiffPreview
                          before={e.before_value}
                          after={e.after_value}
                        />
                      </div>
                    </div>
                  </PaperCard>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}
    </SettingsShell>
  );
}
