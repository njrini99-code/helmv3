'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IconSettings } from '@/components/icons';

export default function GolfSettingsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Manage your account and preferences</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Account Settings</CardTitle>
          </CardHeader>
          <CardContent className="py-8 text-center">
            <IconSettings size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500">
              Account settings coming soon
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team Settings</CardTitle>
          </CardHeader>
          <CardContent className="py-8 text-center">
            <p className="text-slate-500">
              Team settings coming soon
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
          </CardHeader>
          <CardContent className="py-8 text-center">
            <p className="text-slate-500">
              Notification settings coming soon
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
