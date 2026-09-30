'use client';

import { Clock, LogOut } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { golfDetailsProblem, type ChGolfDetails, type ChSettingsData, type ChSettingsWrites } from './model';
import { Card, Field, ReadFailed, Row, SaveBar, useDraft, useReportDirty, useSaveAction } from './parts';

export function GolfSection({ data, writes }: { data: ChSettingsData; writes: ChSettingsWrites }) {
  return (
    <>
      {data.golf?.error ? <ReadFailed what="Your golf details" code="CH-8209" onRetry={writes.refresh} /> : data.golf && <DetailsCard details={data.golf.value} writes={writes} />}
      {data.membership?.error ? <ReadFailed what="Your team membership" code="CH-8210" onRetry={writes.refresh} /> : data.membership && <MembershipCard m={data.membership.value} writes={writes} />}
    </>
  );
}

function DetailsCard({ details, writes }: { details: ChGolfDetails; writes: ChSettingsWrites }) {
  const f = useDraft(details);
  useReportDirty('golf', f.dirty);
  const save = useSaveAction('settings.saveGolf', writes.saveGolf, { done: 'Golf details saved', failed: "Couldn't save your golf details", code: 'CH-8016' }, (_r, saved) => f.commit(saved));
  const set = (k: keyof ChGolfDetails) => (e: React.ChangeEvent<HTMLInputElement>) => f.setDraft((d) => ({ ...d, [k]: e.target.value }));
  return (
    <Card
      id="set-golf"
      title="Golf details"
      description="Your coaches see these on the roster."
      foot={
        <SaveBar
          dirty={f.dirty}
          pending={save.pending}
          invalid={golfDetailsProblem(f.draft)}
          savedAt={f.savedAt}
          onReset={f.reset}
          onSave={() => void save.run(f.draft)}
        />
      }
    >
      <div className="ch-set-grid">
        <Field id="set-hcp-v" label="Handicap" inputMode="decimal" placeholder="5.2" value={f.draft.handicap} onChange={set('handicap')} />
        <Field id="set-hcp-i" label="Handicap index" inputMode="decimal" placeholder="4.8" value={f.draft.handicapIndex} onChange={set('handicapIndex')} />
        <Field id="set-grad" label="Graduation year" inputMode="numeric" placeholder="2028" value={f.draft.graduationYear} onChange={set('graduationYear')} />
        <Field id="set-phone" label="Phone" type="tel" autoComplete="tel" value={f.draft.phone} onChange={set('phone')} />
        <Field id="set-home" label="Hometown" autoComplete="address-level2" value={f.draft.hometown} onChange={set('hometown')} />
        <Field id="set-state" label="State" maxLength={2} placeholder="NC" value={f.draft.state} onChange={(e) => f.setDraft((d) => ({ ...d, state: e.target.value.toUpperCase() }))} />
      </div>
    </Card>
  );
}

type Membership = NonNullable<ChSettingsData['membership']> extends infer S ? (S extends { value: infer V } ? NonNullable<V> : never) : never;

function MembershipCard({ m, writes }: { m: Membership; writes: ChSettingsWrites }) {
  const [requests, setRequests] = useState(m.requests);
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [leaving, setLeaving] = useState(false);
  useReportDirty('join', code.trim() !== '');
  const leave = useSaveAction('settings.leaveTeam', writes.leaveTeam, { done: 'You left the team', failed: "Couldn't leave the team", code: 'CH-8017' }, () => {
    setLeaving(false);
    writes.refresh();
  });
  const join = useSaveAction('settings.requestJoin', writes.requestJoin, { done: 'Request sent to the coaches', failed: "Couldn't send your request", hint: 'Check the code with your coach.', code: 'CH-8018' }, () => {
    setCode('');
    setNote('');
    writes.refresh();
  });
  const cancel = useSaveAction('settings.cancelRequest', writes.cancelRequest, { done: 'Request cancelled', failed: "Couldn't cancel the request", code: 'CH-8019' }, (_r, id) => {
    setRequests((x) => x.filter((y) => y.id !== id));
  });

  if (m.team) {
    return (
      <Card id="set-membership" title="Team" description="The team you play for on GolfHelm.">
        <Row label={m.team.name} help={m.team.orgName ?? undefined}>
          <Button size="sm" variant="ghost" leftIcon={LogOut} onClick={() => setLeaving(true)}>
            Leave team
          </Button>
        </Row>
        <Modal
          open={leaving}
          code="CH-8502"
          onClose={() => !leave.pending && setLeaving(false)}
          icon={LogOut}
          title={`Leave ${m.team.name}?`}
          description="You come off the roster right away. To come back, you'll need the invite code and your coach's approval."
          footer={
            <>
              <Button variant="secondary" disabled={leave.pending} onClick={() => setLeaving(false)}>
                Stay on the team
              </Button>
              <Button
                variant="danger"
                disabled={leave.pending}
                onClick={() => void leave.run()}
              >
                {leave.pending ? 'Leaving…' : 'Leave team'}
              </Button>
            </>
          }
        />
      </Card>
    );
  }

  return (
    <Card id="set-membership" code="CH-8302" title="Join a team" description="Ask your coach for the team's invite code. They approve your request from their roster.">
      {requests.length > 0 && (
        <div className="ch-set-requests">
          {requests.map((r) => (
            <div key={r.id} className="ch-set-request" data-ch-code="CH-8303">
              <Icon icon={Clock} size={15} />
              <span>
                <b>Waiting on {r.teamName}</b>
                <span>Sent {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={cancel.pending}
                onClick={() => void cancel.run(r.id)}
              >
                Cancel
              </Button>
            </div>
          ))}
        </div>
      )}
      {requests.length === 0 && (
        <form
          className="ch-set-grid"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (!code.trim()) return;
            await join.run(code, note);
          }}
        >
          <Field id="set-join-code" label="Invite code" autoComplete="off" maxLength={12} placeholder="K7M2Q9XA" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Field id="set-join-note" label="Note to the coaches" help="Optional." maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="ch-set-span2">
            <Button type="submit" variant="primary" disabled={!code.trim() || join.pending}>
              {join.pending ? 'Sending…' : 'Ask to join'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
