'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { createClient } from '@/lib/supabase/client';
import { fromUntyped } from '@/lib/supabase/untyped';
import { useToast } from '@/components/ui/toast';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ReminderPicker } from './ReminderPicker';
import { triggerHaptic } from '@/lib/utils/capacitor';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: () => void;
  teamId: string;
  players: Array<{ id: string; first_name: string | null; last_name: string | null }>;
}

export function CreateTaskModal({ isOpen, onClose, onTaskCreated, teamId, players }: CreateTaskModalProps) {
  const { modalRef } = useFocusTrap(isOpen, onClose);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reminderAt, setReminderAt] = useState<string | null>(null);
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
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get coach ID
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!coach) throw new Error('Coach not found');

      // Create task via untyped helper (table not in generated types)
      // Note: golf_tasks has assigned_by (not created_by), status defaults to 'pending'
      const taskResult = await fromUntyped(supabase, 'golf_tasks')
        .insert({
          team_id: teamId,
          assigned_by: coach.id,
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDate || null,
          reminder_at: reminderAt || null,
          reminder_sent: false,
          status: 'pending'
        })
        .select()
        .single() as { data: { id: string } | null; error: { message?: string } | null };
      
      const { data: task, error: taskError } = taskResult;

      if (taskError) throw taskError;
      if (!task || !task.id) throw new Error('Failed to create task: no task ID returned');

      // Assign to players
      const playerIds = assignToAll ? players.map(p => p.id) : selectedPlayers;
      const assignments = playerIds.map(playerId => ({
        task_id: task.id,
        player_id: playerId,
        status: 'pending',
        assigned_at: new Date().toISOString()
      }));

      // Table not in generated types - use untyped helper
      const assignResult = await fromUntyped(supabase, 'golf_task_assignments')
        .insert(assignments) as { error: { message?: string } | null };
      
      const { error: assignError } = assignResult;

      if (assignError) throw assignError;

      void triggerHaptic('success');
      showToast('Task created and assigned successfully', 'success');
      setTitle('');
      setDescription('');
      setDueDate('');
      setReminderAt(null);
      setSelectedPlayers([]);
      setAssignToAll(true);
      onTaskCreated();
      onClose();
    } catch (error) {
      void triggerHaptic('error');
      showToast(error instanceof Error ? error.message : 'Failed to create task', 'error');
    } finally {
      setLoading(false);
    }
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
      <div ref={modalRef}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Task Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Complete shot tracking drill"
          required
          autoFocus
          enterKeyHint="next"
        />

        <Textarea
          label="Description (Optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add more details about this task..."
          rows={3}
          enterKeyHint="done"
        />

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

        <div>
          <label className="text-sm font-medium text-warm-700 block mb-2">
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
              className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                assignToAll
                  ? 'border-primary-600 bg-primary-50 shadow-sm'
                  : 'border-warm-200 hover:border-warm-300 hover:shadow-sm'
              }`}
            >
              <p className="font-medium text-warm-900">All Team Members</p>
              <p className="text-xs text-warm-500 mt-0.5">{players.length} players</p>
            </motion.button>

            <motion.button
              type="button"
              onClick={() => setAssignToAll(false)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                !assignToAll
                  ? 'border-primary-600 bg-primary-50 shadow-sm'
                  : 'border-warm-200 hover:border-warm-300 hover:shadow-sm'
              }`}
            >
              <p className="font-medium text-warm-900">Specific Players</p>
              <p className="text-xs text-warm-500 mt-0.5">
                {selectedPlayers.length > 0 ? `${selectedPlayers.length} selected` : 'Select players below'}
              </p>
            </motion.button>
          </div>

          <AnimatePresence>
            {!assignToAll && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
                style={{ overflow: 'hidden' }}
                className="mt-3 max-h-48 overflow-y-auto space-y-1 border border-warm-200 rounded-lg p-2"
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
                    className={`w-full px-3 py-2 rounded-md text-left text-sm transition-all ${
                      selectedPlayers.includes(player.id)
                        ? 'bg-primary-100 text-primary-900 shadow-sm'
                        : 'hover:bg-warm-50 active:bg-warm-100 text-warm-700'
                    }`}
                  >
                    {player.first_name || ''} {player.last_name || ''}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-warm-200">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={loading}>
            Create Task
          </Button>
        </div>
      </form>
      </div>
    </BottomSheet>
  );
}
