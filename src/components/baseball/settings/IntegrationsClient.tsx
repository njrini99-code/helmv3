'use client';

// =============================================================================
// src/components/baseball/settings/IntegrationsClient.tsx
//
// Wave 4 / packet: settings-os
//
// Consuming UI for integration adapter contracts (v4 §Integrations Philosophy).
// listIntegrations / upsertIntegration were already implemented and gated — this
// surface makes them reachable.
//
// ZIP NON-NEGOTIABLE honored visibly: NO direct vendor integrations. The UI
// describes connection LEVELS (1 import template, 2 attachment/link, 3 assisted
// import, 4 direct API) and explicitly marks level-4 as pilot-gated/inert. No
// credential fields are ever shown or sent.
//
// No golf vocabulary. Writes re-validate can_manage_settings SERVER-SIDE.
//
// DESIGN MIGRATION (settings unification)
// ---------------------------------------
// This screen was the loudest holdout in the settings tree: a hand-rolled
// `border-b border-warm-200/60` title bar where its sibling (Import Sources)
// already wore a `SectionMasthead`, legacy `Card variant="glass"` panels, the
// generic `@/components/ui/empty-state` EmptyState, and status/level pills
// painted in `primary-*` and `warm-*`. Navigating Imports → Integrations
// visibly changed design system mid-flow.
//
// It now composes from `SettingsChrome` + the Living Annual kit, exactly like
// Import Sources: `SettingsShell` masthead, `SettingsSection` for the add form,
// `PaperCard` rows, `SettingsNotice` for policy/capability context,
// `EditorsLetter` for the empty state, and `InkBadge` for status stamps.
//
// PRESENTATION-ONLY: `upsertIntegration` payloads, the level-4 inert rule, the
// `canManage` gate, every toast string, and all ARIA wiring are untouched.
// =============================================================================

import { useState, useTransition } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { IconPlus, IconLock, IconPencil } from '@/components/icons';
import { upsertIntegration } from '@/app/baseball/actions/program-settings';
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
import type {
  BaseballIntegrationConfig,
  BaseballIntegrationStatus,
} from '@/lib/types/baseball-settings';

interface Props {
  teamName: string;
  canManage: boolean;
  integrations: BaseballIntegrationConfig[];
}

const LEVELS: { value: 1 | 2 | 3 | 4; label: string; hint: string }[] = [
  { value: 1, label: 'Level 1 — Import template', hint: 'CSV/XLSX/XML upload, mapping, validation, commit/rollback.' },
  { value: 2, label: 'Level 2 — Attachment / link', hint: 'Report PDF, video link, external dashboard link.' },
  { value: 3, label: 'Level 3 — Assisted import', hint: 'AI mapping suggestions, recurring presets, external IDs.' },
  { value: 4, label: 'Level 4 — Direct API', hint: 'Inert until pilot evidence + explicit vendor permission.' },
];

/**
 * Status stamps in the two-ink lane rather than `primary-*` / `warm-*` pills.
 * `pending_pilot` stays clay (doctrine: caution -> pursuit, never amber) and
 * `configured` is the only green — a configured adapter is the good state, and
 * green is what carries "good" everywhere else in the product.
 */
const STATUS_TONE: Record<BaseballIntegrationStatus, 'team' | 'pursuit' | 'neutral'> = {
  available: 'neutral',
  configured: 'team',
  pending_pilot: 'pursuit',
  disabled: 'neutral',
};

const STATUS_LABEL: Record<BaseballIntegrationStatus, string> = {
  available: 'Available',
  configured: 'Configured',
  pending_pilot: 'Pending pilot',
  disabled: 'Disabled',
};

/** Selected vs unselected chrome for the level + status radio groups. */
const OPTION_BASE =
  'rounded-fw-sm border px-3 py-2 text-left text-sm font-medium transition-colors duration-200';
const OPTION_SELECTED = 'border-grade-plus bg-grade-plus/10 text-text-primary';
const OPTION_IDLE =
  'border-[color:var(--hairline)] bg-[var(--paper-canvas)] text-text-secondary hover:border-grade-plus/40';

interface DraftIntegration {
  provider_key: string;
  display_name: string;
  integration_level: 1 | 2 | 3 | 4;
  status: BaseballIntegrationStatus;
}

const EMPTY_DRAFT: DraftIntegration = {
  provider_key: '',
  display_name: '',
  integration_level: 1,
  status: 'available',
};

function integrationToDraft(i: BaseballIntegrationConfig): DraftIntegration {
  return {
    provider_key: i.provider_key,
    display_name: i.display_name,
    integration_level: i.integration_level,
    status: i.status,
  };
}

const STATUSES: { value: BaseballIntegrationStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'configured', label: 'Configured' },
  { value: 'pending_pilot', label: 'Pending pilot' },
  { value: 'disabled', label: 'Disabled' },
];

/** Shared form body for add + edit modes. */
function IntegrationFormBody({
  draft,
  setDraft,
  isPending,
  onSave,
  onCancel,
  saveLabel,
}: {
  draft: DraftIntegration;
  setDraft: React.Dispatch<React.SetStateAction<DraftIntegration>>;
  isPending: boolean;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  const setField = <K extends keyof DraftIntegration>(
    key: K,
    value: DraftIntegration[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const levelHint = LEVELS.find((l) => l.value === draft.integration_level)?.hint;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Provider key"
          value={draft.provider_key}
          placeholder="e.g. trackman, gamechanger, teambuildr"
          onChange={(e) => setField('provider_key', e.target.value)}
        />
        <Input
          label="Display name"
          value={draft.display_name}
          placeholder="e.g. TrackMan"
          onChange={(e) => setField('display_name', e.target.value)}
        />
      </div>
      <div>
        <span id="integration-level-label" className="mb-2 block text-sm font-medium text-text-primary">
          Connection level
        </span>
        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          role="radiogroup"
          aria-labelledby="integration-level-label"
        >
          {LEVELS.map((l) => (
            <Button
              key={l.value}
              type="button"
              variant="ghost"
              size="sm"
              role="radio"
              aria-checked={draft.integration_level === l.value}
              onClick={() => setField('integration_level', l.value)}
              className={cn(
                OPTION_BASE,
                draft.integration_level === l.value ? OPTION_SELECTED : OPTION_IDLE,
              )}
            >
              {l.label}
            </Button>
          ))}
        </div>
        {levelHint && (
          <p className="mt-2 text-xs leading-relaxed text-text-tertiary">{levelHint}</p>
        )}
        {draft.integration_level === 4 && (
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--notice-error-ink)]">
            Level 4 is saved as pending-pilot and stays inert until pilot
            evidence and explicit vendor permission are in place.
          </p>
        )}
      </div>
      {/* Status picker in edit mode */}
      <div>
        <span id="integration-status-label" className="mb-2 block text-sm font-medium text-text-primary">
          Status
        </span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="integration-status-label">
          {STATUSES.map((s) => (
            <Button
              key={s.value}
              type="button"
              variant="ghost"
              size="sm"
              role="radio"
              aria-checked={draft.status === s.value}
              onClick={() => setField('status', s.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200',
                draft.status === s.value ? OPTION_SELECTED : OPTION_IDLE,
              )}
            >
              {s.label}
            </Button>
          ))}
        </div>
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

export function IntegrationsClient({ teamName, canManage, integrations }: Props) {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftIntegration>(EMPTY_DRAFT);
  const [editDraft, setEditDraft] = useState<DraftIntegration>(EMPTY_DRAFT);
  const reduceMotion = useReducedMotion();

  const handleSave = () => {
    if (!draft.provider_key.trim() || !draft.display_name.trim()) {
      showToast('Provider key and display name are required.', 'error');
      return;
    }
    startTransition(async () => {
      try {
        await upsertIntegration({
          provider_key: draft.provider_key.trim(),
          display_name: draft.display_name.trim(),
          integration_level: draft.integration_level,
          status: draft.status,
        });
        setDraft(EMPTY_DRAFT);
        setShowForm(false);
        showToast('Integration saved', 'success');
      } catch {
        showToast('Could not save the integration. Check your access and try again.', 'error');
      }
    });
  };

  const handleEdit = (i: BaseballIntegrationConfig) => {
    setEditingId(i.id);
    setEditDraft(integrationToDraft(i));
  };

  const handleSaveEdit = (id: string) => {
    if (!editDraft.provider_key.trim() || !editDraft.display_name.trim()) {
      showToast('Provider key and display name are required.', 'error');
      return;
    }
    startTransition(async () => {
      try {
        await upsertIntegration({
          id,
          provider_key: editDraft.provider_key.trim(),
          display_name: editDraft.display_name.trim(),
          integration_level: editDraft.integration_level,
          status: editDraft.status,
        });
        setEditingId(null);
        showToast('Integration updated', 'success');
      } catch {
        showToast('Could not update the integration.', 'error');
      }
    });
  };

  const handleToggleStatus = (i: BaseballIntegrationConfig) => {
    const nextStatus: BaseballIntegrationStatus =
      i.status === 'disabled' ? 'available' : 'disabled';
    startTransition(async () => {
      try {
        await upsertIntegration({
          id: i.id,
          provider_key: i.provider_key,
          display_name: i.display_name,
          integration_level: i.integration_level,
          status: nextStatus,
        });
        showToast(
          nextStatus === 'disabled'
            ? `Disabled "${i.display_name}"`
            : `Enabled "${i.display_name}"`,
          'success',
        );
      } catch {
        showToast('Could not update the integration.', 'error');
      }
    });
  };

  const listVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 6 },
    show: { opacity: 1, y: 0, transition: { duration: 0.16 } },
  };

  return (
    <SettingsShell
      title="Integrations"
      lede={`${teamName} • adapter contracts`}
      actions={
        canManage && !showForm ? (
          <Button onClick={() => setShowForm(true)} disabled={isPending}>
            <IconPlus size={16} className="mr-1.5" />
            Add integration
          </Button>
        ) : undefined
      }
    >
      <SettingsNotice>
        Helm does not call vendor APIs directly. These are connection{' '}
        <span className="font-medium text-text-primary">contracts</span> only — no
        credentials are ever stored here. Direct-API (level 4) connections stay
        pending until a pilot proves them out.
      </SettingsNotice>

      {!canManage && (
        <SettingsNotice icon={<IconLock size={16} />}>
          You can view integrations but only staff with the manage-settings
          capability can change them.
        </SettingsNotice>
      )}

      {/* Add new integration form */}
      <AnimatePresence>
        {canManage && showForm && (
          <motion.div
            initial={reduceMotion ? {} : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? {} : { opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <SettingsSection
              title="New integration"
              subtitle="Pick a connection level. No credential fields — contract config only."
              bodySpacing="none"
            >
              <IntegrationFormBody
                draft={draft}
                setDraft={setDraft}
                isPending={isPending}
                onSave={handleSave}
                onCancel={() => {
                  setShowForm(false);
                  setDraft(EMPTY_DRAFT);
                }}
                saveLabel="Save integration"
              />
            </SettingsSection>
          </motion.div>
        )}
      </AnimatePresence>

      {integrations.length === 0 && !showForm ? (
        <EditorsLetter
          ink="team"
          title="No integrations configured."
          body={
            canManage
              ? 'Add a connection contract for a stat or device source. Start with an import template (level 1) — direct API is pilot-gated.'
              : 'No integrations have been configured for this program yet.'
          }
          action={
            canManage ? (
              <Button size="sm" onClick={() => setShowForm(true)}>
                Add integration
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
          {integrations.map((i) => (
            <motion.div key={i.id} variants={itemVariants}>
              <PaperCard className="p-5">
                <AnimatePresence>
                  {editingId === i.id ? (
                    <motion.div
                      key="edit"
                      initial={reduceMotion ? {} : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={reduceMotion ? {} : { opacity: 0 }}
                      transition={{ duration: 0.14 }}
                    >
                      <div className="mb-3">
                        <h3 className="font-annual text-body font-semibold text-text-primary">
                          Edit {i.display_name}
                        </h3>
                      </div>
                      <IntegrationFormBody
                        draft={editDraft}
                        setDraft={setEditDraft}
                        isPending={isPending}
                        onSave={() => handleSaveEdit(i.id)}
                        onCancel={() => setEditingId(null)}
                        saveLabel="Save changes"
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="view"
                      initial={reduceMotion ? {} : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={reduceMotion ? {} : { opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-annual text-body font-semibold text-text-primary">
                            {i.display_name}
                          </h3>
                          <InkBadge
                            label={STATUS_LABEL[i.status]}
                            tone={STATUS_TONE[i.status]}
                            variant="solid"
                          />
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                          {i.provider_key}
                        </p>
                        <p className="mt-2 text-xs text-text-tertiary">
                          {LEVELS.find((l) => l.value === i.integration_level)?.label}
                        </p>
                        {i.last_synced_at && (
                          <p className="mt-1 text-xs text-text-tertiary">
                            Last sync: {new Date(i.last_synced_at).toLocaleString()}
                            {i.last_sync_status ? ` · ${i.last_sync_status}` : ''}
                          </p>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex shrink-0 items-center gap-1">
                          {/* Status toggle: enabled / disabled */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(i)}
                            disabled={isPending || i.integration_level === 4}
                            aria-pressed={i.status !== 'disabled'}
                            aria-label={
                              i.status === 'disabled'
                                ? `Enable ${i.display_name}`
                                : `Disable ${i.display_name}`
                            }
                            title={
                              i.integration_level === 4
                                ? 'Level 4 is pilot-gated — status is managed via the pilot process'
                                : i.status === 'disabled'
                                  ? 'Enable integration'
                                  : 'Disable integration'
                            }
                            className={cn(
                              'rounded-fw-sm border px-2.5 py-1.5 text-xs font-medium transition-colors duration-200',
                              i.status !== 'disabled' ? OPTION_SELECTED : OPTION_IDLE,
                              (isPending || i.integration_level === 4) &&
                                'cursor-not-allowed opacity-50',
                            )}
                          >
                            {i.status === 'disabled' ? 'Disabled' : 'Active'}
                          </Button>
                          {/* Edit */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(i)}
                            disabled={isPending}
                            aria-label={`Edit ${i.display_name}`}
                            className={cn(
                              'rounded-fw-sm p-2 text-text-tertiary transition-colors duration-200',
                              'hover:bg-grade-plus/10 hover:text-grade-plus',
                              isPending && 'cursor-not-allowed opacity-50',
                            )}
                          >
                            <IconPencil size={16} />
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </PaperCard>
            </motion.div>
          ))}
        </motion.div>
      )}
    </SettingsShell>
  );
}
