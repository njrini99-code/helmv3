'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconClipboardList, IconPlus } from '@/components/icons';

export default function GolfTasksPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Tasks</h1>
          <p className="text-slate-500 mt-1">Assign and track player tasks</p>
        </div>
        <Button className="gap-2">
          <IconPlus size={18} />
          Create Task
        </Button>
      </div>

      <Card glass>
        <CardContent className="py-12 text-center">
          <IconClipboardList size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            No Active Tasks
          </h3>
          <p className="text-slate-500">
            Create tasks for your team to complete
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
