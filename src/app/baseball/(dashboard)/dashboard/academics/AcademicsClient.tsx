'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { useTeamStore } from '@/stores/team-store';
import { getFullName } from '@/lib/utils';
import { getTeamAcademics, upsertPlayerAcademics } from '@/app/baseball/actions/academics';

// ============================================================================
// TYPES
// ============================================================================

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
  /** Tri-state: null = no eligibility record on file (neutral), never coerced to false. */
  is_eligible: boolean | null;
  academic_standing: 'good' | 'warning' | 'probation' | null;
  eligibility_id: string | null;
}

interface EditValues {
  gpa: number | null;
  credits_completed: number | null;
  credits_required: number | null;
  is_eligible: boolean;
  academic_standing: 'good' | 'warning' | 'probation' | null;
}

// ============================================================================
// STYLE MAPS
// ============================================================================

const academicStandingColors: Record<'good' | 'warning' | 'probation', string> = {
  good: 'bg-primary-100 text-primary-700',
  warning: 'bg-amber-100 text-amber-700',
  probation: 'bg-red-100 text-red-700',
};

// ============================================================================
// SKELETON ROW
// ============================================================================

function SkeletonRow() {
  return (
    <tr className="border-b border-warm-100">
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 bg-warm-200 rounded animate-pulse" style={{ width: i === 1 ? '60%' : '40%' }} />
        </td>
      ))}
    </tr>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-cream-50 rounded-xl border border-warm-200 p-4 shadow-sm">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-warm-200 animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-warm-200 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-warm-100 rounded animate-pulse w-1/2" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        {[1, 2].map((i) => (
          <div key={i} className="bg-warm-50 rounded-lg p-3">
            <div className="h-6 bg-warm-200 rounded animate-pulse mb-1" />
            <div className="h-3 bg-warm-100 rounded animate-pulse w-1/2 mx-auto" />
          </div>
        ))}
      </div>
      <div className="h-9 bg-warm-100 rounded-lg animate-pulse" />
    </div>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default function AcademicsPage() {
  const { loading: authLoading } = useAuth();
  const { selectedTeamId } = useTeamStore();

  const [students, setStudents] = useState<StudentAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<EditValues>({
    gpa: null,
    credits_completed: null,
    credits_required: null,
    is_eligible: true,
    academic_standing: null,
  });
  const [saving, setSaving] = useState(false);

  const fetchStudentAthletes = useCallback(async () => {
    if (!selectedTeamId) return;

    setLoading(true);
    setError(null);

    const result = await getTeamAcademics(selectedTeamId);

    if (!result.success) {
      setError(result.error);
      setStudents([]);
      setLoading(false);
      return;
    }

    const transformed: StudentAthlete[] = result.data.map((row) => ({
      id: row.member_id,
      player_id: row.player_id,
      first_name: row.first_name,
      last_name: row.last_name,
      avatar_url: row.avatar_url,
      primary_position: row.primary_position,
      grad_year: row.grad_year,
      gpa: row.gpa,
      credits_completed: row.credits_completed,
      credits_required: row.credits_required,
      is_eligible: row.is_eligible,
      academic_standing: row.academic_standing,
      eligibility_id: row.eligibility_id,
    }));

    setStudents(transformed);
    setLoading(false);
  }, [selectedTeamId]);

  useEffect(() => {
    if (!authLoading && selectedTeamId) {
      void fetchStudentAthletes();
    } else if (!authLoading && !selectedTeamId) {
      setLoading(false);
    }
  }, [authLoading, selectedTeamId, fetchStudentAthletes]);

  const startEditing = (student: StudentAthlete) => {
    setEditingId(student.id);
    setEditValues({
      gpa: student.gpa,
      credits_completed: student.credits_completed,
      credits_required: student.credits_required,
      // No record on file yet defaults the editor to "Eligible" — matches
      // upsertPlayerAcademics' own default for a brand-new record.
      is_eligible: student.is_eligible ?? true,
      academic_standing: student.academic_standing,
    });
  };

  const handleSave = async () => {
    if (!editingId || !selectedTeamId) return;

    const student = students.find((s) => s.id === editingId);
    if (!student) return;

    setSaving(true);
    setError(null);

    const result = await upsertPlayerAcademics({
      player_id: student.player_id,
      team_id: selectedTeamId,
      gpa: editValues.gpa,
      credits_completed: editValues.credits_completed,
      credits_required: editValues.credits_required,
      is_eligible: editValues.is_eligible,
      academic_standing: editValues.academic_standing,
      eligibility_id: student.eligibility_id,
    });

    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    // Update local state with saved values and the new eligibility_id
    setStudents((prev) =>
      prev.map((s) =>
        s.id === editingId
          ? {
              ...s,
              gpa: result.data.gpa,
              credits_completed: result.data.credits_completed,
              credits_required: result.data.credits_required,
              is_eligible: result.data.is_eligible,
              academic_standing: result.data.academic_standing,
              eligibility_id: result.data.id,
            }
          : s
      )
    );
    setEditingId(null);
    setEditValues({ gpa: null, credits_completed: null, credits_required: null, is_eligible: true, academic_standing: null });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues({ gpa: null, credits_completed: null, credits_required: null, is_eligible: true, academic_standing: null });
  };

  if (authLoading) {
    return <PageLoading />;
  }

  // ── No team selected ──────────────────────────────────────────────────────
  if (!selectedTeamId) {
    return (
      <>
        <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8">
          <h1 className="text-h2 font-semibold text-warm-900">Academics</h1>
          <p className="mt-1 text-body-sm text-warm-500">Track student-athlete academic progress and eligibility</p>
        </div>
        <div className="p-8">
          <EmptyState
            icon={<IconGraduationCap size={24} />}
            title="No team selected"
            description="Select a team from the navigation to view academic records."
          />
        </div>
      </>
    );
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8">
          <h1 className="text-h2 font-semibold text-warm-900">Academics</h1>
          <p className="mt-1 text-body-sm text-warm-500">Track student-athlete academic progress and eligibility</p>
        </div>
        <div className="p-4 lg:p-8 space-y-6">
          {/* Summary skeleton */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} variant="glass">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-warm-200 animate-pulse shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-warm-100 rounded animate-pulse w-3/4" />
                      <div className="h-6 bg-warm-200 rounded animate-pulse w-1/2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Table skeleton */}
          <Card variant="glass">
            <CardHeader>
              <div className="h-5 bg-warm-200 rounded animate-pulse w-40" />
            </CardHeader>
            <CardContent className="p-0">
              <div className="lg:hidden p-4 space-y-4">
                {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
              </div>
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-warm-200 bg-warm-50">
                      {['Player', 'Position', 'GPA', 'Credits', 'Standing', 'Eligible', 'Actions'].map((h) => (
                        <th key={h} className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-warm-400">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  // ── Empty roster ──────────────────────────────────────────────────────────
  if (students.length === 0) {
    return (
      <>
        <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8">
          <h1 className="text-h2 font-semibold text-warm-900">Academics</h1>
          <p className="mt-1 text-body-sm text-warm-500">Track student-athlete academic progress and eligibility</p>
        </div>
        <div className="p-8">
          <EmptyState
            icon={<IconGraduationCap size={24} />}
            title="No student-athletes"
            description="Add players to your roster to track their academic progress."
            action={
              <Button onClick={() => { window.location.href = '/baseball/dashboard/roster'; }}>
                Manage Roster
              </Button>
            }
          />
        </div>
      </>
    );
  }

  // ── Summary stats (only count rows with real data) ─────────────────────
  const withGpa = students.filter((s) => s.gpa !== null);
  const avgGpa = withGpa.length > 0
    ? withGpa.reduce((sum, s) => sum + (s.gpa ?? 0), 0) / withGpa.length
    : null;
  const eligibleCount = students.filter((s) => s.is_eligible).length;
  const atRiskCount = students.filter((s) => s.academic_standing !== null && s.academic_standing !== 'good').length;

  // ── Credits display helper ─────────────────────────────────────────────
  const creditsDisplay = (student: StudentAthlete) => {
    if (student.credits_completed === null) return 'Not on file';
    const req = student.credits_required ?? 60;
    return `${student.credits_completed}/${req}`;
  };

  const gpaDisplay = (student: StudentAthlete) =>
    student.gpa !== null ? student.gpa.toFixed(2) : 'Not on file';

  const standingLabel = (standing: 'good' | 'warning' | 'probation' | null) => {
    if (!standing) return 'Unknown';
    return standing.charAt(0).toUpperCase() + standing.slice(1);
  };

  // ── Eligibility tri-state: null = no record on file yet (neutral gray,
  // matches the "Unknown" standing treatment) — never coerced to a red
  // "Ineligible", which is reserved for a real, recorded `false`. ─────────
  const eligibilityLabel = (isEligible: boolean | null) => {
    if (isEligible === null) return 'Not on file';
    return isEligible ? 'Eligible' : 'Ineligible';
  };

  const eligibilityBadgeClass = (isEligible: boolean | null) => {
    if (isEligible === null) return 'bg-warm-100 text-warm-500';
    return isEligible ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700';
  };

  return (
    <>
      <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8">
        <h1 className="text-h2 font-semibold text-warm-900">Academics</h1>
        <p className="mt-1 text-body-sm text-warm-500">Track student-athlete academic progress and eligibility</p>
      </div>

      <div className="p-4 lg:p-8 space-y-6">
        {/* Error alert */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center justify-between"
            >
              <span>{error}</span>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setError(null)}
                className="ml-4"
              >
                Dismiss
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <Card variant="glass">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center">
                  <IconUsers size={20} className="text-warm-600" />
                </div>
                <div>
                  <p className="text-sm leading-relaxed text-warm-500">Total Athletes</p>
                  <p className="text-2xl font-semibold tracking-tight text-warm-900">{students.length}</p>
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
                  <p className="text-sm leading-relaxed text-warm-500">Team GPA</p>
                  <p className="text-2xl font-semibold tracking-tight text-warm-900 tabular-nums">
                    {avgGpa !== null ? avgGpa.toFixed(2) : '—'}
                  </p>
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
                  <p className="text-sm leading-relaxed text-warm-500">Eligible</p>
                  <p className="text-2xl font-semibold tracking-tight text-warm-900">{eligibleCount}</p>
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
                  <p className="text-sm leading-relaxed text-warm-500">At Risk</p>
                  <p className="text-2xl font-semibold tracking-tight text-warm-900">{atRiskCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Student table */}
        <Card variant="glass">
          <CardHeader>
            <h2 className="font-semibold text-warm-900">Student-Athletes</h2>
          </CardHeader>
          <CardContent className="p-0 lg:p-0">
            {/* Mobile card view */}
            <div className="lg:hidden p-4 space-y-4">
              {students.map((student) => (
                <motion.div
                  key={student.id}
                  layout
                  className="glass-standard rounded-xl p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <Avatar
                      name={getFullName(student.first_name, student.last_name)}
                      src={student.avatar_url || undefined}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-warm-900 truncate">
                        {getFullName(student.first_name, student.last_name)}
                      </h3>
                      <p className="text-sm text-warm-500">
                        {student.primary_position || 'N/A'}
                        {student.grad_year ? ` • Class of ${student.grad_year}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-warm-50 rounded-lg p-3 text-center">
                      {editingId === student.id ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="4"
                          value={editValues.gpa ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, gpa: e.target.value ? parseFloat(e.target.value) : null })}
                          className="w-full text-center text-base"
                          aria-label="GPA"
                        />
                      ) : (
                        <p className={student.gpa !== null ? 'text-lg font-semibold text-warm-900' : 'text-lg font-semibold text-warm-400 italic'}>
                          {gpaDisplay(student)}
                        </p>
                      )}
                      <p className="text-label font-medium uppercase tracking-wide text-warm-500 mt-1">GPA</p>
                    </div>
                    <div className="bg-warm-50 rounded-lg p-3 text-center">
                      {editingId === student.id ? (
                        <Input
                          type="number"
                          min="0"
                          value={editValues.credits_completed ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, credits_completed: e.target.value ? parseInt(e.target.value, 10) : null })}
                          className="w-full text-center text-base"
                          aria-label="Credits completed"
                        />
                      ) : (
                        <p className="text-lg font-semibold text-warm-900">{creditsDisplay(student)}</p>
                      )}
                      <p className="text-label font-medium uppercase tracking-wide text-warm-500 mt-1">Credits</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {editingId === student.id ? (
                      <>
                        <Select
                          value={editValues.academic_standing ?? ''}
                          onChange={(value) => setEditValues({
                            ...editValues,
                            academic_standing: value ? (value as 'good' | 'warning' | 'probation') : null,
                          })}
                          options={[
                            { value: '', label: 'Unknown' },
                            { value: 'good', label: 'Good Standing' },
                            { value: 'warning', label: 'Warning' },
                            { value: 'probation', label: 'Probation' },
                          ]}
                          className="flex-1 text-base"
                        />
                        <Select
                          value={editValues.is_eligible ? 'eligible' : 'ineligible'}
                          onChange={(value) => setEditValues({ ...editValues, is_eligible: value === 'eligible' })}
                          options={[
                            { value: 'eligible', label: 'Eligible' },
                            { value: 'ineligible', label: 'Ineligible' },
                          ]}
                          className="flex-1 text-base"
                        />
                      </>
                    ) : (
                      <>
                        <Badge
                          className={
                            student.academic_standing
                              ? academicStandingColors[student.academic_standing]
                              : 'bg-warm-100 text-warm-500'
                          }
                        >
                          {standingLabel(student.academic_standing)}
                        </Badge>
                        <Badge className={eligibilityBadgeClass(student.is_eligible)}>
                          {eligibilityLabel(student.is_eligible)}
                        </Badge>
                      </>
                    )}
                  </div>

                  {editingId === student.id ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1 min-h-[44px]">
                        {saving ? 'Saving…' : 'Save'}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={cancelEditing} disabled={saving} className="flex-1 min-h-[44px]">
                        Cancel
                      </Button>
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
                </motion.div>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-warm-200 bg-warm-50">
                    {['Player', 'Position', 'GPA', 'Credits', 'Standing', 'Eligible', 'Actions'].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-3 text-left text-label font-medium uppercase tracking-wider text-warm-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-200">
                  {students.map((student) => (
                    <tr
                      key={student.id}
                      className="hover:bg-warm-50 transition-colors active:bg-warm-100"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={getFullName(student.first_name, student.last_name)}
                            src={student.avatar_url || undefined}
                            size="sm"
                          />
                          <div>
                            <p className="font-medium text-warm-900">
                              {getFullName(student.first_name, student.last_name)}
                            </p>
                            {student.grad_year && (
                              <p className="text-sm leading-relaxed text-warm-500">Class of {student.grad_year}</p>
                            )}
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
                            value={editValues.gpa ?? ''}
                            onChange={(e) => setEditValues({ ...editValues, gpa: e.target.value ? parseFloat(e.target.value) : null })}
                            className="w-20"
                            aria-label="GPA"
                          />
                        ) : (
                          <span className={student.gpa !== null ? 'font-medium tabular-nums' : 'text-warm-400 italic tabular-nums'}>
                            {gpaDisplay(student)}
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {editingId === student.id ? (
                          <Input
                            type="number"
                            min="0"
                            value={editValues.credits_completed ?? ''}
                            onChange={(e) => setEditValues({ ...editValues, credits_completed: e.target.value ? parseInt(e.target.value, 10) : null })}
                            className="w-20"
                            aria-label="Credits completed"
                          />
                        ) : (
                          <span className={student.credits_completed === null ? 'text-warm-400 italic' : 'text-warm-600 tabular-nums'}>
                            {creditsDisplay(student)}
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {editingId === student.id ? (
                          <Select
                            value={editValues.academic_standing ?? ''}
                            onChange={(value) => setEditValues({
                              ...editValues,
                              academic_standing: value ? (value as 'good' | 'warning' | 'probation') : null,
                            })}
                            options={[
                              { value: '', label: 'Unknown' },
                              { value: 'good', label: 'Good' },
                              { value: 'warning', label: 'Warning' },
                              { value: 'probation', label: 'Probation' },
                            ]}
                          />
                        ) : (
                          <Badge
                            className={
                              student.academic_standing
                                ? academicStandingColors[student.academic_standing]
                                : 'bg-warm-100 text-warm-500'
                            }
                          >
                            {standingLabel(student.academic_standing)}
                          </Badge>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {editingId === student.id ? (
                          <Select
                            value={editValues.is_eligible ? 'eligible' : 'ineligible'}
                            onChange={(value) => setEditValues({ ...editValues, is_eligible: value === 'eligible' })}
                            options={[
                              { value: 'eligible', label: 'Eligible' },
                              { value: 'ineligible', label: 'Ineligible' },
                            ]}
                          />
                        ) : (
                          <Badge className={eligibilityBadgeClass(student.is_eligible)}>
                            {eligibilityLabel(student.is_eligible)}
                          </Badge>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {editingId === student.id ? (
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={handleSave} disabled={saving}>
                              {saving ? 'Saving…' : 'Save'}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={cancelEditing} disabled={saving}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => startEditing(student)}>
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
