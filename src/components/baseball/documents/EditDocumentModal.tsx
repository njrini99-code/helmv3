'use client';

import { useEffect, useState } from 'react';
import { IconX } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { InkNotice } from '@/components/baseball/living-annual';
import type { BaseballDocument } from '@/app/baseball/actions/documents';

export interface EditDocumentModalCategory {
  value: string;
  label: string;
}

export interface EditDocumentSaveData {
  id: string;
  title: string;
  description: string;
  category: string;
  is_player_visible: boolean;
}

interface EditDocumentModalProps {
  open: boolean;
  document: BaseballDocument | null;
  categories: EditDocumentModalCategory[];
  onClose: () => void;
  onSave: (data: EditDocumentSaveData) => Promise<void>;
}

export function EditDocumentModal({ open, document, categories, onClose, onSave }: EditDocumentModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [isPlayerVisible, setIsPlayerVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && document) {
      setTitle(document.title);
      setDescription(document.description || '');
      setCategory(document.category || 'general');
      setIsPlayerVisible(document.is_player_visible);
      setError(null);
    }
  }, [open, document]);

  if (!open || !document) return null;

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: document.id,
        title: title.trim(),
        description: description.trim(),
        category,
        is_player_visible: isPlayerVisible,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      {/* eslint-disable-next-line helm/no-raw-button -- click-outside-to-close overlay, not an interactive control */}
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-warm-900/50 backdrop-blur-sm border-0 p-0 cursor-default"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-cream-50 rounded-2xl shadow-2xl max-w-lg w-full overflow-clip">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-200">
          <h2 className="text-lg font-semibold text-warm-900">Edit Document</h2>
          <IconButton
            variant="default"
            aria-label="Close"
            onClick={handleClose}
            disabled={saving}
            className="p-2 hover:bg-warm-100 active:bg-warm-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <IconX size={20} />
          </IconButton>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && <InkNotice>{error}</InkNotice>}

          <Input
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={3}
          />

          <div>
            <span className="block text-sm font-medium text-warm-700 mb-1.5">Category</span>
            <Select
              options={categories}
              value={category}
              onChange={setCategory}
            />
          </div>

          <Checkbox
            label="Visible to players"
            checked={isPlayerVisible}
            onChange={(e) => setIsPlayerVisible(e.target.checked)}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-warm-200 bg-warm-50 rounded-b-2xl">
          <Button variant="secondary" type="button" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} isLoading={saving}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
