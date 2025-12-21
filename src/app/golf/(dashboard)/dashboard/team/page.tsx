'use client';

import { Card, CardContent } from '@/components/ui/card';
import { IconUsers } from '@/components/icons';

export default function GolfTeamInfoPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Team Info</h1>
        <p className="text-slate-500 mt-1">Your team and roster</p>
      </div>

      <Card>
        <CardContent className="py-12 text-center">
          <IconUsers size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            Team Information
          </h3>
          <p className="text-slate-500">
            View your team roster and coach information
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
