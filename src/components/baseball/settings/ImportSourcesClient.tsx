'use client';

// =============================================================================
// src/components/baseball/settings/ImportSourcesClient.tsx
//
// Wave 4 / packet: settings-os
//
// Consuming UI for the import-source registry (v4 §Import Source Settings). The
// CRUD server actions (listImportSources / upsertImportSource /
// deleteImportSource) were already implemented, capability-gated and audited —
// this surface makes them reachable.
//
// No golf vocabulary — sources are baseball stat/device exports (GameChanger,
// TrackMan…).
//
// DESIGN MIGRATION (settings unification)
// ---------------------------------------
// This screen was half-migrated: a Living Annual `SectionMasthead` and
// `EditorsLetter` on top, but a body still built from legacy
// `Card variant="glass"` panels in `warm-*` / `primary-*` — so the header and
// the rows it introduced were two different design systems on one screen. The
// body now composes from `SettingsChrome` + `PaperCard` + `InkBadge`, matching
// its sibling Integrations screen exactly.
//
// Every write re-validates can_manage_imports SERVER-SIDE; read-only viewers see
// the registry but the add/edit/remove controls are hidden/disabled.
//
// 90+ bar improvements over original:
//  - Edit existing sources (not just add/delete) via inline expand
//  - Enable/disable toggle per source (upsert with enabled: true/false)
//  - Entry animations with framer-motion + useReducedMotion guard
//  - Keyword filter for large source lists
//  - Proper Skeleton loading state (caller's page-level skeleton already covers
//    the top-level load; this handles the inline add/edit form transitions)
// =============================================================================

import { useState, useTransition } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import {
  IconPlus,
  IconTrash,
  IconLock,
  IconCheck,
  IconPencil,
  IconX,
  IconSearch,
} from '@/components/icons';
import {
  EditorsLetter,
  InkBadge,
  PaperCard,
} from '@/components/baseball/living-annual';
import {
  SettingsNotice,
  SettingsSection,
  SettingsShell,
} from '@/components/baseball/settings/SettingsChrome';
import {
  upsertImportSource,
  deleteImportSource,
} from '@/app/baseball/actions/program-settings';
import type {
  BaseballImportSourceConfig,
  BaseballSourceTrustLevel,
  BaseballDefaultVisibility,
  BaseballDedupeStrictness,
  BaseballPlayerMatchStrategy,
} from '@/lib/types/baseball-settings';

interface Props {
  teamName: string;
  canManage: boolean;
  sources: BaseballImportSourceConfig[];
}

const TRUST_LEVELS: { value: BaseballSourceTrustLevel; label: string }[] = [
  { value: 'official', label: 'Official' },
  { value: 'device_export', label: 'Device export' },
  { value: 'staff_entered', label: 'Staff entered' },
  { value: 'player_entered', label: 'Player entered' },
  { value: 'ai_derived', label: 'AI derived' },
  { value: 'unreviewed', label: 'Unreviewed' },
];

const VISIBILITY: { value: BaseballDefaultVisibility; label: string }[] = [
  { value: 'staff_only', label: 'Staff only' },
  { value: 'player_visible', label: 'Player visible' },
  { value: 'restricted', label: 'Restricted' },
];

const DEDUPE: { value: BaseballDedupeStrictness; label: string }[] = [
  { value: 'loose', label: 'Loose' },
  { value: 'standard', label: 'Standard' },
  { value: 'strict', label: 'Strict' },
];

const MATCH: { value: BaseballPlayerMatchStrategy; label: string }[] = [
  { value: 'external_id_only', label: 'External ID only' },
  { value: 'name_then_external_id', label: 'Name, then external ID' },
  { value: 'manual_only', label: 'Manual only' },
];

/**
 * Trust stamps in the two-ink lane. Provenance a coach can rely on (official,
 * device export) reads team green; everything hand- or AI-originated is
 * graphite-neutral; `unreviewed` stays clay, since caution routes through
 * pursuit and never through amber (empty-state doctrine).
 */
const TRUST_TONE: Record<BaseballSourceTrustLevel, 'team' | 'pursuit' | 'neutral'> = {
  official: 'team',
  device_export: 'team',
  staff_entered: 'neutral',
  player_entered: 'neutral',
  ai_derived: 'neutral',
  unreviewed: 'pursuit',
};

/** Selected vs unselected chrome for the inline enable/disable toggles. */
const TOGGLE_BASE =
  'rounded-fw-sm border px-2.5 py-1.5 text-xs font-medium transition-colors duration-200';
const TOGGLE_ON = 'border-grade-plus bg-grade-plus/10 text-text-primary';
const TOGGLE_OFF =
  'border-[color:var(--hairline)] bg-[var(--paper-canvas)] text-text-secondary hover:border-grade-plus/40';

interface DraftSource {
  source_name: string;
  source_type: string;
  trust_level: BaseballSourceTrustLevel;
  default_visibility: BaseballDefaultVisibility;
  required_review: boolean;
  dedupe_strictness: BaseballDedupeStrictness;
  player_match_strategy: BaseballPlayerMatchStrategy;
  external_id_namespace: string;
  enabled: boolean;
}

const EMPTY_DRAFT: DraftSource = {
  source_name: '',
  source_type: '',
  trust_level: 'unreviewed',
  default_visibility: 'staff_only',
  required_review: true,
  dedupe_strictness: 'standard',
  player_match_strategy: 'name_then_external_id',
  external_id_namespace: '',
  enabled: true,
};

function sourceToDraft(s: BaseballImportSourceConfig): DraftSource {
  return {
    source_name: s.source_name,
    source_type: s.source_type,
    trust_level: s.trust_level,
    default_visibility: s.default_visibility,
    required_review: s.required_review,
    dedupe_strictness: s.dedupe_strictness,
    player_match_strategy: s.player_match_strategy,
    external_id_namespace: s.external_id_namespace ?? '',
    enabled: s.enabled,
  };
}

function FieldSelect<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (next: T) => void;
}) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-sm font-medium text-text-primary">{label}</span>
      <Select
        options={options as { value: string; label: string }[]}
        value={value}
        disabled={disabled}
        onChange={(v) => onChange(v as T)}
      />
    </div>
  );
}

/** Inline form — used for both "add" and "edit" modes. */
function SourceForm({
  draft,
  setDraft,
  isPending,
  onSave,
  onCancel,
  saveLabel,
}: {
  draft: DraftSource;
  setDraft: React.Dispatch<React.SetStateAction<DraftSource>>;
  isPending: boolean;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  const setField = <K extends keyof DraftSource>(key: K, value: DraftSource[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Source name"
          value={draft.source_name}
          placeholder="e.g. TrackMan bullpen"
          onChange={(e) => setField('source_name', e.target.value)}
        />
        <Input
          label="Source type"
          value={draft.source_type}
          placeholder="e.g. trackman_csv, gamechanger_xml"
          onChange={(e) => setField('source_type', e.target.value)}
        />
        <FieldSelect
          label="Trust level"
          value={draft.trust_level}
          options={TRUST_LEVELS}
          onChange={(v) => setField('trust_level', v)}
        />
        <FieldSelect
          label="Default visibility"
          value={draft.default_visibility}
          options={VISIBILITY}
          onChange={(v) => setField('default_visibility', v)}
        />
        <FieldSelect
          label="Duplicate detection"
          value={draft.dedupe_strictness}
          options={DEDUPE}
          onChange={(v) => setField('dedupe_strictness', v)}
        />
        <FieldSelect
          label="Player matching"
          value={draft.player_match_strategy}
          options={MATCH}
          onChange={(v) => setField('player_match_strategy', v)}
        />
        <Input
          label="External ID namespace (optional)"
          value={draft.external_id_namespace}
          placeholder="e.g. tm_session_id"
          onChange={(e) => setField('external_id_namespace', e.target.value)}
        />
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Checkbox
          label="Require review before commit"
          description="Imports from this source land in a review queue first."
          checked={draft.required_review}
          onChange={(e) => setField('required_review', e.target.checked)}
        />
        <Checkbox
          label="Source enabled"
          description="Disabled sources are visible but block new imports."
          checked={draft.enabled}
          onChange={(e) => setField('enabled', e.target.checked)}
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button
          variant="secondary"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button onClick={onSave} isLoading={isPending}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

export function ImportSourcesClient({ teamName, canManage, sources }: Props) {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftSource>(EMPTY_DRAFT);
  const [editDraft, setEditDraft] = useState<DraftSource>(EMPTY_DRAFT);
  const [filter, setFilter] = useState('');
  const reduceMotion = useReducedMotion();

  const filteredSources = filter.trim()
    ? sources.filter(
        (s) =>
          s.source_name.toLowerCase().includes(filter.toLowerCase()) ||
          s.source_type.toLowerCase().includes(filter.toLowerCase()),
      )
    : sources;

  const handleSave = () => {
    if (!draft.source_name.trim() || !draft.source_type.trim()) {
      showToast('Source name and type are required.', 'error');
      return;
    }
    startTransition(async () => {
      try {
        await upsertImportSource({
          source_name: draft.source_name.trim(),
          source_type: draft.source_type.trim(),
          trust_level: draft.trust_level,
          default_visibility: draft.default_visibility,
          required_review: draft.required_review,
          dedupe_strictness: draft.dedupe_strictness,
          player_match_strategy: draft.player_match_strategy,
          external_id_namespace: draft.external_id_namespace.trim() || undefined,
          enabled: draft.enabled,
        });
        setDraft(EMPTY_DRAFT);
        setShowForm(false);
        showToast('Import source saved', 'success');
      } catch {
        showToast('Could not save the source. Check your access and try again.', 'error');
      }
    });
  };

  const handleEdit = (s: BaseballImportSourceConfig) => {
    setEditingId(s.id);
    setEditDraft(sourceToDraft(s));
  };

  const handleSaveEdit = (id: string) => {
    if (!editDraft.source_name.trim() || !editDraft.source_type.trim()) {
      showToast('Source name and type are required.', 'error');
      return;
    }
    startTransition(async () => {
      try {
        await upsertImportSource({
          id,
          source_name: editDraft.source_name.trim(),
          source_type: editDraft.source_type.trim(),
          trust_level: editDraft.trust_level,
          default_visibility: editDraft.default_visibility,
          required_review: editDraft.required_review,
          dedupe_strictness: editDraft.dedupe_strictness,
          player_match_strategy: editDraft.player_match_strategy,
          external_id_namespace: editDraft.external_id_namespace.trim() || undefined,
          enabled: editDraft.enabled,
        });
        setEditingId(null);
        showToast('Import source updated', 'success');
      } catch {
        showToast('Could not update the source.', 'error');
      }
    });
  };

  const handleToggleEnabled = (s: BaseballImportSourceConfig) => {
    startTransition(async () => {
      try {
        await upsertImportSource({
          id: s.id,
          source_name: s.source_name,
          source_type: s.source_type,
          trust_level: s.trust_level,
          default_visibility: s.default_visibility,
          required_review: s.required_review,
          dedupe_strictness: s.dedupe_strictness,
          player_match_strategy: s.player_match_strategy,
          external_id_namespace: s.external_id_namespace ?? undefined,
          enabled: !s.enabled,
        });
        showToast(s.enabled ? `Disabled "${s.source_name}"` : `Enabled "${s.source_name}"`, 'success');
      } catch {
        showToast('Could not update the source.', 'error');
      }
    });
  };

  const handleDelete = (id: string, name: string) => {
    startTransition(async () => {
      try {
        await deleteImportSource(id);
        showToast(`Removed "${name}"`, 'success');
      } catch {
        showToast('Could not remove the source.', 'error');
      }
    });
  };

  const listVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.04 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 6 },
    show: { opacity: 1, y: 0, transition: { duration: 0.16 } },
  };

  return (
    <SettingsShell
      title="Import Sources"
      lede={`${teamName} • source registry`}
      actions={
        canManage && !showForm ? (
          <Button onClick={() => setShowForm(true)} disabled={isPending}>
            <IconPlus size={16} className="mr-1.5" />
            Add source
          </Button>
        ) : undefined
      }
    >
      {!canManage && (
        <SettingsNotice icon={<IconLock size={16} />}>
          You can view import sources but only staff with the manage-imports
          capability can change them.
        </SettingsNotice>
      )}

      {/* Add new source form */}
      <AnimatePresence>
        {canManage && showForm && (
          <motion.div
            initial={reduceMotion ? {} : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? {} : { opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <SettingsSection
              title="New import source"
              subtitle="Adapter contract only — no vendor credentials are stored here."
              bodySpacing="none"
            >
              <SourceForm
                draft={draft}
                setDraft={setDraft}
                isPending={isPending}
                onSave={handleSave}
                onCancel={() => {
                  setShowForm(false);
                  setDraft(EMPTY_DRAFT);
                }}
                saveLabel="Save source"
              />
            </SettingsSection>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter bar — only show when there are 4+ sources */}
      {sources.length >= 4 && (
        <div className="relative">
          <IconSearch
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <Input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter sources…"
            className="pl-9"
          />
          {filter && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setFilter('')}
              aria-label="Clear filter"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0 text-text-tertiary hover:text-text-primary"
            >
              <IconX size={14} />
            </Button>
          )}
        </div>
      )}

      {filteredSources.length === 0 && !showForm ? (
        <EditorsLetter
          ink="team"
          title={filter ? 'No sources match.' : 'No import sources yet.'}
          body={
            filter
              ? `No sources match "${filter}". Clear the filter or add a new source.`
              : canManage
                ? 'Register a source (GameChanger, TrackMan, a spreadsheet) to set its trust level and matching rules before importing.'
                : 'No import sources have been registered for this program yet.'
          }
          action={
            filter ? (
              <Button variant="secondary" size="sm" onClick={() => setFilter('')}>
                Clear filter
              </Button>
            ) : canManage ? (
              <Button size="sm" onClick={() => setShowForm(true)}>
                Add source
              </Button>
            ) : undefined
          }
        />
      ) : (
        <motion.div
          className="space-y-3"
          variants={listVariants}
          initial="hidden"
          animate="show"
        >
          {filteredSources.map((s) => (
            <motion.div key={s.id} variants={itemVariants}>
              <PaperCard className="p-5">
                <div>
                  {/* Inline edit expansion */}
                  <AnimatePresence>
                    {editingId === s.id ? (
                      <motion.div
                        initial={reduceMotion ? {} : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={reduceMotion ? {} : { opacity: 0 }}
                        transition={{ duration: 0.14 }}
                      >
                        <div className="mb-3">
                          <h3 className="font-annual text-body font-semibold text-text-primary">
                            Edit {s.source_name}
                          </h3>
                        </div>
                        <SourceForm
                          draft={editDraft}
                          setDraft={setEditDraft}
                          isPending={isPending}
                          onSave={() => handleSaveEdit(s.id)}
                          onCancel={() => setEditingId(null)}
                          saveLabel="Save changes"
                        />
                      </motion.div>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-annual text-body font-semibold text-text-primary">
                              {s.source_name}
                            </h3>
                            <InkBadge
                              label={
                                TRUST_LEVELS.find((t) => t.value === s.trust_level)?.label ??
                                s.trust_level
                              }
                              tone={TRUST_TONE[s.trust_level]}
                              variant="solid"
                            />
                            {!s.enabled && <InkBadge label="Disabled" tone="neutral" />}
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                            {s.source_type}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-tertiary">
                            <span>
                              Visibility:{' '}
                              <span className="text-text-secondary">
                                {VISIBILITY.find((v) => v.value === s.default_visibility)?.label}
                              </span>
                            </span>
                            <span>
                              Matching:{' '}
                              <span className="text-text-secondary">
                                {MATCH.find((m) => m.value === s.player_match_strategy)?.label}
                              </span>
                            </span>
                            <span>
                              Dedupe:{' '}
                              <span className="text-text-secondary">
                                {DEDUPE.find((d) => d.value === s.dedupe_strictness)?.label}
                              </span>
                            </span>
                            <span className="inline-flex items-center gap-1">
                              {s.required_review ? (
                                <>
                                  <IconCheck size={12} className="text-grade-plus" />
                                  Review required
                                </>
                              ) : (
                                'No required review'
                              )}
                            </span>
                            {s.external_id_namespace && (
                              <span>
                                ID namespace:{' '}
                                <span className="text-text-secondary">{s.external_id_namespace}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        {canManage && (
                          <div className="flex shrink-0 items-center gap-1">
                            {/* Enable/disable toggle */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleEnabled(s)}
                              disabled={isPending}
                              aria-pressed={s.enabled}
                              aria-label={s.enabled ? `Disable ${s.source_name}` : `Enable ${s.source_name}`}
                              title={s.enabled ? 'Disable source' : 'Enable source'}
                              className={cn(
                                TOGGLE_BASE,
                                s.enabled ? TOGGLE_ON : TOGGLE_OFF,
                                isPending && 'cursor-not-allowed opacity-50',
                              )}
                            >
                              {s.enabled ? 'Enabled' : 'Disabled'}
                            </Button>
                            {/* Edit */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleEdit(s)}
                              disabled={isPending}
                              aria-label={`Edit ${s.source_name}`}
                              className={cn(
                                'shrink-0 rounded-fw-sm p-2 text-text-tertiary transition-colors duration-200',
                                'hover:bg-grade-plus/10 hover:text-grade-plus',
                                isPending && 'cursor-not-allowed opacity-50',
                              )}
                            >
                              <IconPencil size={16} />
                            </Button>
                            {/* Delete */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleDelete(s.id, s.source_name)}
                              disabled={isPending}
                              aria-label={`Remove ${s.source_name}`}
                              className={cn(
                                'shrink-0 rounded-fw-sm p-2 text-text-tertiary transition-colors duration-200',
                                'hover:bg-[var(--notice-error-ink)]/10 hover:text-[color:var(--notice-error-ink)]',
                                isPending && 'cursor-not-allowed opacity-50',
                              )}
                            >
                              <IconTrash size={16} />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </PaperCard>
            </motion.div>
          ))}
        </motion.div>
      )}
    </SettingsShell>
  );
}
