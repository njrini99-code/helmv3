'use client';

import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { IconLayers } from '@/components/icons';
import { useTeams } from '@/hooks/use-teams';
interface TeamSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function TeamSelector({ value, onChange }: TeamSelectorProps) {
  const { teams, isLoading } = useTeams();

  const options = [
    { value: 'all', label: 'All Teams' },
    ...teams.map((team) => ({
      value: team.id,
      label: team.team_type ? `${team.name} • ${team.team_type}` : team.name,
    })),
  ];

  return (
    <Card variant="glass" className="p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <IconLayers size={20} className="text-slate-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">Viewing</p>
            <p className="text-xs text-slate-500">Switch between teams or view all</p>
          </div>
        </div>
        <div className="flex-1 md:max-w-sm md:ml-auto">
          <Select
            options={options}
            value={value}
            onChange={onChange}
            placeholder="Select team"
            disabled={isLoading || teams.length === 0}
          />
        </div>
      </div>
    </Card>
  );
}
