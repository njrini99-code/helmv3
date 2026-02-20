'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { IconEdit, IconCheck, IconX } from '@/components/icons';
import { updateEligibility, createEligibilityRecord } from '@/app/baseball/actions/academics';

interface EligibilityCardProps {
  playerId: string;
  playerName: string;
  teamId: string;
  eligibilityId: string | null;
  gpa: number | null;
  creditsCompleted: number | null;
  creditsRequired: number | null;
  isEligible: boolean;
  academicStanding: 'good' | 'warning' | 'probation' | null;
  isCoach: boolean;
  onUpdated: () => void;
}

const standingColors = {
  good: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  probation: 'bg-red-100 text-red-700',
};

export function EligibilityCard({
  playerId,
  playerName,
  teamId,
  eligibilityId,
  gpa,
  creditsCompleted,
  creditsRequired,
  isEligible,
  academicStanding,
  isCoach,
  onUpdated,
}: EligibilityCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editGpa, setEditGpa] = useState(gpa?.toString() || '');
  const [editCreditsCompleted, setEditCreditsCompleted] = useState(creditsCompleted?.toString() || '');
  const [editCreditsRequired, setEditCreditsRequired] = useState(creditsRequired?.toString() || '60');
  const [editEligible, setEditEligible] = useState(isEligible ? 'eligible' : 'ineligible');
  const [editStanding, setEditStanding] = useState<'good' | 'warning' | 'probation'>(academicStanding || 'good');

  async function handleSave() {
    setSaving(true);

    const data = {
      gpa: editGpa ? parseFloat(editGpa) : null,
      credits_completed: editCreditsCompleted ? parseInt(editCreditsCompleted) : null,
      credits_required: editCreditsRequired ? parseInt(editCreditsRequired) : null,
      is_eligible: editEligible === 'eligible',
      academic_standing: editStanding as 'good' | 'warning' | 'probation',
    };

    try {
      if (eligibilityId) {
        await updateEligibility(eligibilityId, data);
      } else {
        await createEligibilityRecord(playerId, {
          team_id: teamId,
          gpa: data.gpa ?? undefined,
          credits_completed: data.credits_completed ?? undefined,
          credits_required: data.credits_required ?? undefined,
          is_eligible: data.is_eligible,
          academic_standing: data.academic_standing,
        });
      }
      onUpdated();
      setEditing(false);
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="bg-white rounded-xl border border-green-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-warm-900">{playerName}</h4>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} isLoading={saving} className="gap-1">
              <IconCheck size={14} />
              Save
            </Button>
            <button
              onClick={() => setEditing(false)}
              className="p-1.5 text-warm-400 hover:text-warm-600 rounded-lg hover:bg-warm-100 active:bg-warm-200 transition-colors"
            >
              <IconX size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-warm-500 mb-1">GPA</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="4"
              value={editGpa}
              onChange={(e) => setEditGpa(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-500 mb-1">Credits Done</label>
            <Input
              type="number"
              min="0"
              value={editCreditsCompleted}
              onChange={(e) => setEditCreditsCompleted(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-500 mb-1">Credits Req.</label>
            <Input
              type="number"
              min="0"
              value={editCreditsRequired}
              onChange={(e) => setEditCreditsRequired(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            value={editStanding}
            onChange={(value) => setEditStanding(value as 'good' | 'warning' | 'probation')}
            options={[
              { value: 'good', label: 'Good Standing' },
              { value: 'warning', label: 'Warning' },
              { value: 'probation', label: 'Probation' },
            ]}
          />
          <Select
            value={editEligible}
            onChange={(value) => setEditEligible(value)}
            options={[
              { value: 'eligible', label: 'Eligible' },
              { value: 'ineligible', label: 'Ineligible' },
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-warm-200 p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium text-warm-900 truncate">{playerName}</h4>
          <Badge className={isEligible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
            {isEligible ? 'Eligible' : 'Ineligible'}
          </Badge>
          {academicStanding && academicStanding !== 'good' && (
            <Badge className={standingColors[academicStanding]}>
              {academicStanding.charAt(0).toUpperCase() + academicStanding.slice(1)}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-warm-500">
          <span>GPA: <strong className="text-warm-900">{gpa?.toFixed(2) || 'N/A'}</strong></span>
          <span>Credits: <strong className="text-warm-900">{creditsCompleted ?? 0}/{creditsRequired ?? 60}</strong></span>
        </div>
      </div>

      {isCoach && (
        <button
          onClick={() => setEditing(true)}
          className="p-2 text-warm-400 hover:text-green-600 hover:bg-green-50 active:bg-green-100 rounded-lg transition-colors"
        >
          <IconEdit size={16} />
        </button>
      )}
    </div>
  );
}
