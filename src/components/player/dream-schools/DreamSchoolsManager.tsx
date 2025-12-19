'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconPlus, IconTrash, IconStar, IconStarFilled, IconChevronUp, IconChevronDown } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface DreamSchool {
  id: string;
  rank: number;
  college_program_id: string;
  college_program?: {
    name: string;
    division?: string;
    logo_url?: string;
  };
}

interface DreamSchoolsManagerProps {
  playerId: string;
  initialSchools?: DreamSchool[];
}

export function DreamSchoolsManager({ playerId, initialSchools = [] }: DreamSchoolsManagerProps) {
  const [schools, setSchools] = useState<DreamSchool[]>(initialSchools);
  const [saving, setSaving] = useState(false);

  const addSchool = () => {
    if (schools.length >= 10) {
      toast.error('You can only have up to 10 dream schools');
      return;
    }

    // Open search modal to select a school
    // For now, just showing the structure
    toast.info('School search modal would open here');
  };

  const removeSchool = async (schoolId: string) => {
    setSaving(true);
    const supabase = createClient();

    const { error } = await (supabase as any)
      .from('player_dream_schools')
      .delete()
      .eq('id', schoolId);

    if (error) {
      toast.error('Failed to remove school');
      console.error(error);
    } else {
      setSchools(schools.filter(s => s.id !== schoolId));
      toast.success('School removed from your list');
    }

    setSaving(false);
  };

  const moveSchool = (index: number, direction: 'up' | 'down') => {
    const newSchools = [...schools];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= schools.length) return;

    // Swap ranks
    const temp = newSchools[index]!;
    newSchools[index] = newSchools[targetIndex]!;
    newSchools[targetIndex] = temp;

    // Update ranks
    newSchools[index]!.rank = index + 1;
    newSchools[targetIndex]!.rank = targetIndex + 1;

    setSchools(newSchools);
    saveRankings(newSchools);
  };

  const saveRankings = async (updatedSchools: DreamSchool[]) => {
    setSaving(true);
    const supabase = createClient();

    const updates = updatedSchools.map(school => ({
      id: school.id,
      rank: school.rank,
    }));

    for (const update of updates) {
      await (supabase as any)
        .from('player_dream_schools')
        .update({ rank: update.rank })
        .eq('id', update.id);
    }

    setSaving(false);
    toast.success('Rankings updated');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Dream Schools</h2>
          <p className="text-sm text-slate-500">
            Rank your top 10 dream schools ({schools.length}/10)
          </p>
        </div>
        <Button
          onClick={addSchool}
          disabled={schools.length >= 10}
          size="sm"
        >
          <IconPlus size={16} />
          Add School
        </Button>
      </div>

      {schools.length === 0 ? (
        <Card className="p-12 text-center">
          <IconStar size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            No dream schools yet
          </h3>
          <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
            Add up to 10 schools you'd like to attend. Coaches can see your list when viewing your profile.
          </p>
          <Button onClick={addSchool} size="sm">
            <IconPlus size={16} />
            Add Your First School
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {schools.map((school, index) => (
            <Card
              key={school.id}
              className="p-4 hover:border-green-200 transition-colors"
            >
              <div className="flex items-center gap-4">
                {/* Rank Badge */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <span className="text-lg font-bold text-green-700">
                    {index + 1}
                  </span>
                </div>

                {/* School Logo */}
                {school.college_program?.logo_url ? (
                  <img
                    src={school.college_program.logo_url}
                    alt={school.college_program.name}
                    className="w-12 h-12 rounded object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center">
                    <IconStarFilled size={24} className="text-slate-400" />
                  </div>
                )}

                {/* School Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 truncate">
                    {school.college_program?.name || 'Unknown School'}
                  </h3>
                  {school.college_program?.division && (
                    <p className="text-sm text-slate-500">
                      {school.college_program.division}
                    </p>
                  )}
                </div>

                {/* Reorder Buttons */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveSchool(index, 'up')}
                    disabled={index === 0 || saving}
                    className="p-1.5"
                  >
                    <IconChevronUp size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveSchool(index, 'down')}
                    disabled={index === schools.length - 1 || saving}
                    className="p-1.5"
                  >
                    <IconChevronDown size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSchool(school.id)}
                    disabled={saving}
                    className="p-1.5 text-red-600 hover:text-red-700"
                  >
                    <IconTrash size={16} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
