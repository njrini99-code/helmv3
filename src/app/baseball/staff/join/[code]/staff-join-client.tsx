'use client';

// =============================================================================
// src/app/baseball/staff/join/[code]/staff-join-client.tsx
//
// Wave 11 / packet: decision-room
//
// Client accept button for a staff invitation. The server page has already
// validated the token, expiry, status and email-match; this just drives the
// acceptStaffInvite action (which re-validates everything) and routes on
// success. The capability set is applied SERVER-SIDE from the stored invite —
// nothing here is trusted to authorize anything.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { m, useReducedMotion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import { IconCheck, IconArrowRight } from '@/components/icons';
import { acceptStaffInvite } from '@/app/baseball/actions/staff';
import { HairlineRule, stampPress, inkBleed } from '@/components/baseball/living-annual';

interface StaffJoinClientProps {
  token: string;
  teamName: string;
}

// JOIN SEAL — the ceremony object (island-join-ceremony packet). Same
// team-green stamp-press language as the player join-team ceremony
// (`join-team-client.tsx`'s `JoinSeal`) — `--team-ink` embossed seal, kit
// `stampPress` + `inkBleed` motion, honors `prefers-reduced-motion`.
// `<CommitSeal>` stays hardcoded oxblood for recruiting COMMITTED/OFFER
// moments, so this composes the same kit primitives locally instead.
function JoinSeal() {
  const reduced = useReducedMotion() ?? false;
  return (
    <div className="relative inline-grid place-items-center">
      <m.span
        aria-hidden
        initial="hidden"
        animate="visible"
        variants={inkBleed(reduced)}
        className="pointer-events-none absolute h-20 w-20 rounded-full blur-md"
        style={{ background: 'var(--team-ink)' }}
      />
      <m.div
        initial="hidden"
        animate="visible"
        variants={stampPress(reduced)}
        style={{ rotate: -1.5 }}
        className="relative inline-grid h-20 w-20 place-items-center rounded-full text-[color:var(--paper)] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_-1px_2px_rgba(255,255,255,0.15),0_2px_6px_rgba(0,0,0,0.2)]"
      >
        <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: 'var(--team-ink)' }} />
        <span aria-hidden className="absolute inset-[12%] rounded-full border border-[rgba(255,255,255,0.32)]" />
        <IconCheck size={28} className="relative" aria-hidden />
      </m.div>
    </div>
  );
}

export function StaffJoinClient({ token, teamName }: StaffJoinClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [accepted, setAccepted] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);

  const accept = () => {
    startTransition(async () => {
      try {
        const res = await acceptStaffInvite(token);
        if (!res.success) {
          if (res.needsCoachProfile) {
            setNeedsProfile(true);
            showToast(res.error ?? 'Finish your coach profile first', 'error');
            return;
          }
          showToast(res.error ?? 'Could not accept invitation', 'error');
          return;
        }
        setAccepted(true);
        showToast(`Welcome to ${teamName}`, 'success');
        // Hold the stamp ceremony on screen briefly before redirecting —
        // same beat as the player join flow's ceremony pause.
        setTimeout(() => {
          router.push('/baseball/dashboard/command-center');
          router.refresh();
        }, 900);
      } catch {
        showToast('Something went wrong. Please try again.', 'error');
      }
    });
  };

  if (accepted) {
    return (
      <div className="space-y-4 py-2 text-center">
        <div className="flex justify-center">
          <JoinSeal />
        </div>
        <div className="flex justify-center">
          <HairlineRule ink="team" className="w-14" />
        </div>
        <p className="text-sm font-medium text-warm-900">Joined {teamName}</p>
      </div>
    );
  }

  if (needsProfile) {
    return (
      <div className="space-y-3">
        <p className="text-center text-sm text-warm-600">
          Finish setting up your coach profile, then come back to this link to
          accept.
        </p>
        <Link
          href="/baseball/coach-onboarding"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-primary-700"
        >
          Set up profile
          <IconArrowRight size={18} />
        </Link>
      </div>
    );
  }

  return (
    <Button
      variant="primary"
      size="lg"
      className="w-full"
      isLoading={isPending}
      disabled={accepted}
      leftIcon={<IconCheck size={18} />}
      onClick={accept}
    >
      {accepted ? 'Joined' : 'Accept invitation'}
    </Button>
  );
}
