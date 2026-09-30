'use client';

import { useRef, useState } from 'react';
import { initials } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { chTrail } from '../../../lib/track';
import { emailProblem, passwordProblem, profileProblem, type ChProfileInput, type ChSettingsData, type ChSettingsWrites } from '../model';
import { SAVE_COPY, useAvatarUpload, useDeleteAccount } from '../hooks';
import { ReadFailed, useSaveAction } from '../parts';
import { ActionSheet, FormSheet, useSheetDraft } from './sheets';
import { FieldRow, Group, NavRow, Problem } from './ui';

/**
 * Account on the phone: Profile, the sign-in details and Delete account. The edit sheets (Profile, Email, Password) are
 * hosted by the page, because the identity row on the root opens Profile too.
 */
export function AccountPhone({
  data,
  writes,
  sentTo,
  onProfile,
  onEmail,
  onPassword,
  onDeleted,
}: {
  data: ChSettingsData;
  writes: ChSettingsWrites;
  sentTo: string | null;
  onProfile: () => void;
  onEmail: () => void;
  onPassword: () => void;
  onDeleted: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const del = useDeleteAccount(writes, () => {
    setTyping(false);
    onDeleted();
  });
  return (
    <>
      {data.profile.error ? (
        <ReadFailed what="Your profile" code="CH-8201" onRetry={writes.refresh} />
      ) : (
        <Group title="Profile">
          <NavRow label="Profile" value={data.profile.value.fullName} onClick={onProfile} />
        </Group>
      )}
      <Group title="Sign in" note={sentTo ? `Check ${sentTo}. Open the link in that inbox to finish the change. Your current email works until then.` : "Where GolfHelm sends sign-in links and email notifications. You'll confirm your current password before changing it."}>
        <NavRow label="Email" value={data.email ?? 'No email on file'} onClick={onEmail} />
        <NavRow label="Password" disabled={!data.email} onClick={onPassword} />
      </Group>
      <Group>
        <NavRow
          label="Delete account"
          danger
          onClick={() => {
            chTrail('settings delete account open');
            setAsking(true);
          }}
        />
      </Group>

      <ActionSheet
        open={asking}
        onClose={() => setAsking(false)}
        code="CH-8501"
        title="Delete your account?"
        message="This permanently deletes your account and the data tied to it. This can't be undone."
        actions={[
          {
            label: 'Delete account',
            onClick: () => {
              setAsking(false);
              setTyped('');
              setTyping(true);
            },
          },
        ]}
      />
      <FormSheet
        open={typing}
        onClose={() => setTyping(false)}
        code="CH-8510"
        title="Delete account"
        actionLabel={del.pending ? 'Deleting…' : 'Delete'}
        danger
        busy={del.pending}
        actionDisabled={typed.trim().toLowerCase() !== 'delete'}
        onAction={() => void del.run()}
        note="Type delete to confirm. Your account and everything tied to it goes right away."
      >
        <div className="ch-setm-card">
          <FieldRow id="set-delete-type" label="Type delete to confirm" autoComplete="off" autoCapitalize="none" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      </FormSheet>
    </>
  );
}

/** Profile: photo, name and the email, in a full-height sheet. Save stays off until something changes (CH-8101, CH-8102). */
export function ProfileSheet({
  open,
  onClose,
  data,
  profile,
  writes,
  onChangeEmail,
}: {
  open: boolean;
  onClose: () => void;
  data: ChSettingsData;
  profile: ChProfileInput;
  writes: ChSettingsWrites;
  onChangeEmail: () => void;
}) {
  const coach = data.role === 'coach';
  const { draft, setDraft, dirty } = useSheetDraft<ChProfileInput>(profile, open);
  const file = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useAvatarUpload(writes, (url) => setDraft((d) => ({ ...d, avatarUrl: url })));
  const save = useSaveAction('settings.saveProfile', writes.saveProfile, SAVE_COPY.profile, () => {
    writes.refresh();
    onClose();
  });
  // The coin keeps the saved initials while the name is being edited or is empty.
  const name = (coach ? draft.fullName : `${draft.firstName} ${draft.lastName}`).trim() || profile.fullName;
  const invalid = profileProblem(data.role, draft);
  return (
    <FormSheet
      open={open}
      onClose={onClose}
      full
      title="Profile"
      actionLabel={save.pending ? 'Saving…' : 'Save'}
      busy={save.pending}
      dirty={dirty}
      actionDisabled={!dirty || !!invalid}
      onAction={() => void save.run(draft)}
      note="Save turns on once something changes. Swiping down with changes asks first."
    >
      <div className="ch-setm-photo">
        <span className={'ch-setm-coin is-big' + (uploading ? ' is-busy' : '')} data-ch-code={draft.avatarUrl ? undefined : 'CH-8304'}>
          {draft.avatarUrl ? (
            // A user-uploaded storage URL, shown as a plain image.
            <img src={draft.avatarUrl} alt="" width={84} height={84} />
          ) : (
            initials(name || 'You')
          )}
        </span>
        <div className="ch-setm-photo__acts">
          <button type="button" className="ch-setm-link" disabled={uploading} onClick={() => file.current?.click()}>
            {uploading ? 'Uploading…' : draft.avatarUrl ? 'Replace photo' : 'Change photo'}
          </button>
          {draft.avatarUrl && !uploading && (
            <button type="button" className="ch-setm-link is-quiet" onClick={() => setDraft((d) => ({ ...d, avatarUrl: null }))}>
              Remove photo
            </button>
          )}
        </div>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          hidden
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = '';
            if (picked) void upload(picked);
          }}
        />
      </div>

      <div className="ch-setm-card">
        {coach ? (
          <FieldRow id="set-fullname" label="Full name" inline autoComplete="name" value={draft.fullName} onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))} />
        ) : (
          <>
            <FieldRow id="set-first" label="First name" inline autoComplete="given-name" value={draft.firstName} onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))} />
            <FieldRow id="set-last" label="Last name" inline autoComplete="family-name" value={draft.lastName} onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))} />
          </>
        )}
      </div>
      {invalid && dirty && <Problem problem={invalid} />}

      <Group title="Email" note="Where GolfHelm sends sign-in links and email notifications.">
        <button type="button" className="ch-setm-row is-nav" onClick={onChangeEmail}>
          <span className="ch-setm-row__l">{data.email ?? 'No email on file'}</span> <span className="ch-setm-row__v is-link">Change</span>
        </button>
      </Group>
    </FormSheet>
  );
}

/** Change email: the new address, and a confirmation sent to it (CH-8003, CH-8103, CH-8104). Enter sends it (82001). */
export function EmailSheet({ open, onClose, email, writes, onSent }: { open: boolean; onClose: () => void; email: string | null; writes: ChSettingsWrites; onSent: (to: string) => void }) {
  const [next, setNext] = useState('');
  const [touched, setTouched] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setNext('');
      setTouched(false);
    }
  }
  const send = useSaveAction('settings.changeEmail', writes.changeEmail, SAVE_COPY.email, (_r, v) => {
    onSent(v);
    onClose();
  });
  const problem = next.trim() ? emailProblem(next, email) : null;
  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title="Change email"
      actionLabel={send.pending ? 'Sending…' : 'Send'}
      busy={send.pending}
      dirty={next.trim() !== ''}
      actionDisabled={!next.trim()}
      onAction={() => {
        setTouched(true);
        if (problem || !next.trim()) return;
        void send.run(next.trim());
      }}
      note="We email a link to the new address. Your current email works until you open it."
    >
      <div className="ch-setm-card">
        <FieldRow
          id="set-newemail"
          label="New email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          placeholder="name@school.edu"
          value={next}
          error={touched ? problem : null}
          onChange={(e) => setNext(e.target.value)}
          onBlur={() => setTouched(true)}
        />
      </div>
    </FormSheet>
  );
}

/** Change password: the current one first, then the new one twice (CH-8004, CH-8105 to CH-8107). */
export function PasswordSheet({ open, onClose, hasEmail, writes }: { open: boolean; onClose: () => void; hasEmail: boolean; writes: ChSettingsWrites }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [tried, setTried] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCur('');
      setNext('');
      setConfirm('');
      setTried(false);
    }
  }
  const change = useSaveAction('settings.changePassword', writes.changePassword, SAVE_COPY.password, () => onClose());
  const problem = passwordProblem(cur, next, confirm);
  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title="Password"
      actionLabel={change.pending ? 'Updating…' : 'Update'}
      busy={change.pending}
      dirty={!!(cur || next || confirm)}
      actionDisabled={!hasEmail || !(cur || next || confirm)}
      onAction={() => {
        setTried(true);
        if (problem) {
          haptic('warning');
          return;
        }
        void change.run(cur, next);
      }}
      note="You'll confirm your current password first."
    >
      <div className="ch-setm-card">
        <FieldRow id="set-pw-cur" label="Current password" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        <FieldRow id="set-pw-new" label="New password" type="password" autoComplete="new-password" help="At least 8 characters." value={next} onChange={(e) => setNext(e.target.value)} />
        <FieldRow id="set-pw-confirm" label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {tried && problem && <Problem problem={problem} />}
    </FormSheet>
  );
}
