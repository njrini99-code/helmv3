'use client';

// =============================================================================
// src/app/lifting/join/[token]/join-client.tsx
//
// W2-A — Helm Lifting Lab: invite accept confirm button.
//
// The server page (page.tsx) has already validated the token, status, expiry,
// and email match.  This component drives the final "Accept" step:
//   1. Calls acceptLiftingInvite(token) — a server action that re-validates
//      everything and delegates to the helm_lifting_accept_invite DEFINER RPC.
//   2. Shows a success state, then redirects to /lifting/dashboard.
//
// Nothing here is trusted to grant permissions — all authority lives in the
// server action + RPC.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import { IconCheck } from '@/components/icons';
import { acceptLiftingInvite } from '@/app/lifting/actions/invites';

interface JoinClientProps {
  token: string;
  orgName: string;
}

export function JoinClient({ token, orgName }: JoinClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [accepted, setAccepted] = useState(false);

  const accept = () => {
    startTransition(async () => {
      try {
        const res = await acceptLiftingInvite(token);

        if (!res.success) {
          showToast(res.error ?? 'Could not accept invitation', 'error');
          return;
        }

        setAccepted(true);
        showToast(`Welcome to ${orgName}'s Lifting Lab!`, 'success');

        // Small delay so the success toast is visible before navigation.
        await new Promise<void>((resolve) => setTimeout(resolve, 800));
        router.push('/lifting/dashboard');
        router.refresh();
      } catch {
        showToast('Something went wrong. Please try again.', 'error');
      }
    });
  };

  return (
    <Button
      variant="primary"
      size="lg"
      className="w-full"
      isLoading={isPending}
      disabled={accepted || isPending}
      leftIcon={<IconCheck size={18} />}
      onClick={accept}
    >
      {accepted ? 'Accepted — redirecting…' : 'Accept Invitation'}
    </Button>
  );
}
