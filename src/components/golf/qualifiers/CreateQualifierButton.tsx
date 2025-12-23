'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconPlus } from '@/components/icons';
import { createGolfQualifier } from '@/app/golf/actions/golf';

export function CreateQualifierButton() {
  const router = useRouter();
  const supabase = createClient();

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

  useEffect(() => {
    async function loadPlayers() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('team_id')
        .eq('user_id', user.id)
        .single();

      if (!coach?.team_id) return;

      const { data: playersData } = await supabase
        .from('golf_players')
        .select('id, first_name, last_name')
        .eq('team_id', coach.team_id)
        .eq('status', 'active')
        .order('last_name');

      setPlayers(playersData as any || []);
    }

    if (isOpen) {
      loadPlayers();
    }
  }, [isOpen, supabase]);

  const togglePlayer = (playerId: string) => {
    setSelectedPlayers(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const selectAll = () => {
    setSelectedPlayers(players.map(p => p.id));
  };

  const deselectAll = () => {
    setSelectedPlayers([]);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    try {
      await createGolfQualifier({
        name: formData.get('name') as string,
        description: (formData.get('description') as string) || undefined,
        courseName: (formData.get('courseName') as string) || undefined,
        location: (formData.get('location') as string) || undefined,
        numRounds: parseInt(formData.get('numRounds') as string),
        holesPerRound: parseInt(formData.get('holesPerRound') as string),
        startDate: formData.get('startDate') as string,
        endDate: (formData.get('endDate') as string) || undefined,
        showLiveLeaderboard: formData.get('showLiveLeaderboard') === 'on',
        playerIds: selectedPlayers,
      });

      setIsOpen(false);
      setSelectedPlayers([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create qualifier');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => setIsOpen(true)} className="gap-2">
        <IconPlus size={18} />
        Create Qualifier
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Create Qualifier</h2>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <Input
                label="Qualifier Name"
                name="name"
                placeholder="Spring Team Qualifier"
                required
              />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  name="description"
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 placeholder:text-slate-400 transition-colors resize-none"
                  placeholder="Qualifier details..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Course Name (Optional)"
                  name="courseName"
                  placeholder="Pine Valley Golf Club"
                />

                <Input
                  label="Location (Optional)"
                  name="location"
                  placeholder="City, State"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Number of Rounds"
                  name="numRounds"
                  type="number"
                  min="1"
                  max="10"
                  defaultValue="3"
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Holes per Round
                  </label>
                  <select
                    name="holesPerRound"
                    required
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 bg-white transition-colors"
                  >
                    <option value="9">9 Holes</option>
                    <option value="18">18 Holes</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Start Date"
                  name="startDate"
                  type="date"
                  required
                />

                <Input
                  label="End Date (Optional)"
                  name="endDate"
                  type="date"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="showLiveLeaderboard"
                  id="showLiveLeaderboard"
                  defaultChecked
                  className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
                <label htmlFor="showLiveLeaderboard" className="text-sm font-medium text-slate-700">
                  Show live leaderboard
                </label>
              </div>

              {/* Player Selection */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-slate-700">
                    Select Players ({selectedPlayers.length} selected)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-xs text-green-600 hover:text-green-700 font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-xs text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={deselectAll}
                      className="text-xs text-slate-600 hover:text-slate-700 font-medium"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {players.length === 0 ? (
                    <p className="text-sm text-slate-400 p-4 text-center">No active players found</p>
                  ) : (
                    players.map(player => (
                      <label
                        key={player.id}
                        className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPlayers.includes(player.id)}
                          onChange={() => togglePlayer(player.id)}
                          className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                        />
                        <span className="text-sm text-slate-900">
                          {player.first_name} {player.last_name}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsOpen(false);
                    setSelectedPlayers([]);
                  }}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={loading}>
                  Create Qualifier
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
