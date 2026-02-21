'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { IconCheck, IconUsers } from '@/components/icons';
import { createTaskFromTemplate, type BaseballTaskTemplate } from '@/app/baseball/actions/tasks';
import { cn } from '@/lib/utils';

interface CreateFromTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: () => void;
  template: BaseballTaskTemplate;
  teamId: string;
  players: Array<{ id: string; first_name: string | null; last_name: string | null }>;
}

export function CreateFromTemplateModal({
  isOpen,
  onClose,
  onTaskCreated,
  template,
  teamId,
  players,
}: CreateFromTemplateModalProps) {
  const [loading, setLoading] = useState(false);
  const [customTitle, setCustomTitle] = useState(template.title);
  const [customDueDate, setCustomDueDate] = useState(() => {
    if (template.default_due_days) {
      const date = new Date();
      date.setDate(date.getDate() + template.default_due_days);
      return date.toISOString().split('T')[0];
    }
    return '';
  });
  const [assignToAll, setAssignToAll] = useState(
    template.default_assignee_type === 'all_players'
  );
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const { showToast } = useToast();

  function togglePlayer(playerId: string) {
    setSelectedPlayers((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  }

  function formatCategoryLabel(cat: string) {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!assignToAll && selectedPlayers.length === 0) {
      showToast('Please select at least one player or assign to all', 'error');
      return;
    }

    setLoading(true);

    try {
      const playerIds = assignToAll ? undefined : selectedPlayers;
      const result = await createTaskFromTemplate(
        template.id,
        teamId,
        playerIds,
        customTitle !== template.title ? customTitle : undefined,
        customDueDate || undefined
      );

      if (result.success) {
        showToast('Task created from template', 'success');
        onTaskCreated();
        onClose();
      } else {
        showToast(result.error || 'Failed to create task', 'error');
      }
    } catch {
      showToast('An error occurred', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Task from Template">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Template Info */}
        <div className="bg-slate-50 rounded-lg p-3 mb-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
            Template
          </p>
          <p className="font-medium text-slate-900">{template.title}</p>
          {template.description && (
            <p className="text-sm text-slate-500 mt-1">{template.description}</p>
          )}
          {template.category && (
            <span className="inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-600">
              {formatCategoryLabel(template.category)}
            </span>
          )}
        </div>

        {/* Customization Options */}
        <Input
          label="Task Title"
          value={customTitle}
          onChange={(e) => setCustomTitle(e.target.value)}
          placeholder="Task title"
        />

        <Input
          label="Due Date"
          type="date"
          value={customDueDate}
          onChange={(e) => setCustomDueDate(e.target.value)}
        />

        {/* Assignment */}
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-2">
            Assign To
          </label>

          <div className="space-y-2">
            <motion.button
              type="button"
              onClick={() => {
                setAssignToAll(true);
                setSelectedPlayers([]);
              }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={cn(
                'w-full p-3 rounded-lg border-2 text-left transition-all',
                assignToAll
                  ? 'border-primary-600 bg-primary-50 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
              )}
            >
              <div className="flex items-center gap-2">
                <IconUsers size={16} className={assignToAll ? 'text-primary-600' : 'text-slate-400'} />
                <div>
                  <p className="font-medium text-slate-900">All Team Members</p>
                  <p className="text-xs text-slate-500 mt-0.5">{players.length} players</p>
                </div>
              </div>
            </motion.button>

            <motion.button
              type="button"
              onClick={() => setAssignToAll(false)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={cn(
                'w-full p-3 rounded-lg border-2 text-left transition-all',
                !assignToAll
                  ? 'border-primary-600 bg-primary-50 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
              )}
            >
              <p className="font-medium text-slate-900">Specific Players</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedPlayers.length > 0
                  ? `${selectedPlayers.length} selected`
                  : 'Select players below'}
              </p>
            </motion.button>
          </div>

          {!assignToAll && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="mt-3 max-h-48 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-2"
            >
              {players.map((player, index) => (
                <motion.button
                  key={player.id}
                  type="button"
                  onClick={() => togglePlayer(player.id)}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  whileHover={{ scale: 1.01, x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    'w-full px-3 py-2 rounded-md text-left text-sm flex items-center justify-between transition-all',
                    selectedPlayers.includes(player.id)
                      ? 'bg-primary-100 text-primary-900 shadow-sm'
                      : 'hover:bg-slate-50 active:bg-slate-100 text-slate-700'
                  )}
                >
                  <span>
                    {player.first_name || ''} {player.last_name || ''}
                  </span>
                  {selectedPlayers.includes(player.id) && (
                    <IconCheck size={14} className="text-primary-600" />
                  )}
                </motion.button>
              ))}
            </motion.div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={loading}>
            Create Task
          </Button>
        </div>
      </form>
    </Modal>
  );
}
