'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconBook, IconPlus } from '@/components/icons';

export default function GolfClassesPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">My Classes</h1>
          <p className="text-slate-500 mt-1">Academic schedule</p>
        </div>
        <Button className="gap-2">
          <IconPlus size={18} />
          Add Class
        </Button>
      </div>

      <Card>
        <CardContent className="py-12 text-center">
          <IconBook size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            No Classes Added
          </h3>
          <p className="text-slate-500 mb-4">
            Add your class schedule to help with practice planning
          </p>
          <Button className="gap-2">
            <IconPlus size={18} />
            Add First Class
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
