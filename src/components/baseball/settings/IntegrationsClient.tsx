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
// Palette: cream/green GolfHelm look reused verbatim. No navy/amber/new palette.
// No golf vocabulary. Writes re-validate can_manage_settings SERVER-SIDE.
//
// 90+ bar improvements over original:
//  - Edit existing integrations (inline expand — not just add)
//  - Status toggle: available ↔ disabled (without editing everything)
//  - framer-motion list entry + form expand with useReducedMotion guard
// =============================================================================

import { useState, useTransition } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { IconLink, IconPlus, IconLock, IconPencil } from '@/components/icons';
import { upsertIntegration } from '@/app/baseball/actions/program-settings';
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

const STATUS_TONE: Record<BaseballIntegrationStatus, string> = {
  available: 'bg-warm-100 text-warm-600 border-warm-300',
  configured: 'bg-primary-50 text-primary-700 border-primary-200',
  pending_pilot: 'bg-amber-50 text-amber-700 border-amber-200',
  disabled: 'bg-warm-100 text-warm-500 border-warm-300',
};

const STATUS_LABEL: Record<BaseballIntegrationStatus, string> = {
  available: 'Available',
  configured: 'Configured',
  pending_pilot: 'Pending pilot',
  disabled: 'Disabled',
};

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
    <CardContent className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <span className="block text-sm font-medium text-warm-700 mb-2">
          Connection level
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {LEVELS.map((l) => (
            <Button
              key={l.value}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setField('integration_level', l.value)}
              className={cn(
                'text-left rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                draft.integration_level === l.value
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-warm-200 bg-cream-50 text-warm-600 hover:border-primary-200',
              )}
            >
              {l.label}
            </Button>
          ))}
        </div>
        {levelHint && (
          <p className="text-xs leading-relaxed text-warm-500 mt-2">{levelHint}</p>
        )}
        {draft.integration_level === 4 && (
          <p className="text-xs leading-relaxed text-amber-700 mt-1">
            Level 4 is saved as pending-pilot and stays inert until pilot
            evidence and explicit vendor permission are in place.
          </p>
        )}
      </div>
      {/* Status picker in edit mode */}
      <div>
        <span className="block text-sm font-medium text-warm-700 mb-2">Status</span>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Button
              key={s.value}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setField('status', s.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                draft.status === s.value
                  ? STATUS_TONE[s.value]
                  : 'border-warm-200 bg-cream-50 text-warm-500 hover:border-warm-300',
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
    </CardContent>
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
    <>
      <Header title="Integrations" subtitle={`${teamName} • adapter contracts`}>
        {canManage && !showForm && (
          <Button onClick={() => setShowForm(true)} disabled={isPending}>
            <IconPlus size={16} className="mr-1.5" />
            Add integration
          </Button>
        )}
      </Header>

      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        <div className="rounded-xl border border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-600">
          Helm does not call vendor APIs directly. These are connection{' '}
          <span className="font-medium text-warm-800">contracts</span> only — no
          credentials are ever stored here. Direct-API (level 4) connections stay
          pending until a pilot proves them out.
        </div>

        {!canManage && (
          <div className="rounded-xl border border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-600 flex items-center gap-2">
            <IconLock size={16} className="text-warm-400 shrink-0" />
            You can view integrations but only staff with the manage-settings
            capability can change them.
          </div>
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
              <Card variant="glass">
                <CardHeader>
                  <h2 className="font-semibold text-warm-900">New integration</h2>
                  <p className="text-sm leading-relaxed text-warm-500">
                    Pick a connection level. No credential fields — contract config only.
                  </p>
                </CardHeader>
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
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {integrations.length === 0 && !showForm ? (
          <EmptyState
            variant="card"
            glass
            icon={<IconLink size={40} />}
            title="No integrations configured"
            description={
              canManage
                ? 'Add a connection contract for a stat or device source. Start with an import template (level 1) — direct API is pilot-gated.'
                : 'No integrations have been configured for this program yet.'
            }
            action={
              canManage
                ? { label: 'Add integration', onClick: () => setShowForm(true) }
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
            {integrations.map((i) => (
              <motion.div key={i.id} variants={itemVariants}>
                <Card variant="glass">
                  <CardContent className="p-5">
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
                            <h3 className="font-semibold text-warm-900">Edit {i.display_name}</h3>
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
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-warm-900">{i.display_name}</h3>
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                                  STATUS_TONE[i.status],
                                )}
                              >
                                {STATUS_LABEL[i.status]}
                              </span>
                            </div>
                            <p className="text-sm leading-relaxed text-warm-500 mt-1">
                              {i.provider_key}
                            </p>
                            <p className="text-xs text-warm-500 mt-2">
                              {LEVELS.find((l) => l.value === i.integration_level)?.label}
                            </p>
                            {i.last_synced_at && (
                              <p className="text-xs text-warm-400 mt-1">
                                Last sync: {new Date(i.last_synced_at).toLocaleString()}
                                {i.last_sync_status ? ` · ${i.last_sync_status}` : ''}
                              </p>
                            )}
                          </div>
                          {canManage && (
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Status toggle: enabled / disabled */}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleStatus(i)}
                                disabled={isPending || i.integration_level === 4}
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
                                  'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                                  i.status !== 'disabled'
                                    ? 'bg-primary-50 text-primary-700 hover:bg-primary-100 border border-primary-200'
                                    : 'bg-warm-100 text-warm-600 hover:bg-warm-200 border border-warm-300',
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
                                  'rounded-lg p-2 text-warm-400 transition-colors',
                                  'hover:bg-warm-100 hover:text-warm-700',
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
