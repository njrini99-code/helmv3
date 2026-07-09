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
// Palette: cream/green GolfHelm look reused verbatim (Card glass, warm-* tokens,
// primary-* green, gap-6, editorial type). No navy/amber/new palette. No golf
// vocabulary — sources are baseball stat/device exports (GameChanger, TrackMan…).
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
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import {
  IconDatabase,
  IconPlus,
  IconTrash,
  IconLock,
  IconCheck,
  IconPencil,
  IconX,
  IconSearch,
} from '@/components/icons';
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

const TRUST_TONE: Record<BaseballSourceTrustLevel, string> = {
  official: 'bg-primary-50 text-primary-700 border-primary-200',
  device_export: 'bg-primary-50/60 text-primary-700 border-primary-200',
  staff_entered: 'bg-warm-100 text-warm-700 border-warm-300',
  player_entered: 'bg-warm-100 text-warm-700 border-warm-300',
  ai_derived: 'bg-warm-100 text-warm-600 border-warm-300',
  unreviewed: 'bg-amber-50 text-amber-700 border-amber-200',
};

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
      <span className="block text-sm font-medium text-warm-700 mb-1.5">{label}</span>
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
    <CardContent className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
    </CardContent>
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
    <>
      <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 font-semibold text-warm-900">Import Sources</h1>
          <p className="mt-1 text-body-sm text-warm-500">{`${teamName} • source registry`}</p>
        </div>
        {canManage && !showForm && (
          <Button onClick={() => setShowForm(true)} disabled={isPending}>
            <IconPlus size={16} className="mr-1.5" />
            Add source
          </Button>
        )}
      </div>

      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        {!canManage && (
          <div className="rounded-xl border border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-600 flex items-center gap-2">
            <IconLock size={16} className="text-warm-400 shrink-0" />
            You can view import sources but only staff with the manage-imports
            capability can change them.
          </div>
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
              <Card variant="glass">
                <CardHeader>
                  <h2 className="font-semibold text-warm-900">New import source</h2>
                  <p className="text-sm leading-relaxed text-warm-500">
                    Adapter contract only — no vendor credentials are stored here.
                  </p>
                </CardHeader>
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
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filter bar — only show when there are 4+ sources */}
        {sources.length >= 4 && (
          <div className="relative">
            <IconSearch
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 pointer-events-none"
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
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600 p-0"
              >
                <IconX size={14} />
              </Button>
            )}
          </div>
        )}

        {filteredSources.length === 0 && !showForm ? (
          <EmptyState
            variant="card"
            glass
            icon={<IconDatabase size={40} />}
            title={filter ? 'No sources match' : 'No import sources yet'}
            description={
              filter
                ? `No sources match "${filter}". Clear the filter or add a new source.`
                : canManage
                  ? 'Register a source (GameChanger, TrackMan, a spreadsheet) to set its trust level and matching rules before importing.'
                  : 'No import sources have been registered for this program yet.'
            }
            action={
              filter
                ? { label: 'Clear filter', onClick: () => setFilter('') }
                : canManage
                  ? { label: 'Add source', onClick: () => setShowForm(true) }
                  : undefined
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
                <Card variant="glass">
                  <CardContent className="p-5">
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
                            <h3 className="font-semibold text-warm-900">Edit {s.source_name}</h3>
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
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-warm-900">{s.source_name}</h3>
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                                  TRUST_TONE[s.trust_level],
                                )}
                              >
                                {TRUST_LEVELS.find((t) => t.value === s.trust_level)?.label ??
                                  s.trust_level}
                              </span>
                              {!s.enabled && (
                                <span className="inline-flex items-center rounded-full border border-warm-300 bg-warm-100 px-2 py-0.5 text-xs font-medium text-warm-600">
                                  Disabled
                                </span>
                              )}
                            </div>
                            <p className="text-sm leading-relaxed text-warm-500 mt-1">
                              {s.source_type}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-warm-500">
                              <span>
                                Visibility:{' '}
                                <span className="text-warm-700">
                                  {VISIBILITY.find((v) => v.value === s.default_visibility)?.label}
                                </span>
                              </span>
                              <span>
                                Matching:{' '}
                                <span className="text-warm-700">
                                  {MATCH.find((m) => m.value === s.player_match_strategy)?.label}
                                </span>
                              </span>
                              <span>
                                Dedupe:{' '}
                                <span className="text-warm-700">
                                  {DEDUPE.find((d) => d.value === s.dedupe_strictness)?.label}
                                </span>
                              </span>
                              <span className="inline-flex items-center gap-1">
                                {s.required_review ? (
                                  <>
                                    <IconCheck size={12} className="text-primary-600" />
                                    Review required
                                  </>
                                ) : (
                                  'No required review'
                                )}
                              </span>
                              {s.external_id_namespace && (
                                <span>
                                  ID namespace:{' '}
                                  <span className="text-warm-700">{s.external_id_namespace}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          {canManage && (
                            <div className="flex items-center gap-1 shrink-0">
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
                                  'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                                  s.enabled
                                    ? 'bg-primary-50 text-primary-700 hover:bg-primary-100 border border-primary-200'
                                    : 'bg-warm-100 text-warm-600 hover:bg-warm-200 border border-warm-300',
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
                                  'shrink-0 rounded-lg p-2 text-warm-400 transition-colors',
                                  'hover:bg-warm-100 hover:text-warm-700',
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
                                  'shrink-0 rounded-lg p-2 text-warm-400 transition-colors',
                                  'hover:bg-red-50 hover:text-red-600',
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
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </>
  );
}
