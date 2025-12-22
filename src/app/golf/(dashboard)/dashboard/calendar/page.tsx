'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconCalendar, IconPlus } from '@/components/icons';

export default function GolfCalendarPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Calendar</h1>
          <p className="text-slate-500 mt-1">Team schedule and events</p>
        </div>
        <Button className="gap-2">
          <IconPlus size={18} />
          Add Event
        </Button>
      </div>

      <Card glass>
        <CardContent className="py-12 text-center">
          <IconCalendar size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            Calendar Coming Soon
          </h3>
          <p className="text-slate-500">
            View and manage team events, practices, and tournaments
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
