'use client';

import { useState } from 'react';
import { golfDetailsProblem, type ChGolfDetails, type ChMembership, type ChSettingsData, type ChSettingsWrites } from '../model';
import { SAVE_COPY, useMembership } from '../hooks';
import { ReadFailed, useSaveAction } from '../parts';
import { ActionSheet, FormSheet, useSheetDraft } from './sheets';
import { FieldRow, Group, NavRow, Problem } from './ui';

/** Golf profile on the phone (player): golf details in an edit sheet, and the team: leave it, or ask to join one. */
export function GolfPhone({ data, writes }: { data: ChSettingsData; writes: ChSettingsWrites }) {
  return (
    <>
      {data.golf?.error ? <ReadFailed what="Your golf details" code="CH-8209" onRetry={writes.refresh} /> : data.golf && <DetailsPhone details={data.golf.value} writes={writes} />}
      {data.membership?.error ? <ReadFailed what="Your team membership" code="CH-8210" onRetry={writes.refresh} /> : data.membership && <MembershipPhone m={data.membership.value} writes={writes} />}
    </>
  );
}

const FIELDS: Array<{ key: keyof ChGolfDetails; label: string }> = [
  { key: 'handicap', label: 'Handicap' },
  { key: 'handicapIndex', label: 'Handicap index' },
  { key: 'graduationYear', label: 'Graduation year' },
  { key: 'phone', label: 'Phone' },
  { key: 'hometown', label: 'Hometown' },
  { key: 'state', label: 'State' },
];

function DetailsPhone({ details, writes }: { details: ChGolfDetails; writes: ChSettingsWrites }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Group title="Golf details" note="Your coaches see these on the roster.">
        {FIELDS.map((f) => (
          <NavRow key={f.key} label={f.label} value={details[f.key] || 'Not set'} onClick={() => setEditing(true)} />
        ))}
      </Group>
      <GolfSheet open={editing} onClose={() => setEditing(false)} details={details} writes={writes} />
    </>
  );
}

/** Golf details in a full-height sheet: Save stays off until something changes (CH-8016, CH-8112 to CH-8115). */
function GolfSheet({ open, onClose, details, writes }: { open: boolean; onClose: () => void; details: ChGolfDetails; writes: ChSettingsWrites }) {
  const { draft, setDraft, dirty } = useSheetDraft(details, open);
  const save = useSaveAction('settings.saveGolf', writes.saveGolf, SAVE_COPY.golf, () => onClose());
  const set = (k: keyof ChGolfDetails) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const invalid = golfDetailsProblem(draft);
  return (
    <FormSheet
      open={open}
      onClose={onClose}
      full
      title="Golf details"
      actionLabel={save.pending ? 'Saving…' : 'Save'}
      busy={save.pending}
      dirty={dirty}
      actionDisabled={!dirty || !!invalid}
      onAction={() => void save.run(draft)}
      note="Your coaches see these on the roster."
    >
      <div className="ch-setm-card">
        <FieldRow id="set-hcp-v" label="Handicap" inline inputMode="decimal" placeholder="5.2" value={draft.handicap} onChange={set('handicap')} />
        <FieldRow id="set-hcp-i" label="Handicap index" inline inputMode="decimal" placeholder="4.8" value={draft.handicapIndex} onChange={set('handicapIndex')} />
        <FieldRow id="set-grad" label="Graduation year" inline inputMode="numeric" placeholder="2028" value={draft.graduationYear} onChange={set('graduationYear')} />
        <FieldRow id="set-phone" label="Phone" inline type="tel" autoComplete="tel" value={draft.phone} onChange={set('phone')} />
        <FieldRow id="set-home" label="Hometown" inline autoComplete="address-level2" value={draft.hometown} onChange={set('hometown')} />
        <FieldRow id="set-state" label="State" inline maxLength={2} placeholder="NC" value={draft.state} onChange={(e) => setDraft((d) => ({ ...d, state: e.target.value.toUpperCase() }))} />
      </div>
      {invalid && dirty && <Problem problem={invalid} />}
    </FormSheet>
  );
}

function MembershipPhone({ m, writes }: { m: ChMembership; writes: ChSettingsWrites }) {
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [joining, setJoining] = useState(false);
  const clear = () => {
    setJoining(false);
    setCode('');
    setNote('');
  };
  const { requests, leave, join, cancel } = useMembership(m, writes, { onLeft: () => setLeaving(false), onJoined: clear });

  if (m.team) {
    return (
      <>
        <Group title="Team" note="The team you play for on GolfHelm.">
          <div className="ch-setm-row is-info">
            <span className="ch-setm-row__l">{m.team.name}</span>
            {m.team.orgName && <span className="ch-setm-row__v">{m.team.orgName}</span>}
          </div>
          <NavRow label="Leave team" danger disabled={leave.pending} onClick={() => setLeaving(true)} />
        </Group>
        <ActionSheet
          open={leaving}
          onClose={() => setLeaving(false)}
          code="CH-8502"
          title={`Leave ${m.team.name}?`}
          message="You come off the roster right away. To come back, you'll need the invite code and your coach's approval."
          actions={[
            {
              label: 'Leave team',
              onClick: () => {
                setLeaving(false);
                void leave.run();
              },
            },
          ]}
        />
      </>
    );
  }

  return (
    <>
      <Group title="Join a team" code="CH-8302" note="Ask your coach for the team's invite code. They approve your request from their roster.">
        {requests.map((r) => (
          <div key={r.id} className="ch-setm-row is-info has-help" data-ch-code="CH-8303">
            <span className="ch-setm-row__l">Waiting on {r.teamName}</span>
            <button type="button" className="ch-setm-link" disabled={cancel.pending} onClick={() => void cancel.run(r.id)}>
              Cancel
            </button>
            <span className="ch-setm-help">Sent {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        ))}
        {requests.length === 0 && <NavRow label="Invite code" value="Enter" onClick={() => setJoining(true)} />}
      </Group>
      <FormSheet
        open={joining}
        onClose={clear}
        title="Join a team"
        actionLabel={join.pending ? 'Sending…' : 'Send'}
        busy={join.pending}
        dirty={code.trim() !== '' || note.trim() !== ''}
        actionDisabled={!code.trim()}
        onAction={() => void join.run(code, note)}
        note="Your coaches approve the request from their roster."
      >
        <div className="ch-setm-card">
          <FieldRow id="set-join-code" label="Invite code" autoComplete="off" autoCapitalize="characters" maxLength={12} placeholder="K7M2Q9XA" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <FieldRow id="set-join-note" label="Note to the coaches" help="Optional." maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </FormSheet>
    </>
  );
}
