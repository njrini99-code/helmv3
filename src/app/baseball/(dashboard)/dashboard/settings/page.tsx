'use client';

// =============================================================================
// src/app/baseball/(dashboard)/dashboard/settings/page.tsx
//
// The Settings hub — the first screen a head coach opens when configuring the
// program, and previously the surface where three design vocabularies collided
// most visibly: a Living Annual `SectionMasthead` sat on top of legacy
// `Card variant="glass" | "interactive"` panels painted in raw `warm-*` /
// `cream-*` / `primary-*`, with a single Fairway `InlineNotice` dropped into
// the delete-account flow. Three card stocks, three border colors, three text
// ramps, one page.
//
// Everything now composes from `SettingsChrome` (SettingsShell / SettingsSection
// / SettingsNavCard / SettingsNotice) so the hub and its ten leaves share one
// card stock and one type ramp. Form primitives (`Input`, `Button` from
// `@/components/ui/*`) are untouched — same convention as ProgramSettingsClient.
//
// PRESENTATION-ONLY: every href, every settings key, `changePasswordAction`,
// the `/api/account/delete` call, the DELETE-confirmation gate, and the
// role-based link partition are preserved verbatim.
// =============================================================================

import { useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/sonner';
import { changePasswordAction } from '@/app/baseball/actions/auth';
import { InkNotice } from '@/components/baseball/living-annual';
import {
  SettingsNavCard,
  SettingsSection,
  SettingsShell,
} from '@/components/baseball/settings/SettingsChrome';
import { SettingsHubSkeleton } from '@/components/baseball/settings/SettingsHubSkeleton';
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
  IconSettings,
  IconShield,
  IconShieldCheck,
  IconTarget,
  IconUpload,
  IconUsers,
  IconX,
} from '@/components/icons';

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
    // P0 fix: this card used to point at
    // /baseball/dashboard/settings/recruiting-preferences, a COACH-only
    // recruiting-philosophy page (`if (!coach) redirect('/baseball/login')`).
    // A player session always has session.coach === null, so every player who
    // clicked this card was bounced straight to the login screen. The real
    // player-facing exposure controls already live on the Passport page
    // (Visibility Controls: staff-only / player-visible / public / scout
    // packet). Repoint here now; a dedicated player-facing recruiting/college-
    // fit preferences page is a deferred, real feature-design task (new UI,
    // new fields), tracked separately — not a same-day redirect fix.
    href: '/baseball/player/passport',
    label: 'Passport & Visibility',
    description: 'Control what recruiters and scouts can see',
    icon: IconShieldCheck,
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

/**
 * Password-strength meter ink.
 *
 * The old meter mixed `bg-primary-500` / `bg-warm-200` utilities with inline
 * `style` overrides reading `--notice-error-ink` and `--pursuit-ink`, so the
 * three states were painted by two different mechanisms. They now all read the
 * two-ink lane: clay for "not there yet", team green for strong. The label
 * carries the meaning in words, so color is never the only channel.
 */
/**
 * BAR fill. `medium` is deliberately a 55% mix — a partially-filled meter
 * reads as "partway there", and a large block of colour can afford the
 * lighter value.
 */
const STRENGTH_INK = {
  weak: 'var(--notice-error-ink)',
  medium: 'color-mix(in oklch, var(--pursuit-ink) 55%, var(--paper))',
  strong: 'var(--grade-plus)',
} as const;

/**
 * LABEL ink — deliberately NOT the same values as the bar.
 *
 * A unification pass collapsed these two into one map, which dropped the 12px
 * "Medium" text from roughly 3.1:1 to 1.8:1 on --paper. WCAG AA wants 4.5:1
 * for body text (3:1 at large sizes, which 12px is not). A 55% mix is fine
 * across a 40px meter segment and illegible across four characters of type.
 *
 * The original code had them split for this reason; they are split again,
 * with the reason written down so the next unification pass leaves them alone.
 */
const STRENGTH_LABEL_INK = {
  weak: 'var(--notice-error-ink)',
  medium: 'var(--pursuit-ink)',
  strong: 'var(--grade-plus)',
} as const;

const STRENGTH_LABEL = { weak: 'Weak', medium: 'Medium', strong: 'Strong' } as const;

/** How many of the three segments are lit at each strength. */
const STRENGTH_SEGMENTS = { weak: 1, medium: 2, strong: 3 } as const;

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

  // Shape-matches the route-level loading.tsx, so the auth-settling frame and
  // the navigation frame are the same picture rather than two different ones.
  if (loading) return <SettingsHubSkeleton />;

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

  const dismissDeleteConfirm = () => {
    setShowDeleteConfirm(false);
    setDeleteConfirmText('');
  };

  const isCoach = user?.role === 'coach';
  const navLinks = isCoach ? COACH_SETTINGS_LINKS : PLAYER_SETTINGS_LINKS;

  return (
    <SettingsShell title="Settings" lede="Manage your account settings" width="wide">
      <section className="grid gap-3 sm:grid-cols-2">
        {navLinks.map((item, i) => {
          const Icon = item.icon;
          return (
            <SettingsNavCard
              key={item.href}
              href={item.href}
              label={item.label}
              description={item.description}
              icon={<Icon size={20} />}
              index={i}
            />
          );
        })}
      </section>

      {isCoach && (
        <SettingsSection
          icon={<IconSettings size={18} />}
          title="Consolidated Program Sections"
          subtitle="These controls live as sections of Program Settings — one save surface, one capability gate."
          bodySpacing="none"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {CONSOLIDATED_SETTINGS_LINKS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  // Inset stock (paper-canvas) rather than another PaperCard:
                  // a card inside a card at the same value reads as a seam.
                  className="group rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-4 transition-colors duration-200 hover:border-grade-plus/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--paper)]"
                  href={item.href}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Icon size={18} className="text-grade-plus" />
                    <IconChevronRight
                      size={16}
                      className="text-text-tertiary transition-colors duration-200 group-hover:text-grade-plus"
                    />
                  </div>
                  <h3 className="font-annual text-body font-semibold text-text-primary">
                    {item.label}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                    {item.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </SettingsSection>
      )}

      {/* Program Profile Link (Coaches Only) */}
      {isCoach && (
        <SettingsNavCard
          href="/baseball/dashboard/program"
          label="Program Profile"
          description="Customize your public program page for recruits"
          icon={<IconBuilding size={20} />}
        />
      )}

      <SettingsSection icon={<IconMail size={18} />} title="Account Information">
        <Input label="Email" type="email" value={user?.email || ''} disabled />
        <Input label="Role" value={user?.role || ''} disabled className="capitalize" />
      </SettingsSection>

      <SettingsSection icon={<IconLock size={18} />} title="Change Password" bodySpacing="none">
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
                <div className="flex flex-1 gap-1">
                  {[0, 1, 2].map((segment) => (
                    <div
                      key={segment}
                      className="h-1.5 flex-1 rounded-full transition-colors"
                      style={{
                        backgroundColor:
                          segment < STRENGTH_SEGMENTS[passwordStrength]
                            ? STRENGTH_INK[passwordStrength]
                            // An UNLIT segment still has to be visible, or the
                            // meter reads as one short bar and its length stops
                            // carrying information. `--hairline` on `--paper`
                            // is about 1.4:1 — a divider value, correct for a
                            // 1px rule and invisible as a 6px track.
                            : 'color-mix(in oklch, var(--pursuit-ink) 18%, var(--paper))',
                      }}
                    />
                  ))}
                </div>
                <span
                  className="text-xs font-medium"
                  style={{ color: STRENGTH_LABEL_INK[passwordStrength] }}
                >
                  {STRENGTH_LABEL[passwordStrength]}
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
      </SettingsSection>

      <SettingsSection icon={<IconShield size={18} />} title="Legal & Data">
        <div className="flex flex-wrap gap-4 text-sm">
          <Link
            href="/privacy"
            className="text-text-secondary underline-offset-4 transition-colors hover:text-text-primary hover:underline"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="text-text-secondary underline-offset-4 transition-colors hover:text-text-primary hover:underline"
          >
            Terms of Service
          </Link>
        </div>
        <div className="border-t border-[color:var(--hairline)] pt-4">
          {!showDeleteConfirm ? (
            <>
              <p className="mb-3 text-sm leading-relaxed text-text-secondary">
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
            // InkNotice, not the Fairway InlineNotice this used to render: the
            // baseball empty-state doctrine routes urgency through a clay ink
            // rule on paper stock rather than a tinted danger box, and mixing
            // the two systems is exactly what made this page look assembled.
            <InkNotice ink="pursuit">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-annual text-body font-semibold text-text-primary">
                    Confirm account deletion
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={dismissDeleteConfirm}
                    aria-label="Dismiss account deletion confirmation"
                    className="-mr-1 -mt-1 shrink-0 text-text-tertiary hover:text-text-primary"
                  >
                    <IconX size={14} />
                  </Button>
                </div>
                <p className="text-text-secondary">
                  This will permanently delete your account, all your data, and any
                  associated content. This action cannot be undone.
                </p>
                <p className="text-text-secondary">
                  Type <span className="font-mono font-semibold text-text-primary">DELETE</span> to confirm:
                </p>
                <Input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                />
                <div className="flex items-center justify-end gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={dismissDeleteConfirm}
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
            </InkNotice>
          )}
        </div>
      </SettingsSection>
    </SettingsShell>
  );
}
