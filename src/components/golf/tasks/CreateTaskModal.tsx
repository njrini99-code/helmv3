'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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

      // Create task
      const { data: task, error: taskError } = await (supabase as any)
        .from('golf_tasks')
        .insert({
          team_id: teamId,
          created_by: coach.id,
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDate || null,
          status: 'active'
        })
        .select()
        .single();

      if (taskError) throw taskError;

      // Assign to players
      const playerIds = assignToAll ? players.map(p => p.id) : selectedPlayers;
      const assignments = playerIds.map(playerId => ({
        task_id: task.id,
        player_id: playerId,
        status: 'pending',
        assigned_at: new Date().toISOString()
      }));

      const { error: assignError } = await (supabase as any)
        .from('golf_task_assignments')
        .insert(assignments);

      if (assignError) throw assignError;

      showToast('Task created and assigned successfully', 'success');
      setTitle('');
      setDescription('');
      setDueDate('');
      setSelectedPlayers([]);
      setAssignToAll(true);
      onTaskCreated();
      onClose();
    } catch (error) {
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
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Task">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Task Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Complete shot tracking drill"
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
                     focus:border-green-500 focus:ring-2 focus:ring-green-100
                     text-slate-900 placeholder:text-slate-400 transition-colors resize-none"
          />
        </div>

        <Input
          label="Due Date (Optional)"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />

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
              className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                assignToAll
                  ? 'border-green-600 bg-green-50 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              <p className="font-medium text-slate-900">All Team Members</p>
              <p className="text-xs text-slate-500 mt-0.5">{players.length} players</p>
            </motion.button>

            <motion.button
              type="button"
              onClick={() => setAssignToAll(false)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                !assignToAll
                  ? 'border-green-600 bg-green-50 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
              }`}
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
                  className={`w-full px-3 py-2 rounded-md text-left text-sm transition-all ${
                    selectedPlayers.includes(player.id)
                      ? 'bg-green-100 text-green-900 shadow-sm'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {player.first_name || ''} {player.last_name || ''}
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
    </Modal>
  );
}
