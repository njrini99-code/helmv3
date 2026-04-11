'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { IconCheck } from '@/components/icons';
import { createTask } from '@/app/baseball/actions/tasks';
import { ReminderPicker } from './ReminderPicker';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'academic', label: 'Academic' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'practice', label: 'Practice' },
  { value: 'game_prep', label: 'Game Prep' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-700' },
  { value: 'normal', label: 'Normal', color: 'bg-primary-100 text-primary-700' },
  { value: 'high', label: 'High', color: 'bg-red-100 text-red-700' },
];

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: () => void;
  teamId: string;
  players: Array<{ id: string; first_name: string | null; last_name: string | null }>;
}

export function CreateTaskModal({ isOpen, onClose, onTaskCreated, teamId, players }: CreateTaskModalProps) {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('normal');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [assignToAll, setAssignToAll] = useState(true);
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      showToast('Task title is required', 'error');
      return;
    }

    if (!assignToAll && selectedPlayers.length === 0) {
      showToast('Please select at least one player or assign to all', 'error');
      return;
    }

    setLoading(true);

    try {
      const playerIds = assignToAll ? players.map(p => p.id) : selectedPlayers;

      const result = await createTask(teamId, {
        title: title.trim(),
        description: description.trim() || undefined,
        due_date: dueDate || undefined,
        category,
        priority,
        reminder_at: reminderAt || undefined,
        player_ids: playerIds,
      });

      if (result.success) {
        showToast('Task created and assigned successfully', 'success');
        resetForm();
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

  function resetForm() {
    setTitle('');
    setDescription('');
    setDueDate('');
    setReminderAt(null);
    setCategory('general');
    setPriority('normal');
    setSelectedPlayers([]);
    setAssignToAll(true);
  }

  function togglePlayer(playerId: string) {
    setSelectedPlayers(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  }

  return (
    <BottomSheet open={isOpen} onClose={onClose} title="Create New Task">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Task Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Complete batting practice drill"
          required
          autoFocus
        />

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Description (Optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add more details about this task..."
            rows={3}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                     focus:border-primary-500 focus:ring-2 focus:ring-primary-100
                     text-slate-900 placeholder:text-slate-400 transition-colors resize-none"
          />
        </div>

        {/* Category & Priority */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200
                       focus:border-primary-500 focus:ring-2 focus:ring-primary-100
                       text-slate-900 bg-white transition-colors"
            >
              {CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Priority
            </label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                    priority === p.value
                      ? p.color + ' border-transparent'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Due Date & Reminder */}
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <Input
              label="Due Date (Optional)"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <ReminderPicker
            dueDate={dueDate}
            value={reminderAt ?? undefined}
            onChange={(newReminderAt) => setReminderAt(newReminderAt)}
          />
        </div>

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
              <p className="font-medium text-slate-900">All Team Members</p>
              <p className="text-xs text-slate-500 mt-0.5">{players.length} players</p>
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
                {selectedPlayers.length > 0 ? `${selectedPlayers.length} selected` : 'Select players below'}
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
                  <span>{player.first_name || ''} {player.last_name || ''}</span>
                  {selectedPlayers.includes(player.id) && (
                    <IconCheck size={14} className="text-primary-600" />
                  )}
                </motion.button>
              ))}
            </motion.div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={loading}>
            Create Task
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
