'use client';

import { useEffect, useState, useCallback } from 'react';
import { IconPlus, IconLoader, IconRocket } from '@/components/icons';
import {
  listSequences,
  createSequence,
  updateSequence,
  deleteSequence,
  type CrmSequence,
} from '@/app/golf/actions/crm-sequences';
import { SequenceCard } from './SequenceCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  CRM_PRIMARY_ACTION_CLASS,
  CRM_TERTIARY_ACTION_CLASS,
} from '../../page-contracts';

interface SequencesListProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Optional preloaded counts: stepCounts[id] and activeEnrollmentCounts[id]. */
  stepCounts?: Record<string, number>;
  activeEnrollmentCounts?: Record<string, number>;
  /** Bumped by parent to force a refetch (e.g. after step edits change counts). */
  refreshKey?: number;
}

// ============================================================================
// SequencesList — table of sequences plus a "Create sequence" inline form.
// Owns loading + delete + toggle interactions for the list. Builder editing
// happens in <SequenceBuilder/> (rendered by the page below the list).
// ============================================================================
export function SequencesList({
  selectedId,
  onSelect,
  stepCounts,
  activeEnrollmentCounts,
  refreshKey,
}: SequencesListProps) {
  const [sequences, setSequences] = useState<CrmSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listSequences();
      setSequences(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sequences');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  const handleToggleActive = async (id: string, next: boolean) => {
    try {
      const updated = await updateSequence(id, { is_active: next });
      setSequences((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update sequence');
    }
  };

  const handleDelete = async (id: string) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        'Delete this sequence? All steps and enrollments will be removed.',
      );
      if (!ok) return;
    }
    try {
      await deleteSequence(id);
      setSequences((prev) => prev.filter((s) => s.id !== id));
      if (selectedId === id) onSelect(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete sequence');
    }
  };

  const handleCreated = (created: CrmSequence) => {
    setSequences((prev) => [created, ...prev]);
    setShowCreateForm(false);
    onSelect(created.id);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">Sequence library</h2>
        <Button variant="primary"
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className={CRM_PRIMARY_ACTION_CLASS}
        >
          <IconPlus size={14} /> Create sequence
        </Button>
      </div>

      {showCreateForm && (
        <CreateSequenceForm
          onCreated={handleCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 rounded-fw-md border border-border-subtle bg-surface-tint skeleton-shimmer"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="px-4 py-3 rounded-fw-md bg-fw-danger-bg border border-fw-danger/25 text-sm text-fw-danger-ink">
          {error}
        </div>
      )}

      {!loading && !error && sequences.length === 0 && !showCreateForm && (
        <div className="py-8 sm:py-12 text-center rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]">
          <div className="w-11 h-11 rounded-fw-md bg-surface-tint flex items-center justify-center mx-auto mb-3">
            <IconRocket size={20} className="text-text-tertiary" />
          </div>
          <h3 className="text-base font-semibold text-text-secondary mb-1">
            No sequences yet
          </h3>
          <p className="text-sm text-text-tertiary max-w-sm mx-auto">
            Create your first sequence to start drip campaigns. Each step sends
            an email after a configurable delay.
          </p>
        </div>
      )}

      {!loading && !error && sequences.length > 0 && (
        <div className="space-y-2">
          {sequences.map((seq) => (
            <SequenceCard
              key={seq.id}
              sequence={seq}
              stepCount={stepCounts?.[seq.id]}
              activeEnrollmentCount={activeEnrollmentCounts?.[seq.id]}
              isSelected={selectedId === seq.id}
              onClick={() => onSelect(seq.id === selectedId ? null : seq.id)}
              onToggleActive={(next) => handleToggleActive(seq.id, next)}
              onDelete={() => handleDelete(seq.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CreateSequenceForm — inline form at top of the list.
// ============================================================================
function CreateSequenceForm({
  onCreated,
  onCancel,
}: {
  onCreated: (seq: CrmSequence) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createSequence({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sequence');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-accent-200 bg-surface [box-shadow:var(--fw-shadow-card)] rounded-card p-4 space-y-3"
    >
      <div>
        <label
          htmlFor="seq-name"
          className="block text-xs font-medium text-text-secondary mb-1"
        >
          Name <span className="text-fw-danger">*</span>
        </label>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- intentional default focus in dialog */}
        <Input autoFocus
          id="seq-name"
          type="text"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Cold outreach — D2 women's golf"
          className="text-sm min-h-0 py-2 rounded-fw-sm"
        />
      </div>
      <div>
        <label
          htmlFor="seq-desc"
          className="block text-xs font-medium text-text-secondary mb-1"
        >
          Description{' '}
          <span className="text-text-tertiary font-normal">(optional)</span>
        </label>
        <Textarea
          id="seq-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this sequence for?"
          className="text-sm py-2 rounded-fw-sm"
        />
      </div>

      {error && <p className="text-xs text-fw-danger-ink">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost"
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className={CRM_TERTIARY_ACTION_CLASS}
        >
          Cancel
        </Button>
        <Button variant="primary"
          type="submit"
          disabled={submitting || !name.trim()}
          className={CRM_PRIMARY_ACTION_CLASS}
        >
          {submitting && <IconLoader size={14} className="animate-spin" />}
          Create sequence
        </Button>
      </div>
    </form>
  );
}
