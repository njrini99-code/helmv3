'use client';

import { FileText, FolderClosed, Target } from 'lucide-react';
import type { ActionProposal } from '@/lib/coachhelm/v3/chat/action-types';
import { Avatar } from '../../../../ui/Avatar';
import { Icon } from '../../../../ui/Icon';

/** Only the player and focus the proposal actually names. Existing focus areas are never made up for the preview. */
export function FocusHome({ proposal, landed, moving }: { proposal: ActionProposal; landed: boolean; moving: boolean }) {
  const player = proposal.affects.find((a) => a.kind === 'player');
  if (!player) return null;
  return <div className="ch-ak-focus-home ch-ak-hs" data-moving={moving || undefined}>
    <div className="hs-h"><span className="ch-ak-focus-avatar"><Avatar name={player.label} size="sm" /></span><b>{player.label}</b><small>Focus areas</small></div>
    <div className={'hsr nw ch-ak-focus-target' + (landed ? ' is-in' : '')}><span className="ri"><Icon icon={Target} size={15} /></span><span className="rx"><b>{proposal.summary}</b><small>{landed ? 'Assigned focus' : 'Draft focus'}</small></span></div>
  </div>;
}

/** The copies are a preview of delivery, not read receipts. Delivery checks come from the completed ledger receipt. */
export function PublishDraft({ proposal, landed }: { proposal: ActionProposal; landed: boolean }) {
  if (!proposal.publish) return null;
  return <div className="ch-ak-publish-draft" data-landed={landed || undefined}>
    <div className="ch-ak-publish-document"><span className="ch-ak-publish-paper" aria-hidden="true"><Icon icon={FileText} size={24} /></span><span><b>{proposal.summary}</b><small>One copy per recipient</small></span></div>
    <div className="ch-ak-publish-destinations" aria-label="Publish destinations">
      <div className="ch-ak-publish-people">{proposal.publish.coins.map((person) => <span key={person.name} className="ch-ak-publish-person" title={person.name} data-ch-publish-slot=""><Avatar name={person.name} size="xs" /><span className="ch-ak-publish-copy" aria-hidden="true"><Icon icon={FileText} size={11} /></span></span>)}{!!proposal.publish.coinsMore && <span className="ch-num">+{proposal.publish.coinsMore}</span>}</div>
      <span className="ch-ak-publish-folder" data-ch-publish-slot=""><Icon icon={FolderClosed} size={20} /><span>{proposal.publish.folder}</span></span>
    </div>
  </div>;
}
