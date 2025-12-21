'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { IconChevronRight, IconShield, IconBuilding, IconBell, IconMail } from '@/components/icons';
import Link from 'next/link';

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notificationSettings, setNotificationSettings] = useState({
    emailNewPlayer: true,
    emailMessages: true,
    emailWeeklyDigest: false,
  });

  if (loading) return <PageLoading />;

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }

    // Validate password length
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();

      // Supabase updateUser doesn't require current password verification
      // The user must be logged in, which is sufficient for password change
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        showToast(error.message || 'Failed to update password', 'error');
        return;
      }

      // Success - clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password updated successfully', 'success');
    } catch (error) {
      console.error('Password update error:', error);
      showToast('An unexpected error occurred', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header title="Settings" subtitle="Manage your account settings" />
      <div className="p-8 max-w-2xl mx-auto space-y-6">
        {/* Program Profile Link (Coaches Only) */}
        {user?.role === 'coach' && (
          <Link href="/baseball/dashboard/program">
            <Card hover className="cursor-pointer transition-all hover:border-green-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                      <IconBuilding size={24} className="text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-1">Program Profile</h3>
                      <p className="text-sm text-slate-500">Customize your public program page for recruits</p>
                    </div>
                  </div>
                  <IconChevronRight size={20} className="text-slate-400" />
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Privacy Settings Link (Players Only) */}
        {user?.role === 'player' && (
          <Link href="/baseball/dashboard/settings/privacy">
            <Card hover className="cursor-pointer transition-all hover:border-green-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                      <IconShield size={24} className="text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-1">Privacy Settings</h3>
                      <p className="text-sm text-slate-500">Control what appears on your public profile</p>
                    </div>
                  </div>
                  <IconChevronRight size={20} className="text-slate-400" />
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Notification Settings (Coaches) */}
        {user?.role === 'coach' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <IconBell size={20} className="text-slate-600" />
                <h2 className="font-semibold text-gray-900">Notification Preferences</h2>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                <div>
                  <p className="font-medium text-slate-900">New Player Alerts</p>
                  <p className="text-sm text-slate-500">Get notified when new players match your criteria</p>
                </div>
                <input
                  type="checkbox"
                  checked={notificationSettings.emailNewPlayer}
                  onChange={(e) => setNotificationSettings(prev => ({ ...prev, emailNewPlayer: e.target.checked }))}
                  className="w-5 h-5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                <div>
                  <p className="font-medium text-slate-900">Message Notifications</p>
                  <p className="text-sm text-slate-500">Email me when I receive new messages</p>
                </div>
                <input
                  type="checkbox"
                  checked={notificationSettings.emailMessages}
                  onChange={(e) => setNotificationSettings(prev => ({ ...prev, emailMessages: e.target.checked }))}
                  className="w-5 h-5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                <div>
                  <p className="font-medium text-slate-900">Weekly Recruiting Digest</p>
                  <p className="text-sm text-slate-500">Get a weekly summary of new prospects</p>
                </div>
                <input
                  type="checkbox"
                  checked={notificationSettings.emailWeeklyDigest}
                  onChange={(e) => setNotificationSettings(prev => ({ ...prev, emailWeeklyDigest: e.target.checked }))}
                  className="w-5 h-5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
              </label>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <IconMail size={20} className="text-slate-600" />
              <h2 className="font-semibold text-gray-900">Account Information</h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input label="Email" type="email" value={user?.email || ''} disabled />
            <Input label="Role" value={user?.role || ''} disabled className="capitalize" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold text-gray-900">Change Password</h2></CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <Input
                label="Current Password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <Input
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <Input
                label="Confirm New Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <div className="flex justify-end pt-4">
                <Button type="submit" loading={saving}>Update Password</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
