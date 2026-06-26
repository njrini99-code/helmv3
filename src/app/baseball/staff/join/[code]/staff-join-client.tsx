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

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import { IconCheck, IconArrowRight } from '@/components/icons';
import { acceptStaffInvite } from '@/app/baseball/actions/staff';

interface StaffJoinClientProps {
  token: string;
  teamName: string;
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
        router.push('/baseball/dashboard/command-center');
        router.refresh();
      } catch {
        showToast('Something went wrong. Please try again.', 'error');
      }
    });
  };

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
