'use client';

import { IconGraduationCap } from '@/components/icons';

interface AtRiskPlayer {
  name: string;
  gpa: number | null;
  standing: string | null;
}

interface EligibilityAlertProps {
  atRiskPlayers: AtRiskPlayer[];
}

export function EligibilityAlert({ atRiskPlayers }: EligibilityAlertProps) {
  if (atRiskPlayers.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <IconGraduationCap size={20} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-amber-900 mb-1">
            Academic Alert: {atRiskPlayers.length} Player{atRiskPlayers.length !== 1 ? 's' : ''} At Risk
          </h3>
          <p className="text-sm text-amber-700 mb-3">
            The following players have academic standing concerns that may affect eligibility.
          </p>
          <div className="space-y-2">
            {atRiskPlayers.map((player, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                <span className="font-medium text-amber-900">{player.name}</span>
                {player.gpa !== null && (
                  <span className="text-amber-600">GPA: {player.gpa.toFixed(2)}</span>
                )}
                {player.standing && player.standing !== 'good' && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    player.standing === 'probation'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {player.standing.charAt(0).toUpperCase() + player.standing.slice(1)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
