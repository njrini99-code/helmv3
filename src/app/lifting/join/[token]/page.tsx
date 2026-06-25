// =============================================================================
// src/app/lifting/join/[token]/page.tsx
//
// W2-A — Helm Lifting Lab: invite accept flow.
//
// Server component that validates the invitation token under RLS and renders
// the appropriate terminal state.  The client confirm button lives in
// join-client.tsx (acceptLiftingInvite action + redirect to /lifting/dashboard).
//
// SECURITY (matches blueprint §3.4 + baseball staff/join/[code]/page.tsx):
//   - Unauthenticated users are redirected to /lifting/login?returnTo=…
//   - Token looked up under RLS (invitee_select returns only pending,
//     unexpired invites scoped to the signed-in user's email)
//   - Status, expiry, and email match are re-validated server-side here AND
//     again inside acceptLiftingInvite / the SECURITY DEFINER RPC
//   - Nothing from the URL is trusted to authorize anything — all role/org
//     context comes from the stored invite row
// =============================================================================

import { redirect } from 'next/navigation';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import {
  IconX,
  IconWarning,
  IconArrowRight,
  IconShieldCheck,
  IconDumbbell,
} from '@/components/icons';
import { JoinClient } from './join-client';
import type { HelmLiftingCoachInviteRow } from '@/lib/types/helm-lifting';

export const metadata = {
  title: 'Join Lifting Lab | Helm Sports Labs',
  description: 'Accept a Helm Lifting Lab coaching invitation.',
};

interface PageProps {
  params: Promise<{ token: string }>;
}

// ─── Shared card shell ────────────────────────────────────────────────────────

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#F0FDF4] p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/30 bg-white/80 p-6 shadow-lg backdrop-blur-xl sm:p-8">
        {children}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LiftingJoinPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/lifting/login?returnTo=/lifting/join/${encodeURIComponent(token)}`);
  }

  // Look up the invitation by token.  RLS limits this to pending/unexpired
  // invites addressed to the signed-in user's email — we re-check every field.
  const { data: invite } = (await fromUntyped(supabase, 'helm_lifting_coach_invites')
    .select(
      `id, organization_id, email, role_title, status, expires_at,
       invited_by_sport`,
    )
    .eq('token', token)
    .maybeSingle()) as {
    data: Pick<
      HelmLiftingCoachInviteRow,
      | 'id'
      | 'organization_id'
      | 'email'
      | 'role_title'
      | 'status'
      | 'expires_at'
      | 'invited_by_sport'
    > | null;
  };

  // ── Invite not found / not visible ────────────────────────────────────────
  if (!invite) {
    return (
      <CenteredCard>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <IconX size={32} className="text-red-600" />
        </div>
        <h1 className="mb-2 text-center text-xl font-semibold text-warm-900">
          Invitation not found
        </h1>
        <p className="mb-6 text-center text-sm leading-relaxed text-warm-600">
          This Lifting Lab invitation is invalid, has expired, or was sent to a
          different email address than the one you&apos;re signed in with.
        </p>
        <div className="text-center">
          <Link
            href="/lifting/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-primary-700"
          >
            Go to dashboard
            <IconArrowRight size={18} />
          </Link>
        </div>
      </CenteredCard>
    );
  }

  // ── Status / expiry check ─────────────────────────────────────────────────
  const isExpired = invite.expires_at
    ? new Date(invite.expires_at) < new Date()
    : false;
  const notPending = invite.status !== 'pending';

  if (isExpired || notPending) {
    const alreadyAccepted = invite.status === 'accepted';
    return (
      <CenteredCard>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
          <IconWarning size={32} className="text-amber-600" />
        </div>
        <h1 className="mb-2 text-center text-xl font-semibold text-warm-900">
          {alreadyAccepted
            ? 'Already accepted'
            : isExpired
              ? 'Invitation expired'
              : 'Invitation inactive'}
        </h1>
        <p className="mb-6 text-center text-sm leading-relaxed text-warm-600">
          {alreadyAccepted
            ? 'This invitation has already been accepted. You should already have access to the Lifting Lab.'
            : 'This Lifting Lab invitation is no longer valid. Ask your head coach to send a new one.'}
        </p>
        <div className="text-center">
          <Link
            href={alreadyAccepted ? '/lifting/dashboard' : '/'}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-primary-700"
          >
            {alreadyAccepted ? 'Go to Lifting Lab' : 'Go home'}
            <IconArrowRight size={18} />
          </Link>
        </div>
      </CenteredCard>
    );
  }

  // ── Email match ───────────────────────────────────────────────────────────
  const userEmail = (user.email ?? '').trim().toLowerCase();
  if (userEmail !== String(invite.email).trim().toLowerCase()) {
    return (
      <CenteredCard>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
          <IconWarning size={32} className="text-amber-600" />
        </div>
        <h1 className="mb-2 text-center text-xl font-semibold text-warm-900">
          Wrong account
        </h1>
        <p className="mb-6 text-center text-sm leading-relaxed text-warm-600">
          This invitation was sent to{' '}
          <span className="font-medium">{invite.email}</span>. Sign in with that
          account to accept it.
        </p>
        <div className="text-center">
          <Link
            href={`/lifting/login?returnTo=/lifting/join/${token}`}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-primary-700"
          >
            Switch account
            <IconArrowRight size={18} />
          </Link>
        </div>
      </CenteredCard>
    );
  }

  // ── Resolve org name for display ──────────────────────────────────────────
  const { data: org } = await supabase
    .from('organizations')
    .select('name, location_city, location_state')
    .eq('id', invite.organization_id)
    .maybeSingle();

  const orgName = (org?.name as string | null) ?? 'your organization';
  const orgLine = org
    ? [org.name, org.location_city, org.location_state]
        .filter(Boolean)
        .join(' · ')
    : null;

  const sportLabel =
    invite.invited_by_sport === 'golf' ? 'Golf' : 'Baseball';

  // ── Happy path — invite is valid ──────────────────────────────────────────
  return (
    <CenteredCard>
      {/* Icon badge */}
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
        <IconShieldCheck size={32} className="text-primary-600" />
      </div>

      <h1 className="mb-1 text-center text-xl font-semibold text-warm-900">
        Join the Lifting Lab
      </h1>

      <p className="mb-1 text-center text-sm leading-relaxed text-warm-600">
        You&apos;ve been invited to join{' '}
        <span className="font-semibold text-warm-800">{orgName}</span>&apos;s
        Helm Lifting Lab
        {invite.role_title ? (
          <>
            {' '}
            as{' '}
            <span className="font-semibold text-warm-800">
              {invite.role_title}
            </span>
          </>
        ) : null}
        .
      </p>

      {orgLine && (
        <p className="mb-1 text-center text-xs text-warm-400">{orgLine}</p>
      )}

      <p className="mb-6 text-center text-xs text-warm-400">
        <span className="inline-flex items-center gap-1">
          <IconDumbbell size={12} />
          {sportLabel} program
        </span>
      </p>

      <JoinClient token={token} orgName={orgName} />
    </CenteredCard>
  );
}
