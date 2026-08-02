'use client';

/**
 * ============================================================================
 * Fairway · Roster · FairwayInvitePlayerButton (C14)
 * ----------------------------------------------------------------------------
 * PRESENTATION-ONLY re-skin of the legacy
 *   src/components/golf/roster/InvitePlayerButton.tsx
 * onto the warm-premium Fairway language. A Button that opens a ModalShell
 * surfacing (and, if needed, generating) the team's invite code + join link,
 * with copy-to-clipboard affordances and a short "how it works" explainer.
 *
 * SERVER ACTION — reused VERBATIM by exact import path, never wrapped/weakened:
 *   invitePlayerToTeam('') from '@/app/golf/actions/golf'
 *     → Promise<{ success: boolean; error?: string;
 *                 data?: { inviteCode: string; inviteLink: string } }>
 *   The `inviteLink` it returns is a RELATIVE path ("/golf/join/<code>"); we
 *   prepend window.location.origin client-side to build the shareable URL,
 *   exactly as the legacy component did.
 *
 * This action is a benign FETCH-OR-GENERATE (it returns the existing join_code,
 * or mints one if absent) — NOT a destructive write. We mirror the legacy
 * behavior of generating on open when no code is known yet. No row is ever
 * deleted-then-reinserted, and no truly destructive mutation is auto-fired.
 *
 * ADDITIVE ONLY — a brand-new file; the legacy InvitePlayerButton is untouched.
 * Renders inside a `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button, IconButton } from '@/components/fairway/controls/button';
import { Input } from '@/components/fairway/forms/Input';
import {
  OnboardingStep,
  OnboardingSteps,
} from '@/components/fairway/feedback/OnboardingStep';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import {
  IconPlus,
  IconCopy,
  IconCheck,
  IconLink,
  IconUsers,
} from '@/components/icons';
import { invitePlayerToTeam } from '@/app/golf/actions/golf';

/* ---------------------------------------------------------------------------
 * Props
 * ------------------------------------------------------------------------- */

export interface FairwayInvitePlayerButtonProps {
  /**
   * The team's already-known join code (from the roster route's loader). When
   * present, the modal opens straight to the code — no action call needed. When
   * null/absent, the modal generates one on open via invitePlayerToTeam('').
   */
  joinCode?: string | null;
  /**
   * Team display name (titles the modal: "Invite players to {teamName}").
   * Optional — falls back to a generic title.
   */
  teamName?: string | null;
  /**
   * Owning team id. Carried for parity with the roster composer's wiring; the
   * server action resolves the team from the signed-in coach, so it is NOT
   * passed to the mutation. Reserved for future per-team invite affordances.
   */
  teamId?: string | null;
  /** Button visual variant. Default `primary` (the green CTA). */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Button size. Default `md`. */
  size?: 'sm' | 'md' | 'lg';
  /** Button label. Default "Invite player". */
  label?: string;
  /** Extra classes merged onto the trigger Button. */
  className?: string;
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------- */

export function FairwayInvitePlayerButton({
  joinCode = null,
  teamName = null,
  teamId: _teamId = null,
  variant = 'primary',
  size = 'md',
  label = 'Invite player',
  className,
}: FairwayInvitePlayerButtonProps) {
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [inviteCode, setInviteCode] = React.useState<string | null>(joinCode);
  const [inviteLink, setInviteLink] = React.useState<string | null>(null);
  const [copiedField, setCopiedField] = React.useState<'code' | 'link' | null>(
    null,
  );

  // Keep a stable handle to any pending copied-reset timer so we can clear it
  // on unmount / re-copy (no setState-after-unmount).
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  // Resolve the shareable link from an existing code (client-only — needs the
  // window origin), mirroring the legacy effect.
  React.useEffect(() => {
    if (joinCode && typeof window !== 'undefined') {
      setInviteCode(joinCode);
      setInviteLink(`${window.location.origin}/golf/join/${joinCode}`);
    }
  }, [joinCode]);

  // Fetch-or-generate the team invite code. invitePlayerToTeam is reused
  // VERBATIM — it returns { success, data: { inviteCode, inviteLink } } where
  // inviteLink is RELATIVE. We build the absolute URL from window.location.origin.
  const generate = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invitePlayerToTeam('');
      if (result.success && result.data) {
        setInviteCode(result.data.inviteCode);
        setInviteLink(`${window.location.origin}${result.data.inviteLink}`);
        router.refresh();
      } else {
        const msg = (!result.success && result.error) || 'Could not generate an invite link';
        setError(msg);
        fairwayToast.error(msg);
      }
    } catch {
      const msg = 'An unexpected error occurred';
      setError(msg);
      fairwayToast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [router]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      // Generate on open only when we have nothing to show yet (matches legacy).
      if (!inviteLink) void generate();
    }
  }

  async function copyValue(value: string, field: 'code' | 'link') {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      fairwayToast.error('Clipboard is unavailable in this browser');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      fairwayToast.success(
        field === 'code' ? 'Invite code copied' : 'Invite link copied',
      );
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedField(null), 2000);
    } catch {
      fairwayToast.error('Could not copy to clipboard');
    }
  }

  const heading = teamName ? `Invite players to ${teamName}` : 'Invite players';

  return (
    <>
      <Button
        variant={variant}
        size={size}
        leftIcon={<IconPlus size={size === 'sm' ? 15 : 18} />}
        onClick={() => handleOpenChange(true)}
        className={className}
      >
        {label}
      </Button>

      <ModalShell
        open={open}
        onOpenChange={handleOpenChange}
        size="lg"
        title={heading}
        description="Share this invite to add players to your roster. They join by opening the link or entering the code — no manual add needed."
      >
        <ModalShell.Body>
          <div className="space-y-6">
            {/* ── LOADING ───────────────────────────────────────────────── */}
            {loading ? (
              <div className="space-y-3" aria-live="polite">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-11 w-full rounded-fw-md" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-11 w-full rounded-fw-md" />
                <span className="sr-only">Generating invite link…</span>
              </div>
            ) : null}

            {/* ── ERROR ─────────────────────────────────────────────────── */}
            {error && !loading ? (
              <InlineNotice tone="danger" title="Couldn't generate an invite">
                <p>{error}</p>
                <div className="mt-3">
                  <Button variant="secondary" size="sm" onClick={() => void generate()}>
                    Try again
                  </Button>
                </div>
              </InlineNotice>
            ) : null}

            {/* ── SUCCESS — code + link + explainer ─────────────────────── */}
            {!loading && !error && inviteLink && inviteCode ? (
              <>
                {/* Invite code (read-only Input + copy IconButton) */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="fw-invite-code"
                    className="block font-fw-sans text-eyebrow font-medium uppercase tracking-[0.08em] text-text-tertiary"
                  >
                    Invite code
                  </label>
                  <Input
                    id="fw-invite-code"
                    readOnly
                    value={inviteCode}
                    aria-label="Team invite code"
                    onFocus={(e) => e.currentTarget.select()}
                    className="font-fw-mono text-h3 tracking-[0.18em] text-text-primary"
                    trailing={
                      <IconButton
                        variant="ghost"
                        size="sm"
                        aria-label={
                          copiedField === 'code'
                            ? 'Invite code copied'
                            : 'Copy invite code'
                        }
                        onClick={() => void copyValue(inviteCode, 'code')}
                      >
                        {copiedField === 'code' ? (
                          <IconCheck size={16} />
                        ) : (
                          <IconCopy size={16} />
                        )}
                      </IconButton>
                    }
                  />
                </div>

                {/* Invite link (read-only Input + copy IconButton) */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="fw-invite-link"
                    className="block font-fw-sans text-eyebrow font-medium uppercase tracking-[0.08em] text-text-tertiary"
                  >
                    Invite link
                  </label>
                  <Input
                    id="fw-invite-link"
                    readOnly
                    value={inviteLink}
                    aria-label="Team invite link"
                    onFocus={(e) => e.currentTarget.select()}
                    leading={<IconLink size={16} />}
                    className="font-fw-mono text-body-sm text-text-secondary"
                    trailing={
                      <IconButton
                        variant="ghost"
                        size="sm"
                        aria-label={
                          copiedField === 'link'
                            ? 'Invite link copied'
                            : 'Copy invite link'
                        }
                        onClick={() => void copyValue(inviteLink, 'link')}
                      >
                        {copiedField === 'link' ? (
                          <IconCheck size={16} />
                        ) : (
                          <IconCopy size={16} />
                        )}
                      </IconButton>
                    }
                  />
                </div>

                {/* Primary copy CTA — copies the full shareable link. */}
                <Button
                  fullWidth
                  variant={copiedField === 'link' ? 'secondary' : 'primary'}
                  leftIcon={
                    copiedField === 'link' ? (
                      <IconCheck size={18} />
                    ) : (
                      <IconCopy size={18} />
                    )
                  }
                  onClick={() => void copyValue(inviteLink, 'link')}
                >
                  {copiedField === 'link'
                    ? 'Copied to clipboard'
                    : 'Copy invite link'}
                </Button>

                {/* How it works — three-step explainer on the Fairway stepper. */}
                <div className="space-y-2 rounded-card bg-surface-sunken p-4">
                  <p className="flex items-center gap-2 font-fw-display text-eyebrow font-medium uppercase tracking-[0.08em] text-text-tertiary">
                    <IconUsers size={14} />
                    How it works
                  </p>
                  <OnboardingSteps label="How the team invite works">
                    <OnboardingStep
                      index={1}
                      title="Share the link or code"
                      description="Send the invite link, or have players enter the code when they sign up."
                    />
                    <OnboardingStep
                      index={2}
                      title="They create an account or log in"
                      description="The code ties their new (or existing) account to your team."
                    />
                    <OnboardingStep
                      index={3}
                      title="They land on your roster"
                      description="Once joined, players appear here automatically — no manual add."
                    />
                  </OnboardingSteps>
                </div>
              </>
            ) : null}
          </div>
        </ModalShell.Body>

        <ModalShell.Footer>
          <ModalShell.Close asChild>
            <Button variant="ghost">Done</Button>
          </ModalShell.Close>
        </ModalShell.Footer>
      </ModalShell>
    </>
  );
}
