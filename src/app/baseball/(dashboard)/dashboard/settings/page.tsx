'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/sonner';
import { changePasswordAction } from '@/app/baseball/actions/auth';
import { SectionMasthead } from '@/components/baseball/living-annual';
import { InlineNotice } from '@/components/fairway';
import {
  IconBell,
  IconBuilding,
  IconCalendar,
  IconChevronRight,
  IconDatabase,
  IconLink,
  IconLock,
  IconMail,
  IconPalette,
  IconSchool,
  IconSettings,
  IconShield,
  IconTarget,
  IconUpload,
  IconUsers,
} from '@/components/icons';
import Link from 'next/link';

const COACH_SETTINGS_LINKS = [
  {
    href: '/baseball/dashboard/settings/program',
    label: 'Program Settings',
    description: 'Identity, public profile, notifications, AI, and access defaults',
    icon: IconBuilding,
  },
  {
    href: '/baseball/dashboard/settings/staff',
    label: 'Staff Settings',
    description: 'Staff seats, assignments, and coaching responsibilities',
    icon: IconUsers,
  },
  {
    href: '/baseball/dashboard/settings/teams',
    label: 'Team Settings',
    description: 'Team records, roster configuration, and season ownership',
    icon: IconUsers,
  },
  {
    href: '/baseball/dashboard/settings/season',
    label: 'Season Settings',
    description: 'Season dates, opponent naming, and competition context',
    icon: IconCalendar,
  },
  {
    href: '/baseball/dashboard/settings/philosophy',
    label: 'Coaching Philosophy',
    description: 'Development model, evaluation priorities, and program language',
    icon: IconTarget,
  },
  {
    href: '/baseball/dashboard/settings/roles',
    label: 'Role Templates',
    description: 'Default role packs for staff and program collaborators',
    icon: IconLock,
  },
  {
    href: '/baseball/dashboard/settings/permissions',
    label: 'Permissions Matrix',
    description: 'Capability-level access across staff roles',
    icon: IconShield,
  },
  {
    href: '/baseball/dashboard/settings/imports',
    label: 'Import Sources',
    description: 'Trust levels, review rules, and player matching for imported data',
    icon: IconUpload,
  },
  {
    href: '/baseball/dashboard/settings/integrations',
    label: 'Integrations',
    description: 'Adapter levels for stat feeds, devices, and partner systems',
    icon: IconLink,
  },
  {
    href: '/baseball/dashboard/settings/audit',
    label: 'Audit Log',
    description: 'Append-only history of sensitive settings changes',
    icon: IconDatabase,
  },
] as const;

const PLAYER_SETTINGS_LINKS = [
  {
    href: '/baseball/dashboard/settings/privacy',
    label: 'Privacy Settings',
    description: 'Control what appears on your public profile',
    icon: IconShield,
  },
  {
    href: '/baseball/dashboard/settings/recruiting-preferences',
    label: 'Recruiting Preferences',
    description: 'Manage exposure preferences and college fit signals',
    icon: IconSchool,
  },
] as const;

const CONSOLIDATED_SETTINGS_LINKS = [
  {
    href: '/baseball/dashboard/settings/program#appearance',
    label: 'Appearance',
    description: 'Team branding and public profile presentation',
    icon: IconPalette,
  },
  {
    href: '/baseball/dashboard/settings/program#notifications',
    label: 'Notifications',
    description: 'Quiet hours and program notification defaults',
    icon: IconBell,
  },
  {
    href: '/baseball/dashboard/settings/program#data-retention',
    label: 'Data Retention',
    description: 'Retention defaults, export posture, and audit policy',
    icon: IconDatabase,
  },
] as const;

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
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Shared LA masthead — same component + eyebrow grammar as Roles and
          Program Settings, so the three settings surfaces read as one section
          of the publication (spec §5, ui-migration-map settings row). */}
      <SectionMasthead eyebrow="THE PRESSBOX · SETTINGS" title="Settings" ink="team">
        <p className="font-annual text-body-sm text-text-secondary">Manage your account settings</p>
      </SectionMasthead>

      <div className="space-y-6">
        <section className="grid gap-3 sm:grid-cols-2">
          {(user?.role === 'coach' ? COACH_SETTINGS_LINKS : PLAYER_SETTINGS_LINKS).map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <Card variant="interactive" className="h-full cursor-pointer transition-all hover:border-primary-200">
                  <CardContent className="p-5">
                    <div className="flex h-full items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100">
                          <Icon size={20} className="text-primary-600" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-warm-900">{item.label}</h3>
                          <p className="mt-1 text-sm leading-relaxed text-warm-500">{item.description}</p>
                        </div>
                      </div>
                      <IconChevronRight size={18} className="mt-2 shrink-0 text-warm-400" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </section>

        {user?.role === 'coach' && (
          <Card variant="glass">
            <CardHeader>
              <div className="flex items-center gap-2">
                <IconSettings size={20} className="text-warm-600" />
                <h2 className="font-semibold text-warm-900">Consolidated Program Sections</h2>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {CONSOLIDATED_SETTINGS_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="bg-[color:var(--paper)] rounded-lg border border-warm-200/70 p-4 transition-colors hover:border-primary-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <Icon size={18} className="text-warm-600" />
                      <IconChevronRight size={16} className="text-warm-400" />
                    </div>
                    <h3 className="font-medium text-warm-900">{item.label}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-warm-500">{item.description}</p>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}

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
                <InlineNotice
                  tone="danger"
                  title="Confirm account deletion"
                  dismissible
                  onDismiss={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                >
                  <div className="space-y-3">
                    <p>
                      This will permanently delete your account, all your data, and any
                      associated content. This action cannot be undone.
                    </p>
                    <p>
                      Type <span className="font-mono font-semibold">DELETE</span> to confirm:
                    </p>
                    <Input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE to confirm"
                    />
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
                </InlineNotice>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
