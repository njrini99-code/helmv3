'use client';

import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
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
        <h2 className="text-base font-semibold text-warm-900">Sequences</h2>
        <Button variant="primary"
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium',
            'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
            'transition-colors shadow-sm shadow-primary-500/25',
          )}
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
              className="h-16 rounded-xl glass-subtle skeleton-shimmer"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && sequences.length === 0 && !showCreateForm && (
        <div className="py-12 text-center glass-standard rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-warm-100/80 flex items-center justify-center mx-auto mb-4">
            <IconRocket size={24} className="text-warm-400" />
          </div>
          <h3 className="text-base font-semibold text-warm-700 mb-1">
            No sequences yet
          </h3>
          <p className="text-sm text-warm-500 max-w-sm mx-auto">
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
      className="glass-standard border-primary-200 rounded-2xl p-4 space-y-3 shadow-glass"
    >
      <div>
        <label
          htmlFor="seq-name"
          className="block text-xs font-medium text-warm-700 mb-1"
        >
          Name <span className="text-red-500">*</span>
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
          className="text-sm min-h-0 py-2 rounded-lg"
        />
      </div>
      <div>
        <label
          htmlFor="seq-desc"
          className="block text-xs font-medium text-warm-700 mb-1"
        >
          Description{' '}
          <span className="text-warm-400 font-normal">(optional)</span>
        </label>
        <Textarea
          id="seq-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this sequence for?"
          className="text-sm py-2 rounded-lg"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost"
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-3 py-1.5 text-sm text-warm-600 hover:text-warm-800 transition-colors disabled:opacity-50"
        >
          Cancel
        </Button>
        <Button variant="primary"
          type="submit"
          disabled={submitting || !name.trim()}
          className={cn(
            'flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-xl shadow-sm',
            'bg-primary-600 text-white hover:bg-primary-700 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {submitting && <IconLoader size={14} className="animate-spin" />}
          Create sequence
        </Button>
      </div>
    </form>
  );
}
