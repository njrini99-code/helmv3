'use client';

/**
 * Direction A · the bag tag.
 *
 * The identity header of the settings index, drawn like the tag on a golf bag:
 * who you are and which team, plus the one number that identifies you in the
 * game.
 *
 *   Coach  — the team's invite code (golf_teams.join_code) on a perforated
 *            tear-off stub, with a copy action, because sharing it is one of
 *            the three things coaches come to settings for. Whether the stub
 *            exists is known at first paint (an active team), so it renders
 *            straight away with a placeholder and never shifts the page.
 *   Player — the handicap index (golf_players.handicap_index), only when set,
 *            as a readout on the right of the identity row. It is only known
 *            once the profile loads; inside the avatar-height row it appears
 *            without moving anything below it. No index, no readout: a tag
 *            that says "—" is worse than a tag that says nothing.
 *
 * Composed from Surface + Avatar; no new kit piece.
 */

import { useEffect, useRef, useState } from 'react';
import { Surface } from '@/components/fairway/surfaces';
import { Avatar } from '@/components/fairway/controls/avatar';
import { IconButton } from '@/components/fairway/controls/button';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { IconCheck, IconCopy } from '@/components/icons';
import { logError } from '@/lib/error-logging';
import { InlineSkeleton } from './inline-skeleton';

export type InviteStub = { state: 'loading' } | { state: 'error' } | { state: 'ok'; code: string };

export interface BagTagProps {
  name: string;
  avatarUrl?: string | null;
  role: 'coach' | 'player';
  teamName?: string | null;
  /** Coach with an active team. */
  invite?: InviteStub;
  /** Player, formatted, only when an index is set. */
  handicapIndex?: string | null;
}

export function BagTag({ name, avatarUrl, role, teamName, invite, handicapIndex }: BagTagProps) {
  return (
    <Surface elevation="border" padding="none" className="overflow-hidden">
      <section aria-label="Your profile">
        <div className="flex items-center gap-4 p-5">
          <Avatar src={avatarUrl} name={name} size="xl" tone="accent" decorative />
          <div className="min-w-0 flex-1">
            <p className="truncate font-fw-display text-h3 text-text-primary">{name}</p>
            <p className="mt-0.5 truncate font-fw-sans text-body-sm text-text-secondary">
              {role === 'coach' ? 'Coach' : 'Player'}
              {teamName ? (
                <>
                  <span aria-hidden> · </span>
                  <span className="sr-only">, </span>
                  {teamName}
                </>
              ) : null}
            </p>
          </div>
          {handicapIndex ? (
            <div className="shrink-0 text-right">
              <p className="font-fw-sans text-h3 tabular-nums text-text-primary">{handicapIndex}</p>
              <p className="font-fw-sans text-caption text-text-tertiary">Index</p>
            </div>
          ) : null}
        </div>
        {invite ? <InviteStubStrip invite={invite} /> : null}
      </section>
    </Surface>
  );
}

/** The tear-off strip under the perforation: a small label over the code. */
function InviteStubStrip({ invite }: { invite: InviteStub }) {
  return (
    <div className="flex min-h-[64px] items-center gap-3 border-t border-dashed border-border-strong bg-surface-tint py-2.5 pl-5 pr-3">
      <div className="min-w-0 flex-1">
        <p className="font-fw-sans text-caption text-text-tertiary">Invite code</p>
        {invite.state === 'loading' ? (
          <p className="flex h-[26px] items-center">
            <InlineSkeleton className="h-4 w-24" />
          </p>
        ) : invite.state === 'error' ? (
          <p className="flex h-[26px] items-center font-fw-sans text-body-sm text-text-tertiary">
            Couldn’t load
          </p>
        ) : (
          <p className="truncate font-fw-sans text-body-lg font-semibold tabular-nums tracking-[0.12em] text-text-primary">
            {invite.code}
          </p>
        )}
      </div>
      {invite.state === 'ok' ? <CopyInviteLink code={invite.code} /> : null}
    </div>
  );
}

/** Copies the same /golf/join/<code> link InviteSettingsPanel copies. */
function CopyInviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    },
    [],
  );

  const copy = async () => {
    const url = `${window.location.origin}/golf/join/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      fairwayToast.success('Invite link copied');
      if (resetRef.current !== null) window.clearTimeout(resetRef.current);
      resetRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      fairwayToast.error('Failed to copy');
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'SettingsDirectionA', action: 'copy-invite-link', sport: 'golf' },
        'medium',
      );
    }
  };

  return (
    <IconButton
      variant="ghost"
      size="md"
      aria-label={copied ? 'Invite link copied' : 'Copy invite link'}
      onClick={() => void copy()}
    >
      {copied ? <IconCheck aria-hidden /> : <IconCopy aria-hidden />}
    </IconButton>
  );
}
