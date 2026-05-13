'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { IconX, IconPlus, IconTrash } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { getFullName } from '@/lib/utils';
import { useToast } from '@/components/ui/sonner';

interface CreateDevPlanModalProps {
  open: boolean;
  onClose: () => void;
  teamId: string | null;
}

interface RosterPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  primary_position: string | null;
  grad_year: number | null;
}

interface Goal {
  id: string;
  title: string;
  description: string;
  target_date: string;
}

export function CreateDevPlanModal({ open, onClose, teamId }: CreateDevPlanModalProps) {
  const router = useRouter();
  const { coach } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: '',
    end_date: '',
  });
  const [goals, setGoals] = useState<Goal[]>([]);

  const fetchRosterPlayers = useCallback(async () => {
    if (!teamId) return;

    setLoadingPlayers(true);
    const supabase = createClient();

    const { data } = await supabase
      .from('baseball_team_members')
      .select(`
        player:baseball_players (
          id,
          first_name,
          last_name,
          avatar_url,
          primary_position,
          grad_year
        )
      `)
      .eq('team_id', teamId)
      .is('left_at', null);

    if (data) {
      const playerList = data
        .map(tm => tm.player)
        .filter((p): p is RosterPlayer => p !== null);
      setPlayers(playerList);
    }
    setLoadingPlayers(false);
  }, [teamId]);

  useEffect(() => {
    if (open && teamId) {
      fetchRosterPlayers();
    }
  }, [open, teamId, fetchRosterPlayers]);

  const addGoal = () => {
    setGoals([
      ...goals,
      {
        id: crypto.randomUUID(),
        title: '',
        description: '',
        target_date: '',
      },
    ]);
  };

  const updateGoal = (id: string, field: keyof Goal, value: string) => {
    setGoals(goals.map(g => (g.id === id ? { ...g, [field]: value } : g)));
  };

  const removeGoal = (id: string) => {
    setGoals(goals.filter(g => g.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coach || !selectedPlayerId) return;

    setLoading(true);
    const supabase = createClient();

    // Filter out empty goals
    const validGoals = goals.filter(g => g.title.trim());

    const { error } = await supabase.from('baseball_developmental_plans').insert({
      coach_id: coach.id,
      player_id: selectedPlayerId,
      team_id: teamId,
      title: formData.title,
      description: formData.description || null,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      goals: validGoals.map(g => ({
        title: g.title,
        description: g.description,
        target_date: g.target_date,
        completed: false,
      })),
      status: 'sent',
      created_at: new Date().toISOString(),
    });

    setLoading(false);

    if (error) {
      console.error('Error creating dev plan:', error);
      showToast('Failed to create development plan. Please try again.', 'error');
      return;
    }

    showToast('Development plan created successfully', 'success');
    // Reset form
    setFormData({ title: '', description: '', start_date: '', end_date: '' });
    setGoals([]);
    setSelectedPlayerId('');
    onClose();
    router.refresh();
  };

  if (!open) return null;


  return (
    <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="relative glass-prominent rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-clip flex flex-col">
        {/* Shine effect */}
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          }}
        />
        {/* Header */}
        <div className="px-6 py-4 border-b border-warm-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-warm-900">Create Development Plan</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 transition-colors"
            aria-label="Close development plan modal"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Player Selection */}
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-2">
              Select Player *
            </label>
            {loadingPlayers ? (
              <div className="text-sm leading-relaxed text-warm-500">Loading roster...</div>
            ) : players.length === 0 ? (
              <div className="text-sm leading-relaxed text-warm-500">
                No players in roster. Add players to your team first.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-warm-200 rounded-lg p-2">
                {players.map(player => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => setSelectedPlayerId(player.id)}
                    className={`flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                      selectedPlayerId === player.id
                        ? 'bg-primary-50 border-2 border-primary-500'
                        : 'hover:bg-warm-50 active:bg-warm-100 border-2 border-transparent'
                    }`}
                  >
                    <Avatar
                      name={getFullName(player.first_name, player.last_name)}
                      src={player.avatar_url || undefined}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-warm-900 truncate">
                        {getFullName(player.first_name, player.last_name)}
                      </p>
                      <p className="text-xs text-warm-500">
                        {player.primary_position} • {player.grad_year}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Plan Details */}
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-1">
              Plan Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900"
              placeholder="Off-Season Hitting Development"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-warm-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="w-full px-4 py-2.5 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900 resize-none"
              placeholder="Describe the focus areas and expectations..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900"
              />
            </div>
          </div>

          {/* Goals */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-warm-700">
                Goals
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={addGoal}>
                <IconPlus size={14} className="mr-1" />
                Add Goal
              </Button>
            </div>

            {goals.length === 0 ? (
              <div className="border border-dashed border-warm-300 rounded-lg p-6 text-center">
                <p className="text-sm leading-relaxed text-warm-500 mb-2">No goals added yet</p>
                <Button type="button" variant="secondary" size="sm" onClick={addGoal}>
                  <IconPlus size={14} className="mr-1" />
                  Add First Goal
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {goals.map((goal, index) => (
                  <div
                    key={goal.id}
                    className="border border-warm-200 rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-warm-500">
                        Goal {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeGoal(goal.id)}
                        className="p-1 text-warm-400 hover:text-red-500 transition-colors"
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={goal.title}
                      onChange={e => updateGoal(goal.id, 'title', e.target.value)}
                      placeholder="Goal title (e.g., Increase bat speed)"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={goal.description}
                        onChange={e => updateGoal(goal.id, 'description', e.target.value)}
                        placeholder="Description (optional)"
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                      />
                      <input
                        type="date"
                        value={goal.target_date}
                        onChange={e => updateGoal(goal.id, 'target_date', e.target.value)}
                        className="px-3 py-2 text-sm rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-warm-200 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !selectedPlayerId || !formData.title}
          >
            {loading ? 'Creating...' : 'Create Plan'}
          </Button>
        </div>
      </div>
    </div>
  );
}
