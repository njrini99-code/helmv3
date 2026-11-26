'use client';

import { useState } from 'react';
import { DECLINE_NOTE, distinctStaffTitle, pendingCoachName, staffInviteNote, staffRoleLabel, STAFF_ROLE_HELP, STAFF_ROLE_OPTIONS, type ChPendingCoach, type ChSettingsWrites } from '../model';
import { useCoachingStaff, useStaffInvite } from '../hooks';
import { ActionSheet } from './sheets';
import { ActionRow, Group, PickerRow } from './ui';

/**
 * The coaching staff on the phone's Team (coach): the staff, the assistants waiting to be approved, and invites, over
 * the same reads and writes as desktop (screens/settings/Staff.tsx). Each group appears only when it has something to
 * show; the server decides who may do what, so an assistant who tries is told no.
 */
export function StaffPhone({ coachId, writes }: { coachId: string | null; writes: ChSettingsWrites }) {
  const staff = useCoachingStaff(writes.staff, coachId);
  const invite = useStaffInvite(writes.staff);
  const { members, requests, requestsFailed } = staff;
  const deciding = staff.approve.pending || staff.decline.pending;
  // Decline sits beside Approve, so it asks first (CH-8511); the action sheet warns as it opens.
  const [declining, setDeclining] = useState<ChPendingCoach | null>(null);
  return (
    <>
      {members && members.length > 0 && (
        <Group title="Coaching staff" note="Everyone with coaching access to this team.">
          {members.map((m) => {
            const label = staffRoleLabel(m.role);
            const title = distinctStaffTitle(m.title, label);
            return (
              <div key={m.coachId} className={'ch-setm-row is-info' + (title ? ' has-help' : '')}>
                <span className="ch-setm-row__l">{m.fullName?.trim() || '—'}</span>
                <span className="ch-setm-row__v">{label}</span>
                {title && <span className="ch-setm-help">{title}</span>}
              </div>
            );
          })}
        </Group>
      )}
      {requestsFailed ? (
        <Group title="Assistant coach requests" code="CH-8213" note="Requests didn’t load. Nothing was changed.">
          <ActionRow data-ctl="CTL-P008-078" label="Try again" onClick={staff.retry} />
        </Group>
      ) : (
        requests.length > 0 && (
          <Group title={`Assistant coach requests · ${requests.length}`} note="These people signed up with your program and chose assistant coach. They can see nothing until you approve them.">
            {requests.map((c) => (
              <div key={c.coachId} className={'ch-setm-row is-info' + (c.fullName?.trim() && c.email ? ' has-help' : '')}>
                <span className="ch-setm-row__l">{pendingCoachName(c)}</span>
                <button data-ctl="CTL-P008-079" type="button" className="ch-setm-link is-quiet" disabled={deciding} onClick={() => setDeclining(c)}>
                  {staff.decline.pending && staff.busyId === c.coachId ? 'Declining…' : 'Decline'}
                </button>
                <button data-ctl="CTL-P008-080" type="button" className="ch-setm-pill" disabled={deciding} onClick={() => void staff.approve.run(c)}>
                  {staff.approve.pending && staff.busyId === c.coachId ? 'Approving…' : 'Approve'}
                </button>
                {c.fullName?.trim() && c.email && <span className="ch-setm-help">{c.email}</span>}
              </div>
            ))}
          </Group>
        )
      )}
      <ActionSheet
        open={!!declining}
        onClose={() => setDeclining(null)}
        code="CH-8511"
        title={declining ? `Decline ${pendingCoachName(declining)}?` : 'Decline this request?'}
        message={DECLINE_NOTE}
        cancelLabel="Keep request"
        actions={[
          {
            label: 'Decline',
            onClick: () => {
              const c = declining;
              setDeclining(null);
              if (c) void staff.decline.run(c);
            },
          },
        ]}
      />
      {!staff.isAssistant && (
        <Group title="Staff invitations" note={invite.made ? staffInviteNote(invite.made) : STAFF_ROLE_HELP[invite.role]}>
          <PickerRow label="Staff role" value={invite.role} options={STAFF_ROLE_OPTIONS} onPick={invite.setRole} />
          <ActionRow data-ctl="CTL-P008-081" label={invite.create.pending ? 'Making…' : 'Create invite'} disabled={invite.create.pending} onClick={() => void invite.create.run(invite.role)} />
          {invite.made && (
            <div className="ch-setm-invite">
              <div className="ch-setm-invite__top">
                <span className="ch-setm-invite__c">
                  <span>Staff code</span>
                  <b className="ch-num" aria-live="polite">
                    {invite.made.code ?? 'Use the link'}
                  </b>
                </span>
                {/* Where the device has no share sheet, Share copies the invite link instead. */}
                <button data-ctl="CTL-P008-082" type="button" className="ch-setm-pill" onClick={() => void (invite.canShare ? invite.share() : invite.copy('link'))}>
                  Share
                </button>
              </div>
              <div className="ch-setm-invite__links">
                {invite.made.code && (
                  <button data-ctl="CTL-P008-083" type="button" className="ch-setm-link" onClick={() => void invite.copy('code')}>
                    Copy code
                  </button>
                )}
                <button data-ctl="CTL-P008-084" type="button" className="ch-setm-link" onClick={() => void invite.copy('link')}>
                  Copy link
                </button>
              </div>
            </div>
          )}
        </Group>
      )}
    </>
  );
}
