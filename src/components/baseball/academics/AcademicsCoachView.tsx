'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { IconUsers, IconGraduationCap, IconCheck } from '@/components/icons';
import { EligibilityCard } from './EligibilityCard';
import { EligibilityAlert } from './EligibilityAlert';
import { getFullName } from '@/lib/utils';

interface TeamMemberAcademic {
  member_id: string;
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  primary_position: string | null;
  grad_year: number | null;
  gpa: number | null;
  credits_completed: number | null;
  credits_required: number | null;
  is_eligible: boolean;
  academic_standing: 'good' | 'warning' | 'probation';
  class_count: number;
  eligibility_id: string | null;
}

interface AcademicsCoachViewProps {
  teamData: TeamMemberAcademic[];
  teamId: string;
  onRefresh: () => void;
}

export function AcademicsCoachView({ teamData, teamId, onRefresh }: AcademicsCoachViewProps) {
  // Calculate summary stats
  const studentsWithGpa = teamData.filter(s => s.gpa !== null && s.gpa > 0);
  const avgGpa = studentsWithGpa.length > 0
    ? studentsWithGpa.reduce((sum, s) => sum + (s.gpa || 0), 0) / studentsWithGpa.length
    : 0;
  const eligibleCount = teamData.filter(s => s.is_eligible).length;
  const atRiskCount = teamData.filter(s => s.academic_standing !== 'good').length;

  const atRiskPlayers = teamData
    .filter(s => s.academic_standing !== 'good' || !s.is_eligible)
    .map(s => ({
      name: getFullName(s.first_name, s.last_name),
      gpa: s.gpa,
      standing: s.academic_standing,
    }));

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      <EligibilityAlert atRiskPlayers={atRiskPlayers} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <Card variant="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <IconUsers size={20} className="text-slate-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Athletes</p>
                <p className="text-2xl font-semibold tracking-tight text-slate-900">{teamData.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <IconGraduationCap size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Team GPA</p>
                <p className="text-2xl font-semibold tracking-tight text-slate-900">
                  {avgGpa > 0 ? avgGpa.toFixed(2) : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <IconCheck size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Eligible</p>
                <p className="text-2xl font-semibold tracking-tight text-slate-900">{eligibleCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <IconGraduationCap size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">At Risk</p>
                <p className="text-2xl font-semibold tracking-tight text-slate-900">{atRiskCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Player Eligibility List */}
      <Card variant="glass">
        <CardHeader>
          <h2 className="font-semibold text-slate-900">Player Eligibility</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          {teamData.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500">No players on roster</p>
            </div>
          ) : (
            teamData.map(student => (
              <EligibilityCard
                key={student.member_id}
                playerId={student.player_id}
                playerName={getFullName(student.first_name, student.last_name)}
                teamId={teamId}
                eligibilityId={student.eligibility_id}
                gpa={student.gpa}
                creditsCompleted={student.credits_completed}
                creditsRequired={student.credits_required}
                isEligible={student.is_eligible}
                academicStanding={student.academic_standing}
                isCoach={true}
                onUpdated={onRefresh}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
