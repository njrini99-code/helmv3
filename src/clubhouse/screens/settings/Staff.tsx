'use client';

import { Copy, Link2, Share2, UserMinus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { InlineNotice } from '../../ui/Notices';
import { Segmented } from '../../ui/Segmented';
import { DECLINE_NOTE, distinctStaffTitle, pendingCoachName, staffInviteNote, staffRoleLabel, STAFF_ROLE_HELP, STAFF_ROLE_OPTIONS, type ChPendingCoach, type ChSettingsWrites } from './model';
import { useCoachingStaff, useStaffInvite } from './hooks';
import { Card, Row, useWarnOnOpen } from './parts';

/**
 * The coaching staff on Team (coach): who is on it, the assistants waiting to be approved, and invites. The reads and
 * writes are the ones Fairway's Team page uses, and the server decides who may do what, so an assistant who tries is
 * told no. Each card appears only when it has something to show (a failed read is not "no staff").
 */
export function StaffCards({ coachId, writes }: { coachId: string | null; writes: ChSettingsWrites }) {
  const staff = useCoachingStaff(writes.staff, coachId);
  const invite = useStaffInvite(writes.staff);
  const { members, requests, requestsFailed } = staff;
  const deciding = staff.approve.pending || staff.decline.pending;
  // Decline sits beside Approve, so it asks first (CH-8511); Approve does not.
  const [declining, setDeclining] = useState<ChPendingCoach | null>(null);
  useWarnOnOpen(!!declining);
  return (
    <>
      {members && members.length > 0 && (
        <Card id="set-staff" title="Coaching staff" description="Everyone with coaching access to this team.">
          {members.map((m) => {
            const label = staffRoleLabel(m.role);
            return (
              <Row key={m.coachId} label={m.fullName?.trim() || '—'} help={distinctStaffTitle(m.title, label)}>
                <Badge tone={m.role === 'head_coach' ? 'accent' : 'neutral'}>{label}</Badge>
              </Row>
            );
          })}
        </Card>
      )}
      {requestsFailed ? (
        <Card id="set-requests" title="Assistant coach requests">
          <InlineNotice code="CH-8213" title="Requests didn’t load." body="Nothing was changed. Try again." onRetry={staff.retry} />
        </Card>
      ) : (
        requests.length > 0 && (
          <Card
            id="set-requests"
            title="Assistant coach requests"
            description="These people signed up with your program and chose assistant coach. They can see nothing until you approve them."
            aside={<span className="ch-set-count ch-num">{requests.length}</span>}
          >
            {requests.map((c) => (
              <Row key={c.coachId} label={pendingCoachName(c)} help={c.fullName?.trim() ? c.email : null}>
                <Button size="sm" variant="secondary" busy={staff.decline.pending && staff.busyId === c.coachId} disabled={deciding} onClick={() => setDeclining(c)}>
                  {staff.decline.pending && staff.busyId === c.coachId ? 'Declining…' : 'Decline'}
                </Button>
                <Button size="sm" variant="primary" busy={staff.approve.pending && staff.busyId === c.coachId} disabled={deciding} onClick={() => void staff.approve.run(c)}>
                  {staff.approve.pending && staff.busyId === c.coachId ? 'Approving…' : 'Approve'}
                </Button>
              </Row>
            ))}
          </Card>
        )
      )}
      <Modal
        open={!!declining}
        code="CH-8511"
        onClose={() => setDeclining(null)}
        icon={UserMinus}
        title={declining ? `Decline ${pendingCoachName(declining)}?` : 'Decline this request?'}
        description={DECLINE_NOTE}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeclining(null)}>
              Keep request
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const c = declining;
                setDeclining(null);
                if (c) void staff.decline.run(c);
              }}
            >
              Decline
            </Button>
          </>
        }
      />
      {!staff.isAssistant && (
        <Card id="set-staffinv" title="Staff invitations" description="Add an assistant coach or a program admin. They sign up with the code or the link.">
          <Row label="Role" help={STAFF_ROLE_HELP[invite.role]}>
            <Segmented label="Staff role" size="sm" value={invite.role} options={STAFF_ROLE_OPTIONS} onChange={invite.setRole} />
          </Row>
          <Row label="New invite">
            <Button size="sm" variant="secondary" leftIcon={UserPlus} busy={invite.create.pending} onClick={() => void invite.create.run(invite.role)}>
              {invite.create.pending ? 'Making…' : 'Create invite'}
            </Button>
          </Row>
          {invite.made && (
            <>
              <Row label="Staff code" help={staffInviteNote(invite.made)}>
                {invite.made.code ? (
                  <b className="ch-set-code ch-num" aria-live="polite">
                    {invite.made.code}
                  </b>
                ) : (
                  <span className="ch-set-value">No code this time; use the link</span>
                )}
              </Row>
              <div className="ch-set-acts">
                {invite.made.code && (
                  <Button size="sm" leftIcon={Copy} onClick={() => void invite.copy('code')}>
                    Copy staff code
                  </Button>
                )}
                <Button size="sm" leftIcon={Link2} onClick={() => void invite.copy('link')}>
                  Copy staff invite link
                </Button>
                {invite.canShare && (
                  <Button size="sm" leftIcon={Share2} onClick={() => void invite.share()}>
                    Share
                  </Button>
                )}
              </div>
            </>
          )}
        </Card>
      )}
    </>
  );
}
