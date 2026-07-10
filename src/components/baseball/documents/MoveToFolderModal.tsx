'use client';

import { useEffect, useState } from 'react';
import { IconX, IconFolder } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { InkNotice } from '@/components/baseball/living-annual';
import type { BaseballDocument } from '@/app/baseball/actions/documents';

const NO_FOLDER_VALUE = '';
const NEW_FOLDER_VALUE = '__new__';
const NEW_FOLDER_LABEL = '+ New folder…';

export interface MoveToFolderSaveData {
  id: string;
  folder: string | null;
}

interface MoveToFolderModalProps {
  open: boolean;
  document: BaseballDocument | null;
  /** Distinct folder names already in use across the team's documents. */
  folders: string[];
  onClose: () => void;
  onMove: (data: MoveToFolderSaveData) => Promise<void>;
}

export function MoveToFolderModal({ open, document, folders, onClose, onMove }: MoveToFolderModalProps) {
  const [selected, setSelected] = useState<string>(NO_FOLDER_VALUE);
  const [newFolderName, setNewFolderName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && document) {
      setSelected(document.folder || NO_FOLDER_VALUE);
      setNewFolderName('');
      setError(null);
    }
  }, [open, document]);

  if (!open || !document) return null;

  const folderOptions = [
    { value: NO_FOLDER_VALUE, label: 'No folder' },
    ...folders.map((f) => ({ value: f, label: f })),
    { value: NEW_FOLDER_VALUE, label: NEW_FOLDER_LABEL },
  ];

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSubmit = async () => {
    let folder: string | null;
    if (selected === NEW_FOLDER_VALUE) {
      if (!newFolderName.trim()) {
        setError('Enter a folder name');
        return;
      }
      folder = newFolderName.trim();
    } else {
      folder = selected || null;
    }

    setSaving(true);
    setError(null);
    try {
      await onMove({ id: document.id, folder });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move document');
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
      <div className="relative bg-cream-50 rounded-2xl shadow-2xl max-w-md w-full overflow-clip">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-200">
          <h2 className="text-lg font-semibold text-warm-900">Move to Folder</h2>
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
          <p className="text-sm text-warm-500 truncate">{document.title}</p>

          {error && <InkNotice>{error}</InkNotice>}

          <div>
            <span className="block text-sm font-medium text-warm-700 mb-1.5">Folder</span>
            <Select
              options={folderOptions}
              value={selected}
              onChange={setSelected}
            />
          </div>

          {selected === NEW_FOLDER_VALUE && (
            <Input
              label="New Folder Name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Scouting Reports"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary input revealed by choosing "new folder"
              autoFocus
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-warm-200 bg-warm-50 rounded-b-2xl">
          <Button variant="secondary" type="button" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} isLoading={saving} leftIcon={<IconFolder size={16} />}>
            Move
          </Button>
        </div>
      </div>
    </div>
  );
}

export default MoveToFolderModal;
