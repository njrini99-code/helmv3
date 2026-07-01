'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/sonner';
import { changePasswordAction } from '@/app/baseball/actions/auth';
import { IconChevronRight, IconShield, IconBuilding, IconBell, IconMail } from '@/components/icons';
import Link from 'next/link';

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong' | null>(null);

  // Calculate password strength
  const updatePasswordStrength = (password: string) => {
    setNewPassword(password);
    if (password.length === 0) {
      setPasswordStrength(null);
    } else if (password.length < 8) {
      setPasswordStrength('weak');
    } else if (password.length < 10 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setPasswordStrength('medium');
    } else {
      setPasswordStrength('strong');
    }
  };

  if (loading) return <PageLoading />;

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }

    // Validate password length
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }

    if (!currentPassword.trim()) {
      showToast('Current password is required', 'error');
      return;
    }

    setSaving(true);

    try {
      const result = await changePasswordAction(currentPassword, newPassword);

      if (!result.success) {
        showToast(result.error ?? 'Failed to update password', 'error');
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password updated successfully', 'success');
    } catch {
      showToast('An unexpected error occurred', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);

    try {
      const response = await fetch('/api/account/delete', { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        showToast(payload.error || 'Failed to delete account', 'error');
        return;
      }

      showToast('Account deleted successfully', 'success');
      window.location.href = '/';
    } catch {
      showToast('Failed to delete account', 'error');
    } finally {
      setDeletingAccount(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
    }
  };

  return (
    <>
      <Header title="Settings" subtitle="Manage your account settings" />
      <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
        {/* Program Profile Link (Coaches Only) */}
        {user?.role === 'coach' && (
          <Link href="/baseball/dashboard/program">
            <Card variant="interactive" className="cursor-pointer transition-all hover:border-primary-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                      <IconBuilding size={24} className="text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-warm-900 mb-1">Program Profile</h3>
                      <p className="text-sm leading-relaxed text-warm-500">Customize your public program page for recruits</p>
                    </div>
                  </div>
                  <IconChevronRight size={20} className="text-warm-400" />
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Privacy Settings Link (Players Only) */}
        {user?.role === 'player' && (
          <Link href="/baseball/dashboard/settings/privacy">
            <Card variant="interactive" className="cursor-pointer transition-all hover:border-primary-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                      <IconShield size={24} className="text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-warm-900 mb-1">Privacy Settings</h3>
                      <p className="text-sm leading-relaxed text-warm-500">Control what appears on your public profile</p>
                    </div>
                  </div>
                  <IconChevronRight size={20} className="text-warm-400" />
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Notification Preferences (Coaches) — the real, persisted store lives on
            Program Settings (baseball_program_settings.notification_defaults via
            ProgramSettingsClient + updateProgramSettings). This used to be a
            second, disconnected card that only updated local React state and
            toasted "success" with no server call (#454, #466) — removed in
            favor of a single link to the real surface so there is exactly one
            place to configure notifications and no fake toggle to drift out of
            sync with what's actually saved. */}
        {user?.role === 'coach' && (
          <Link href="/baseball/dashboard/settings/program#notifications">
            <Card variant="interactive" className="cursor-pointer transition-all hover:border-primary-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                      <IconBell size={24} className="text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-warm-900 mb-1">Notification Preferences</h3>
                      <p className="text-sm leading-relaxed text-warm-500">Manage quiet hours and per-type notification defaults for your program</p>
                    </div>
                  </div>
                  <IconChevronRight size={20} className="text-warm-400" />
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        <Card variant="glass">
          <CardHeader>
            <div className="flex items-center gap-2">
              <IconMail size={20} className="text-warm-600" />
              <h2 className="font-semibold text-warm-900">Account Information</h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input label="Email" type="email" value={user?.email || ''} disabled />
            <Input label="Role" value={user?.role || ''} disabled className="capitalize" />
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader><h2 className="font-semibold text-warm-900">Change Password</h2></CardHeader>
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
              <div>
                <Input
                  label="New Password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => updatePasswordStrength(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
                {/* Password strength indicator */}
                {passwordStrength && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 flex gap-1">
                      <div className={`h-1.5 rounded-full flex-1 transition-colors ${
                        passwordStrength === 'weak' ? 'bg-red-400' : passwordStrength === 'medium' ? 'bg-amber-400' : 'bg-primary-500'
                      }`} />
                      <div className={`h-1.5 rounded-full flex-1 transition-colors ${
                        passwordStrength === 'medium' ? 'bg-amber-400' : passwordStrength === 'strong' ? 'bg-primary-500' : 'bg-warm-200'
                      }`} />
                      <div className={`h-1.5 rounded-full flex-1 transition-colors ${
                        passwordStrength === 'strong' ? 'bg-primary-500' : 'bg-warm-200'
                      }`} />
                    </div>
                    <span className={`text-xs font-medium ${
                      passwordStrength === 'weak' ? 'text-red-600' : passwordStrength === 'medium' ? 'text-amber-600' : 'text-primary-600'
                    }`}>
                      {passwordStrength === 'weak' ? 'Weak' : passwordStrength === 'medium' ? 'Medium' : 'Strong'}
                    </span>
                  </div>
                )}
              </div>
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
                <Button type="submit" isLoading={saving}>Update Password</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader><h2 className="font-semibold text-warm-900">Legal & Data</h2></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href="/privacy" className="text-warm-600 hover:text-warm-900 transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-warm-600 hover:text-warm-900 transition-colors">
                Terms of Service
              </Link>
            </div>
            <div className="pt-2 border-t border-warm-200/60">
              {!showDeleteConfirm ? (
                <>
                  <p className="text-sm text-warm-500 mb-3">
                    You can permanently delete your account and personal data. This action is irreversible.
                  </p>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete Account
                  </Button>
                </>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <IconShield size={16} className="text-red-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-red-900 mb-1">Confirm Account Deletion</h4>
                      <p className="text-sm text-red-700 mb-3">
                        This will permanently delete your account, all your data, and any associated content. This action cannot be undone.
                      </p>
                      <p className="text-sm text-red-700 mb-2">
                        Type <span className="font-mono font-semibold">DELETE</span> to confirm:
                      </p>
                      <Input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="Type DELETE to confirm"
                        className="border-red-300 focus:border-red-500 focus:ring-red-100"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmText('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      isLoading={deletingAccount}
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== 'DELETE'}
                    >
                      Permanently Delete Account
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
