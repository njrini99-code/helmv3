'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconFolder, IconPlus } from '@/components/icons';

export default function GolfDocumentsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Documents</h1>
          <p className="text-slate-500 mt-1">Team files and resources</p>
        </div>
        <Button className="gap-2">
          <IconPlus size={18} />
          Upload Document
        </Button>
      </div>

      <Card>
        <CardContent className="py-12 text-center">
          <IconFolder size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            No Documents
          </h3>
          <p className="text-slate-500">
            Upload team documents and resources
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
