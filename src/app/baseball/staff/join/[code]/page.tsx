// =============================================================================
// src/app/baseball/staff/join/[code]/page.tsx
//
// Wave 11 / packet: decision-room
//
// Staff invitation ACCEPT flow. The [code] segment is the invitation token.
//
// SECURITY — everything is validated server-side; the client is never trusted:
//   - unauthenticated -> redirect to login with a returnTo back to this link
//   - the token is looked up under RLS (invitee_select only returns pending,
//     unexpired invites addressed to the signed-in user's email)
//   - status / expiry / email-match are all re-checked here AND again in the
//     acceptStaffInvite action before any staff row is written
//   - capabilities/role are read from the stored invitation, never from the URL
// =============================================================================

import { redirect } from 'next/navigation';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';
import { IconX, IconWarning, IconArrowRight, IconShieldCheck } from '@/components/icons';
import { StaffJoinClient } from './staff-join-client';
import { PaperCard } from '@/components/baseball/living-annual';

export const metadata = {
  title: 'Join Staff | Helm Baseball',
  description: 'Accept a coaching staff invitation.',
};

interface PageProps {
  params: Promise<{ code: string }>;
}

// Small presentational shell so every terminal state looks consistent.
function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-auth-baseball p-4 sm:p-6">
      <PaperCard className="w-full max-w-md rounded-2xl p-6 sm:p-8">
        {children}
      </PaperCard>
    </div>
  );
}

export default async function StaffJoinPage({ params }: PageProps) {
  const { code } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/baseball/login?returnTo=/baseball/staff/join/${code}`);
  }

  // Look up the invitation by token. RLS scopes this to pending/unexpired
  // invites addressed to the signed-in user; we still re-check every field.
  const { data: invite } = await supabase.from('baseball_staff_invitations')
    .select(
      `id, team_id, email, role, status, expires_at,
       baseball_teams ( name, team_type, organizations ( name, location_city, location_state, logo_url ) )`,
    )
    .eq('token', code)
    .maybeSingle();

  // Invalid / not visible to this user.
  if (!invite) {
    return (
      <CenteredCard>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <IconX size={32} className="text-red-600" />
        </div>
        <h1 className="mb-2 text-center text-xl font-semibold text-warm-900">
          Invitation not found
        </h1>
        <p className="mb-6 text-center text-warm-600">
          This staff invitation is invalid, has expired, or was sent to a
          different email address than the one you&apos;re signed in with.
        </p>
        <div className="text-center">
          <Link
            href="/baseball/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-primary-700"
          >
            Go to dashboard
            <IconArrowRight size={18} />
          </Link>
        </div>
      </CenteredCard>
    );
  }

  const isExpired = invite.expires_at
    ? new Date(invite.expires_at) < new Date()
    : false;
  const notPending = invite.status !== 'pending';

  if (isExpired || notPending) {
    const accepted = invite.status === 'accepted';
    return (
      <CenteredCard>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
          <IconWarning size={32} className="text-amber-600" />
        </div>
        <h1 className="mb-2 text-center text-xl font-semibold text-warm-900">
          {accepted ? 'Already accepted' : isExpired ? 'Invitation expired' : 'Invitation inactive'}
        </h1>
        <p className="mb-6 text-center text-warm-600">
          {accepted
            ? 'This invitation has already been accepted. You should already have access.'
            : 'This staff invitation is no longer valid. Ask your head coach to send a new one.'}
        </p>
        <div className="text-center">
          <Link
            href="/baseball/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-primary-700"
          >
            Go to dashboard
            <IconArrowRight size={18} />
          </Link>
        </div>
      </CenteredCard>
    );
  }

  // Email must match the signed-in account.
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
        <p className="mb-6 text-center text-warm-600">
          This invitation was sent to{' '}
          <span className="font-medium">{invite.email}</span>. Sign in with that
          account to accept it.
        </p>
        <div className="text-center">
          <Link
            href={`/baseball/login?returnTo=/baseball/staff/join/${code}`}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-primary-700"
          >
            Switch account
            <IconArrowRight size={18} />
          </Link>
        </div>
      </CenteredCard>
    );
  }

  const team = (invite.baseball_teams ?? {}) as {
    name?: string;
    organizations?: {
      name?: string;
      location_city?: string | null;
      location_state?: string | null;
    } | null;
  };
  const org = team.organizations ?? null;
  const teamName = team.name ?? 'a baseball team';
  const orgLine = org
    ? [org.name, org.location_city, org.location_state].filter(Boolean).join(' · ')
    : null;

  return (
    <CenteredCard>
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
        <IconShieldCheck size={32} className="text-primary-600" />
      </div>
      <h1 className="mb-1 text-center text-xl font-semibold text-warm-900">
        Join {teamName} staff
      </h1>
      <p className="mb-1 text-center text-warm-600">
        You&apos;ve been invited to coach with this team
        {invite.role ? (
          <>
            {' '}
            as <span className="font-medium">{invite.role}</span>
          </>
        ) : null}
        .
      </p>
      {orgLine && (
        <p className="mb-6 text-center text-sm text-warm-400">{orgLine}</p>
      )}

      <StaffJoinClient token={code} teamName={teamName} />
    </CenteredCard>
  );
}
