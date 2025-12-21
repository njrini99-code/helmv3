'use client';

import { Card, CardContent } from '@/components/ui/card';
import { IconMail } from '@/components/icons';

export default function GolfMessagesPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Messages</h1>
        <p className="text-slate-500 mt-1">Team communication</p>
      </div>

      <Card>
        <CardContent className="py-12 text-center">
          <IconMail size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            No Messages Yet
          </h3>
          <p className="text-slate-500">
            Start a conversation with your team
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
