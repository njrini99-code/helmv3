'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar } from '@/components/ui/avatar';
import { IconX, IconPlus, IconTrash } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { getFullName } from '@/lib/utils';
import { useToast } from '@/components/ui/sonner';
import type { DevPlanGoal } from '@/lib/baseball/dev-plan-types';
import type { Json } from '@/lib/types/database';

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
  const uid = useId();
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

    // NOTE: `baseball_team_members` has no `left_at` column (see the
    // generated schema in src/lib/types/database.ts) — membership end is
    // not tracked by a timestamp. Filtering on `.is('left_at', null)`
    // made every request to this table error out, so `data` was always
    // null and the picker always rendered the "No players in roster"
    // empty state regardless of actual roster size. Query the same way
    // the canonical roster read model does (getRoster in
    // src/lib/baseball/read-models/roster.ts): all current team_members
    // rows for this team, no status filter, so the picker always matches
    // what the Roster page shows.
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
      .order('joined_at', { ascending: false });

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

    // Persist the FULL goal shape (id/progress/status/created_at) — not just
    // title/description/target_date. Dropping `id` here means every fetch
    // mints a brand-new random id (see parseGoals in actions/dev-plans.ts),
    // so any goalId captured by the UI is stale on the next request and
    // completing a goal always fails with "Goal not found".
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from('baseball_developmental_plans').insert({
      coach_id: coach.id,
      player_id: selectedPlayerId,
      team_id: teamId,
      title: formData.title,
      description: formData.description || null,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      goals: validGoals.map((g): DevPlanGoal => ({
        id: g.id,
        title: g.title,
        description: g.description || undefined,
        target_date: g.target_date || undefined,
        progress: 0,
        status: 'not_started',
        created_at: nowIso,
      })) as unknown as Json,
      status: 'sent',
      created_at: nowIso,
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
    // Bottom-anchored on phone (`items-end`) and keyboard-safe (`dvh`, not
    // static `vh`) — a vertically-centered `vh`-sized card doesn't reflow when
    // the on-screen keyboard opens for the title/description/goal fields, and
    // can end up with the "Create Plan" CTA pinned past the visible viewport.
    // Centered dialog is unchanged at `sm:` and above.
    <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm flex items-end justify-center z-50 p-0 sm:items-center sm:p-4">
      <div className="relative glass-prominent shadow-xl max-w-2xl w-full max-h-[calc(100dvh-2rem)] overflow-clip flex flex-col rounded-t-2xl sm:rounded-2xl">
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
          <IconButton variant="default"
            onClick={onClose}
            className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 transition-colors"
            aria-label="Close development plan modal"
          >
            <IconX size={20} />
          </IconButton>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Player Selection */}
          <div>
            <p className="block text-sm font-medium text-warm-700 mb-2">
              Select Player *
            </p>
            {loadingPlayers ? (
              <div className="text-sm leading-relaxed text-warm-500">Loading roster...</div>
            ) : players.length === 0 ? (
              <div className="text-sm leading-relaxed text-warm-500">
                No players in roster. Add players to your team first.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border border-warm-200 rounded-lg p-2 sm:grid-cols-2">
                {players.map(player => (
                  <Button variant="primary"
                    key={player.id}
                    type="button"
                    onClick={() => setSelectedPlayerId(player.id)}
                    className={`flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                      selectedPlayerId === player.id
                        ? 'bg-primary-50 border-2 border-primary-500'
                        : 'hover:bg-warm-50 active:bg-warm-100 border-2 border-transparent'
                    }`}
                  >
                    <Avatar decorative
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
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Plan Details */}
          <div>
            <label htmlFor={`${uid}-title`} className="block text-sm font-medium text-warm-700 mb-1">
              Plan Title *
            </label>
            <Input
              id={`${uid}-title`}
              type="text"
              required
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="Off-Season Hitting Development"
            />
          </div>

          <div>
            <label htmlFor={`${uid}-desc`} className="block text-sm font-medium text-warm-700 mb-1">
              Description
            </label>
            <Textarea
              id={`${uid}-desc`}
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              placeholder="Describe the focus areas and expectations..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${uid}-start`} className="block text-sm font-medium text-warm-700 mb-1">
                Start Date
              </label>
              <Input
                id={`${uid}-start`}
                type="date"
                value={formData.start_date}
                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor={`${uid}-end`} className="block text-sm font-medium text-warm-700 mb-1">
                End Date
              </label>
              <Input
                id={`${uid}-end`}
                type="date"
                value={formData.end_date}
                onChange={e => setFormData({ ...formData, end_date: e.target.value })}
              />
            </div>
          </div>

          {/* Goals */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="block text-sm font-medium text-warm-700">
                Goals
              </p>
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
                      <IconButton variant="default" aria-label="Delete"
                        type="button"
                        onClick={() => removeGoal(goal.id)}
                        className="p-1 text-warm-400 hover:text-red-500 transition-colors"
                      >
                        <IconTrash size={14} />
                      </IconButton>
                    </div>
                    <Input
                      type="text"
                      value={goal.title}
                      onChange={e => updateGoal(goal.id, 'title', e.target.value)}
                      placeholder="Goal title (e.g., Increase bat speed)"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={goal.description}
                        onChange={e => updateGoal(goal.id, 'description', e.target.value)}
                        placeholder="Description (optional)"
                        className="flex-1"
                      />
                      <Input
                        type="date"
                        value={goal.target_date}
                        onChange={e => updateGoal(goal.id, 'target_date', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        {/* Footer — kept outside the scrollable <form> (a separate flex-column
            sibling, not `sticky`) so it's always visible without scrolling;
            the safe-area padding matters now that the card sits flush to the
            phone's bottom edge instead of floating with a p-4 gutter. */}
        <div className="px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-warm-200 flex items-center justify-end gap-3">
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
