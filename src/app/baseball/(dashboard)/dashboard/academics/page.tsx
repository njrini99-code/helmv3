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
  good: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  probation: 'bg-red-100 text-red-700',
};

const eligibilityColors = {
  eligible: 'bg-green-100 text-green-700',
  ineligible: 'bg-red-100 text-red-700',
  pending: 'bg-slate-100 text-slate-700',
};

export default function AcademicsPage() {
  const { coach, loading: authLoading } = useAuth();
  // Only JUCO coaches can access this page
  const { isAllowed, isLoading: routeLoading } = useRouteProtection({
    allowedCoachTypes: ['juco'],
    redirectTo: '/baseball/dashboard/team',
  });

  const [students, setStudents] = useState<StudentAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<StudentAthlete>>({});
  const supabase = createClient();

  useEffect(() => {
    if (!authLoading && !routeLoading && isAllowed && coach?.id) {
      fetchStudentAthletes();
    }
  }, [authLoading, routeLoading, isAllowed, coach?.id]);

  async function fetchStudentAthletes() {
    if (!coach?.id) return;

    setLoading(true);

    // Get team ID first
    const { data: staffData } = await supabase
      .from('team_coach_staff')
      .select('team_id')
      .eq('coach_id', coach.id)
      .single();

    if (!staffData?.team_id) {
      setStudents([]);
      setLoading(false);
      return;
    }

    // Get team members with player details
    const { data: membersData } = await supabase
      .from('team_members')
      .select(`
        id,
        player_id,
        players (
          id,
          first_name,
          last_name,
          avatar_url,
          primary_position,
          grad_year,
          gpa
        )
      `)
      .eq('team_id', staffData.team_id);

    // Transform data - in a real app, academic info would come from a separate table
    const transformedStudents: StudentAthlete[] = (membersData || []).map((member) => {
      const player = member.players as any;
      return {
        id: member.id,
        player_id: member.player_id,
        first_name: player?.first_name || null,
        last_name: player?.last_name || null,
        avatar_url: player?.avatar_url || null,
        primary_position: player?.primary_position || null,
        grad_year: player?.grad_year || null,
        gpa: player?.gpa || null,
        credits_completed: Math.floor(Math.random() * 60) + 10, // Mock data
        credits_required: 60,
        academic_standing: ['good', 'good', 'good', 'warning', 'probation'][Math.floor(Math.random() * 5)] as any,
        eligibility_status: ['eligible', 'eligible', 'eligible', 'pending'][Math.floor(Math.random() * 4)] as any,
      };
    });

    setStudents(transformedStudents);
    setLoading(false);
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
    // In a real app, this would save to a student_academics table
    setStudents(students.map(s =>
      s.id === editingId ? { ...s, ...editValues } : s
    ));
    setEditingId(null);
    setEditValues({});
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

      <div className="p-8 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <IconUsers size={20} className="text-slate-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Total Athletes</p>
                  <p className="text-2xl font-semibold text-slate-900">{students.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <IconGraduationCap size={20} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Team GPA</p>
                  <p className="text-2xl font-semibold text-slate-900">{avgGpa.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <IconCheck size={20} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Eligible</p>
                  <p className="text-2xl font-semibold text-slate-900">{eligibleCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <IconGraduationCap size={20} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">At Risk</p>
                  <p className="text-2xl font-semibold text-slate-900">{atRiskCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Student Table */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Student-Athletes</h2>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Player</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Position</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">GPA</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Credits</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Standing</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Eligibility</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {students.map((student) => (
                    <tr key={student.id} className="hover:bg-slate-50">
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
                            <p className="text-sm text-slate-500">Class of {student.grad_year}</p>
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
                            onChange={(value) => setEditValues({ ...editValues, academic_standing: value as any })}
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
                            onChange={(value) => setEditValues({ ...editValues, eligibility_status: value as any })}
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
