'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconBell, IconPlus } from '@/components/icons';

export default function GolfAnnouncementsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Announcements</h1>
          <p className="text-slate-500 mt-1">Team news and updates</p>
        </div>
        <Button className="gap-2">
          <IconPlus size={18} />
          New Announcement
        </Button>
      </div>

      <Card>
        <CardContent className="py-12 text-center">
          <IconBell size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            No Announcements
          </h3>
          <p className="text-slate-500">
            Keep your team informed with announcements
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
