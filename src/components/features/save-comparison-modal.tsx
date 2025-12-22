'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { IconCheck } from '@/components/icons';

interface SaveComparisonModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description?: string }) => Promise<void>;
  playerCount: number;
}

export function SaveComparisonModal({ open, onClose, onSave, playerCount }: SaveComparisonModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Please enter a comparison name');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
      });

      // Reset form
      setName('');
      setDescription('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save comparison');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) {
      setName('');
      setDescription('');
      setError(null);
      onClose();
    }
  };

  return (
    <Modal isOpen={open} onClose={handleClose} title="Save Comparison" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm leading-relaxed text-green-800">
              <IconCheck size={16} className="inline mr-1.5 text-green-600" />
              Comparing {playerCount} player{playerCount > 1 ? 's' : ''}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm leading-relaxed text-red-800">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1.5">
              Comparison Name *
            </label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., 2025 Shortstops Comparison"
              maxLength={255}
              disabled={saving}
              required
            />
            <p className="text-xs text-slate-500 mt-1">Give this comparison a memorable name</p>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1.5">
              Description (optional)
            </label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes about this comparison..."
              rows={3}
              disabled={saving}
            />
            <p className="text-xs text-slate-500 mt-1">Add any notes or context for this comparison</p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={saving || !name.trim()}
            >
              {saving ? 'Saving...' : 'Save Comparison'}
            </Button>
          </div>
        </form>
    </Modal>
  );
}
