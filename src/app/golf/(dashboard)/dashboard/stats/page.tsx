'use client';

import { Card, CardContent } from '@/components/ui/card';
import { IconChartBar } from '@/components/icons';

export default function GolfStatsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Statistics</h1>
        <p className="text-slate-500 mt-1">Team and player performance analytics</p>
      </div>

      <Card>
        <CardContent className="py-12 text-center">
          <IconChartBar size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            Statistics Dashboard
          </h3>
          <p className="text-slate-500">
            View scoring averages, putting stats, and performance trends
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
