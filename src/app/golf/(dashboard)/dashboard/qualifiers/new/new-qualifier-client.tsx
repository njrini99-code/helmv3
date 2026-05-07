'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { IconFlag, IconCalendar, IconMapPin, IconUsers, IconCheck } from '@/components/icons';
import { createGolfQualifier } from '@/app/golf/actions/golf';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
}

interface NewQualifierClientProps {
  players: Player[];
}

export default function NewQualifierClient({ players }: NewQualifierClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

  const togglePlayer = (playerId: string) => {
    setSelectedPlayers(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const selectAll = () => setSelectedPlayers(players.map(p => p.id));
  const deselectAll = () => setSelectedPlayers([]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const spotsValue = formData.get('spotsAvailable') as string;

    try {
      const result = await createGolfQualifier({
        name: formData.get('name') as string,
        description: (formData.get('description') as string) || undefined,
        courseName: (formData.get('courseName') as string) || undefined,
        spotsAvailable: spotsValue ? parseInt(spotsValue) : undefined,
        entryDeadline: (formData.get('entryDeadline') as string) || undefined,
        startDate: formData.get('startDate') as string,
        endDate: (formData.get('endDate') as string) || undefined,
        playerIds: selectedPlayers,
      });

      if (!result.success) {
        setError(result.error);
        setLoading(false);
        return;
      }

      router.push('/golf/dashboard/qualifiers');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create qualifier');
      setLoading(false);
    }
  };

  // Get today's date in YYYY-MM-DD format for date inputs
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-full bg-transparent">
      <MobileNavHeader
        title="New Qualifier"
        subtitle="Set up a new team qualifier"
        backHref="/golf/dashboard/qualifiers"
        backLabel="Qualifiers"
      />

      <div className="max-w-3xl mx-auto px-4 md:px-6 pt-6 md:pt-8">
        <Reveal>
          <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
            <PageHeader
              eyebrow="Coach · New Qualifier"
              eyebrowAccent="primary"
              title="Create a qualifier."
              subtitle="Pick a window, invite players, set the spots."
            />
          </div>
        </Reveal>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 md:px-6 pb-6 md:pb-8">
        <div className="space-y-8">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Basic Information */}
          <section className="relative surface-matte rounded-3xl p-6 overflow-clip">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                <IconFlag size={20} className="text-primary-600" />
              </div>
              <div>
                <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Basic Information</h2>
                <p className="text-sm text-warm-500">Name and describe your qualifier</p>
              </div>
            </div>

            <div className="space-y-5">
              <Input
                label="Qualifier Name"
                name="name"
                placeholder="e.g., Spring Team Qualifier"
                required
              />

              <Textarea
                label="Description"
                name="description"
                rows={3}
                placeholder="Add details about this qualifier, scoring format, any special rules..."
                hint="Optional - help players understand what to expect"
              />
            </div>
          </section>

          {/* Schedule */}
          <section className="relative surface-matte rounded-3xl p-6 overflow-clip">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                <IconCalendar size={20} className="text-primary-600" />
              </div>
              <div>
                <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Schedule</h2>
                <p className="text-sm text-warm-500">When will this qualifier take place?</p>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Input
                  label="Start Date"
                  name="startDate"
                  type="date"
                  min={today}
                  required
                />

                <Input
                  label="End Date"
                  name="endDate"
                  type="date"
                  min={today}
                  hint="Optional - for multi-day qualifiers"
                />
              </div>

              <Input
                label="Entry Deadline"
                name="entryDeadline"
                type="date"
                min={today}
                hint="Optional - when players must confirm participation"
              />
            </div>
          </section>

          {/* Location & Spots */}
          <section className="relative surface-matte rounded-3xl p-6 overflow-clip">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                <IconMapPin size={20} className="text-primary-600" />
              </div>
              <div>
                <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Course & Availability</h2>
                <p className="text-sm text-warm-500">Where and how many spots?</p>
              </div>
            </div>

            <div className="space-y-5">
              <Input
                label="Course Name"
                name="courseName"
                placeholder="e.g., Pine Valley Golf Club"
                hint="Optional - specify where the qualifier will be held"
              />

              <Input
                label="Spots Available"
                name="spotsAvailable"
                type="number"
                min="1"
                placeholder="e.g., 5"
                hint="Optional - number of team spots up for grabs"
              />
            </div>
          </section>

          {/* Player Selection */}
          <section className="relative surface-matte rounded-3xl p-6 overflow-clip">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <IconUsers size={20} className="text-primary-600" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Players</h2>
                  <p className="text-sm text-warm-500">
                    {selectedPlayers.length} of {players.length} selected
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium px-3 py-1.5 rounded-lg hover:bg-primary-50 active:bg-primary-100 transition-colors"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-sm text-warm-500 hover:text-warm-700 font-medium px-3 py-1.5 rounded-lg hover:bg-warm-100 active:bg-warm-200 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            {players.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-3">
                  <IconUsers size={24} className="text-warm-400" />
                </div>
                <p className="text-warm-500 text-sm">No active players on your roster</p>
                <p className="text-warm-400 text-xs mt-1">Add players to your team first</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {players.map(player => {
                  const isSelected = selectedPlayers.includes(player.id);
                  return (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => togglePlayer(player.id)}
                      className={`
                        flex items-center gap-3 p-3 rounded-xl border transition-all text-left
                        ${isSelected
                          ? 'bg-primary-50 border-primary-200 ring-1 ring-primary-200'
                          : 'bg-cream-100/60 border-warm-200 hover:border-warm-300 hover:bg-cream-100/82 active:bg-cream-50/92'
                        }
                      `}
                    >
                      <div className={`
                        w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors
                        ${isSelected
                          ? 'bg-primary-600 border-primary-600'
                          : 'border-warm-300'
                        }
                      `}>
                        {isSelected && <IconCheck size={14} className="text-white" />}
                      </div>
                      <span className={`font-medium ${isSelected ? 'text-primary-700' : 'text-warm-700'}`}>
                        {player.first_name} {player.last_name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4">
            <Link
              href="/golf/dashboard/qualifiers"
              className="text-warm-500 hover:text-warm-700 font-medium transition-colors"
            >
              Cancel
            </Link>

            <Button
              type="submit"
              isLoading={loading}
              disabled={loading}
              className="min-w-[160px]"
            >
              Create Qualifier
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
