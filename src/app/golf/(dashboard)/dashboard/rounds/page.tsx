'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconGolf, IconPlus } from '@/components/icons';

export default function GolfRoundsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Rounds</h1>
          <p className="text-slate-500 mt-1">Track your golf performance</p>
        </div>
        <Button className="gap-2">
          <IconPlus size={18} />
          Submit Round
        </Button>
      </div>

      <Card glass>
        <CardContent className="py-12 text-center">
          <IconGolf size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            No Rounds Recorded
          </h3>
          <p className="text-slate-500 mb-4">
            Submit your first round to start tracking your performance
          </p>
          <Button className="gap-2">
            <IconPlus size={18} />
            Submit First Round
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
