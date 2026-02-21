'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { IconChart, IconGraduationCap, IconTarget } from '@/components/icons';
import { cn } from '@/lib/utils';

interface DevPlanProgress {
  player_id: string;
  player_name: string;
  total_goals: number;
  completed_goals: number;
  progress_percentage: number;
}

interface TeamAnalyticsProps {
  rosterCount: number;
  recruitingActiveCount: number;
  avgGPA: number | null;
  collegeInterestCount: number;
  devPlanCount: number;
  academicAlertCount: number;
  devPlanProgress: DevPlanProgress[];
}

export function TeamAnalytics({
  rosterCount,
  recruitingActiveCount,
  avgGPA,
  collegeInterestCount,
  devPlanCount,
  academicAlertCount,
  devPlanProgress,
}: TeamAnalyticsProps) {
  const recruitingPercent = rosterCount > 0 ? Math.round((recruitingActiveCount / rosterCount) * 100) : 0;
  const alertPercent = rosterCount > 0 ? Math.round((academicAlertCount / rosterCount) * 100) : 0;
  const gpaStatus = avgGPA ? (avgGPA >= 3.0 ? 'Excellent' : avgGPA >= 2.5 ? 'Good' : 'Needs Attention') : 'N/A';
  const gpaVariant = avgGPA ? (avgGPA >= 3.0 ? 'success' : avgGPA >= 2.5 ? 'warning' : 'danger') : 'secondary';

  return (
    <Card variant="glass">
      <CardHeader className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">Team Analytics</h2>
          <p className="text-sm leading-relaxed text-slate-500 mt-1">Performance signals and focus areas</p>
        </div>
        <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <IconChart size={20} className="text-slate-600" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Recruiting Activation</span>
            <span className="font-medium text-slate-900">{recruitingPercent}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full bg-primary-600"
              style={{ width: `${recruitingPercent}%` }}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Academic Risk</span>
            <span className="font-medium text-slate-900">{alertPercent}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200">
            <div
              className={cn('h-2 rounded-full', alertPercent > 25 ? 'bg-amber-500' : 'bg-amber-300')}
              style={{ width: `${alertPercent}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-slate-500">
              <IconTarget size={14} />
              <span>College Interest</span>
            </div>
            <p className="mt-1 text-lg font-semibold text-slate-900">{collegeInterestCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-slate-500">
              <IconGraduationCap size={14} />
              <span>Avg GPA</span>
            </div>
            <p className="mt-1 text-lg font-semibold text-slate-900">{avgGPA?.toFixed(2) || 'N/A'}</p>
            <Badge variant={gpaVariant} className="mt-2 text-xs">
              {gpaStatus}
            </Badge>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-700">Active Development Plans</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{devPlanCount}</p>
          {devPlanProgress.length > 0 && (
            <div className="mt-3 space-y-3">
              {devPlanProgress.slice(0, 3).map((progress) => (
                <div key={progress.player_id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{progress.player_name}</span>
                    <span>{progress.completed_goals}/{progress.total_goals} goals</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-primary-600"
                      style={{ width: `${progress.progress_percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
