'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { PageLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { IconGraduationCap, IconUsers, IconEdit, IconCheck } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useRouteProtection } from '@/hooks/use-route-protection';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { getFullName } from '@/lib/utils';

interface StudentAthlete {
  id: string;
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  primary_position: string | null;
  grad_year: number | null;
  gpa: number | null;
  credits_completed: number | null;
  credits_required: number | null;
  academic_standing: 'good' | 'warning' | 'probation' | null;
  eligibility_status: 'eligible' | 'ineligible' | 'pending' | null;
}

const academicStandingColors = {
  good: 'bg-primary-100 text-primary-700',
  warning: 'bg-amber-100 text-amber-700',
  probation: 'bg-red-100 text-red-700',
};

const eligibilityColors = {
  eligible: 'bg-primary-100 text-primary-700',
  ineligible: 'bg-red-100 text-red-700',
  pending: 'bg-slate-100 text-slate-700',
};

export default function AcademicsPage() {
  const { loading: authLoading } = useAuth();
  const { selectedTeamId } = useTeamStore();
  // Only JUCO coaches can access this page
  const { isAllowed, isLoading: routeLoading } = useRouteProtection({
    allowedCoachTypes: ['juco'],
    redirectTo: '/baseball/dashboard/team',
  });

  const [students, setStudents] = useState<StudentAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<StudentAthlete>>({});
  const supabase = createClient();

  useEffect(() => {
    if (!authLoading && !routeLoading && isAllowed && selectedTeamId) {
      fetchStudentAthletes();
    } else if (!authLoading && !routeLoading && isAllowed && !selectedTeamId) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchStudentAthletes only depends on selectedTeamId already in deps
  }, [authLoading, routeLoading, isAllowed, selectedTeamId]);

  async function fetchStudentAthletes() {
    if (!selectedTeamId) return;

    setLoading(true);
    setError(null);

    try {
      // Get team members with player details
      const { data: membersData, error: fetchError } = await supabase
        .from('baseball_team_members')
        .select(`
          id,
          player_id,
          baseball_players (
            id,
            first_name,
            last_name,
            avatar_url,
            primary_position,
            grad_year,
            gpa
          )
        `)
        .eq('team_id', selectedTeamId);

      if (fetchError) {
        console.error('Error fetching students:', fetchError);
        setError('Failed to load student data. Please try again.');
        setStudents([]);
        setLoading(false);
        return;
      }

      // Transform data with player information
      // Note: academic fields (credits_completed, academic_standing, eligibility_status)
      // are not in DB schema yet, so we use defaults
      type PlayerData = {
        first_name?: string | null;
        last_name?: string | null;
        avatar_url?: string | null;
        primary_position?: string | null;
        grad_year?: number | null;
        gpa?: number | null;
      };
      const transformedStudents: StudentAthlete[] = (membersData || []).map((member) => {
        const player = member.baseball_players as PlayerData | null;
        return {
          id: member.id,
          player_id: member.player_id,
          first_name: player?.first_name || null,
          last_name: player?.last_name || null,
          avatar_url: player?.avatar_url || null,
          primary_position: player?.primary_position || null,
          grad_year: player?.grad_year || null,
          gpa: player?.gpa || null,
          credits_completed: 0,
          credits_required: 60,
          academic_standing: 'good' as const,
          eligibility_status: 'eligible' as const,
        };
      });

      setStudents(transformedStudents);
      setLoading(false);
    } catch (err) {
      console.error('Unexpected error fetching students:', err);
      setError('An unexpected error occurred. Please try again.');
      setStudents([]);
      setLoading(false);
    }
  }

  const startEditing = (student: StudentAthlete) => {
    setEditingId(student.id);
    setEditValues({
      gpa: student.gpa,
      credits_completed: student.credits_completed,
      academic_standing: student.academic_standing,
      eligibility_status: student.eligibility_status,
    });
  };

  const saveEditing = async () => {
    if (!editingId) return;

    const student = students.find(s => s.id === editingId);
    if (!student) return;

    try {
      // Update player record with GPA (only field available in DB)
      // Note: credits_completed, academic_standing, eligibility_status are not in DB schema yet
      const { error: updateError } = await supabase
        .from('baseball_players')
        .update({
          gpa: editValues.gpa !== undefined ? editValues.gpa : student.gpa,
        })
        .eq('id', student.player_id);

      if (updateError) {
        console.error('Error saving academic data:', updateError);
        setError('Failed to save academic data. Please try again.');
        return;
      }

      // Update local state
      setStudents(students.map(s =>
        s.id === editingId ? { ...s, ...editValues } : s
      ));
      setEditingId(null);
      setEditValues({});
      setError(null);
    } catch (err) {
      console.error('Unexpected error saving academic data:', err);
      setError('An unexpected error occurred while saving. Please try again.');
    }
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues({});
  };

  // Route protection check
  if (authLoading || routeLoading || !isAllowed) {
    return <PageLoading />;
  }

  if (loading) {
    return (
      <>
        <Header title="Academics" subtitle="Track student-athlete academic progress" />
        <PageLoading />
      </>
    );
  }

  if (students.length === 0) {
    return (
      <>
        <Header title="Academics" subtitle="Track student-athlete academic progress" />
        <div className="p-8">
          <EmptyState
            icon={<IconGraduationCap size={24} />}
            title="No student-athletes"
            description="Add players to your roster to track their academic progress."
            action={<Button onClick={() => window.location.href = '/baseball/dashboard/roster'}>Manage Roster</Button>}
          />
        </div>
      </>
    );
  }

  // Calculate summary stats
  const avgGpa = students.reduce((sum, s) => sum + (s.gpa || 0), 0) / students.length;
  const eligibleCount = students.filter(s => s.eligibility_status === 'eligible').length;
  const atRiskCount = students.filter(s => s.academic_standing !== 'good').length;

  return (
    <>
      <Header
        title="Academics"
        subtitle="Track student-athlete academic progress and eligibility"
      />

      <div className="p-4 lg:p-8 space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-700 font-medium"
            >
              Dismiss
            </button>
          </div>
        )}
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <Card variant="glass">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <IconUsers size={20} className="text-slate-600" />
                </div>
                <div>
                  <p className="text-sm leading-relaxed text-slate-500">Total Athletes</p>
                  <p className="text-2xl font-semibold tracking-tight text-slate-900">{students.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                  <IconGraduationCap size={20} className="text-primary-600" />
                </div>
                <div>
                  <p className="text-sm leading-relaxed text-slate-500">Team GPA</p>
                  <p className="text-2xl font-semibold tracking-tight text-slate-900">{avgGpa.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                  <IconCheck size={20} className="text-primary-600" />
                </div>
                <div>
                  <p className="text-sm leading-relaxed text-slate-500">Eligible</p>
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
                  <p className="text-sm leading-relaxed text-slate-500">At Risk</p>
                  <p className="text-2xl font-semibold tracking-tight text-slate-900">{atRiskCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Student Table */}
        <Card variant="glass">
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Student-Athletes</h2>
          </CardHeader>
          <CardContent className="p-0 lg:p-0">
            {/* Mobile card view */}
            <div className="lg:hidden p-4 space-y-4">
              {students.map((student) => (
                <div key={student.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  {/* Student header */}
                  <div className="flex items-start gap-3 mb-3">
                    <Avatar
                      name={getFullName(student.first_name, student.last_name)}
                      src={student.avatar_url || undefined}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">
                        {getFullName(student.first_name, student.last_name)}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {student.primary_position || 'N/A'} {student.grad_year ? `\u2022 Class of ${student.grad_year}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-slate-50 rounded-lg p-3 text-center">
                      <p className="text-lg font-semibold text-slate-900">
                        {editingId === student.id ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="4"
                            value={editValues.gpa || ''}
                            onChange={(e) => setEditValues({ ...editValues, gpa: parseFloat(e.target.value) })}
                            className="w-full text-center text-base"
                          />
                        ) : (
                          student.gpa?.toFixed(2) || 'N/A'
                        )}
                      </p>
                      <p className="text-label font-medium uppercase tracking-wide text-slate-500 mt-1">GPA</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 text-center">
                      <p className="text-lg font-semibold text-slate-900">
                        {editingId === student.id ? (
                          <Input
                            type="number"
                            min="0"
                            value={editValues.credits_completed || ''}
                            onChange={(e) => setEditValues({ ...editValues, credits_completed: parseInt(e.target.value) })}
                            className="w-full text-center text-base"
                          />
                        ) : (
                          `${student.credits_completed || 0}/${student.credits_required || 60}`
                        )}
                      </p>
                      <p className="text-label font-medium uppercase tracking-wide text-slate-500 mt-1">Credits</p>
                    </div>
                  </div>

                  {/* Badges row */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {editingId === student.id ? (
                      <>
                        <Select
                          value={editValues.academic_standing || ''}
                          onChange={(value) => setEditValues({ ...editValues, academic_standing: value as 'good' | 'warning' | 'probation' })}
                          options={[
                            { value: 'good', label: 'Good Standing' },
                            { value: 'warning', label: 'Warning' },
                            { value: 'probation', label: 'Probation' },
                          ]}
                          className="flex-1 text-base"
                        />
                        <Select
                          value={editValues.eligibility_status || ''}
                          onChange={(value) => setEditValues({ ...editValues, eligibility_status: value as 'eligible' | 'ineligible' | 'pending' })}
                          options={[
                            { value: 'eligible', label: 'Eligible' },
                            { value: 'pending', label: 'Pending' },
                            { value: 'ineligible', label: 'Ineligible' },
                          ]}
                          className="flex-1 text-base"
                        />
                      </>
                    ) : (
                      <>
                        {student.academic_standing && (
                          <Badge className={academicStandingColors[student.academic_standing]}>
                            {student.academic_standing.charAt(0).toUpperCase() + student.academic_standing.slice(1)} Standing
                          </Badge>
                        )}
                        {student.eligibility_status && (
                          <Badge className={eligibilityColors[student.eligibility_status]}>
                            {student.eligibility_status.charAt(0).toUpperCase() + student.eligibility_status.slice(1)}
                          </Badge>
                        )}
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  {editingId === student.id ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEditing} className="flex-1 min-h-[44px]">Save</Button>
                      <Button size="sm" variant="secondary" onClick={cancelEditing} className="flex-1 min-h-[44px]">Cancel</Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => startEditing(student)}
                      className="w-full min-h-[44px]"
                    >
                      <IconEdit size={14} className="mr-1" /> Edit
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-slate-400">Player</th>
                    <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-slate-400">Position</th>
                    <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-slate-400">GPA</th>
                    <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-slate-400">Credits</th>
                    <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-slate-400">Standing</th>
                    <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-slate-400">Eligibility</th>
                    <th className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {students.map((student) => (
                    <tr key={student.id} className="hover:bg-slate-50 transition-colors active:bg-slate-100">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={getFullName(student.first_name, student.last_name)}
                            src={student.avatar_url || undefined}
                            size="sm"
                          />
                          <div>
                            <p className="font-medium text-slate-900">
                              {getFullName(student.first_name, student.last_name)}
                            </p>
                            <p className="text-sm leading-relaxed text-slate-500">Class of {student.grad_year}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge>{student.primary_position || 'N/A'}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        {editingId === student.id ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="4"
                            value={editValues.gpa || ''}
                            onChange={(e) => setEditValues({ ...editValues, gpa: parseFloat(e.target.value) })}
                            className="w-20"
                          />
                        ) : (
                          <span className="font-medium">{student.gpa?.toFixed(2) || 'N/A'}</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {editingId === student.id ? (
                          <Input
                            type="number"
                            min="0"
                            value={editValues.credits_completed || ''}
                            onChange={(e) => setEditValues({ ...editValues, credits_completed: parseInt(e.target.value) })}
                            className="w-20"
                          />
                        ) : (
                          <span className="text-slate-600">
                            {student.credits_completed || 0}/{student.credits_required || 60}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {editingId === student.id ? (
                          <Select
                            value={editValues.academic_standing || ''}
                            onChange={(value) => setEditValues({ ...editValues, academic_standing: value as 'good' | 'warning' | 'probation' })}
                            options={[
                              { value: 'good', label: 'Good' },
                              { value: 'warning', label: 'Warning' },
                              { value: 'probation', label: 'Probation' },
                            ]}
                          />
                        ) : (
                          student.academic_standing && (
                            <Badge className={academicStandingColors[student.academic_standing]}>
                              {student.academic_standing.charAt(0).toUpperCase() + student.academic_standing.slice(1)}
                            </Badge>
                          )
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {editingId === student.id ? (
                          <Select
                            value={editValues.eligibility_status || ''}
                            onChange={(value) => setEditValues({ ...editValues, eligibility_status: value as 'eligible' | 'ineligible' | 'pending' })}
                            options={[
                              { value: 'eligible', label: 'Eligible' },
                              { value: 'pending', label: 'Pending' },
                              { value: 'ineligible', label: 'Ineligible' },
                            ]}
                          />
                        ) : (
                          student.eligibility_status && (
                            <Badge className={eligibilityColors[student.eligibility_status]}>
                              {student.eligibility_status.charAt(0).toUpperCase() + student.eligibility_status.slice(1)}
                            </Badge>
                          )
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {editingId === student.id ? (
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={saveEditing}>Save</Button>
                            <Button size="sm" variant="secondary" onClick={cancelEditing}>Cancel</Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => startEditing(student)}
                          >
                            <IconEdit size={14} className="mr-1" /> Edit
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
