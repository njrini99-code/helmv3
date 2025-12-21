'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconFlag, IconPlus } from '@/components/icons';

export default function GolfQualifiersPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Qualifiers</h1>
          <p className="text-slate-500 mt-1">Manage team qualifying rounds</p>
        </div>
        <Button className="gap-2">
          <IconPlus size={18} />
          Create Qualifier
        </Button>
      </div>

      <Card>
        <CardContent className="py-12 text-center">
          <IconFlag size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            No Active Qualifiers
          </h3>
          <p className="text-slate-500 mb-4">
            Create a qualifier to track player performance for team selection
          </p>
          <Button className="gap-2">
            <IconPlus size={18} />
            Create First Qualifier
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
