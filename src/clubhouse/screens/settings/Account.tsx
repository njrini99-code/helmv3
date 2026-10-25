'use client';

import { Camera, ArrowUpRight, KeyRound, LifeBuoy, LogOut, Trash2, UserRound } from 'lucide-react';
import { useRef, useState } from 'react';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { Modal } from '../../ui/Modal';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { emailProblem, passwordProblem, profileProblem, type ChProfileInput, type ChSettingsData, type ChSettingsWrites } from './model';
import { SAVE_COPY, useAppVersion, useAvatarUpload, useDeleteAccount, useReportProblem, useSignOut } from './hooks';
import { Card, Field, focusProblemField, ReadFailed, Row, useDraft, useReportDirty, useSaveAction } from './parts';

export function AccountSection({ data, writes, onDeleted }: { data: ChSettingsData; writes: ChSettingsWrites; onDeleted: () => void }) {
  return (
    <>
      {data.profile.error ? <ReadFailed what="Your profile" code="CH-8201" onRetry={writes.refresh} title="Profile" description={data.role === 'coach' ? 'How players and staff see you across GolfHelm.' : 'How your coaches and teammates see you.'} /> : <ProfileCard data={data} profile={data.profile.value} writes={writes} />}
      <EmailCard email={data.email} writes={writes} />
      <PasswordCard writes={writes} hasEmail={!!data.email} />
      <HelpCard />
      <SessionCard writes={writes} />
      <DangerCard writes={writes} onDeleted={onDeleted} />
    </>
  );
}

function ProfileCard({ data, profile, writes }: { data: ChSettingsData; profile: ChProfileInput; writes: ChSettingsWrites }) {
  const coach = data.role === 'coach';
  const f = useDraft<ChProfileInput>(profile);
  useReportDirty('profile', f.dirty);
  const file = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useAvatarUpload(writes, (url) => f.setDraft((d) => ({ ...d, avatarUrl: url })));
  const save = useSaveAction('settings.saveProfile', writes.saveProfile, SAVE_COPY.profile, (_r, saved) => {
    f.commit(saved);
    writes.refresh();
  });
  // The coin keeps the saved initials while the name field is being edited or is empty.
  const name = (coach ? f.draft.fullName : `${f.draft.firstName} ${f.draft.lastName}`).trim() || profile.fullName;
  const invalid = profileProblem(data.role, f.draft);
  // A photo that doesn't load falls back to the initials (the URL stays, so Replace and Remove still apply).
  const [broken, setBroken] = useState<string | null>(null);
  const photo = f.draft.avatarUrl && f.draft.avatarUrl !== broken ? f.draft.avatarUrl : null;

  return (
    <Card
      id="set-profile"
      title="Profile"
      description={coach ? 'How players and staff see you across GolfHelm.' : 'How your coaches and teammates see you.'}
      save={{ dirty: f.dirty, pending: save.pending, invalid, savedAt: f.savedAt, onReset: f.reset, onSave: () => void save.run(f.draft) }}
    >
      <div className="ch-set-photo">
        <span className={'ch-set-photo__img' + (uploading ? ' is-busy' : '')} data-ch-code={f.draft.avatarUrl ? undefined : 'CH-8304'}>
          {photo ? (
            // A user-uploaded storage URL, shown as a plain image.
            <img src={photo} alt="" width={64} height={64} onError={() => setBroken(photo)} />
          ) : (
            <Avatar name={name || 'You'} size="xl" />
          )}
        </span>
        <div className="ch-set-photo__txt">
          <b>Photo</b>
          <span>A square photo works best. JPEG, PNG or WebP, up to 2 MB.</span>
          <div className="ch-set-photo__acts">
            <Button size="sm" leftIcon={Camera} busy={uploading} onClick={() => file.current?.click()}>
              {/* CH-8404: the photo dims and the button says so while it uploads. */}
              {uploading ? 'Uploading…' : f.draft.avatarUrl ? 'Replace photo' : 'Add photo'}
            </Button>
            {f.draft.avatarUrl && !uploading && (
              <Button size="sm" variant="ghost" onClick={() => f.setDraft((d) => ({ ...d, avatarUrl: null }))}>
                Remove
              </Button>
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
      </div>
      <div className="ch-set-grid">
        {coach ? (
          <>
            <Field id="set-fullname" label="Full name" autoComplete="name" value={f.draft.fullName} onChange={(e) => { const value = e.target.value; f.setDraft((d) => ({ ...d, fullName: value })); }} />
            {/* golf_coaches.title: read with the name in Messages, Hub announcements and Team › Coaching staff (P008). */}
            <Field
              id="set-title"
              label="Title"
              placeholder="Assistant coach"
              maxLength={100}
              autoComplete="organization-title"
              help="With your name in Messages, on announcements and in Team settings."
              value={f.draft.title}
              onChange={(e) => { const value = e.target.value; f.setDraft((d) => ({ ...d, title: value })); }}
            />
          </>
        ) : (
          <>
            <Field id="set-first" label="First name" autoComplete="given-name" value={f.draft.firstName} onChange={(e) => { const value = e.target.value; f.setDraft((d) => ({ ...d, firstName: value })); }} />
            <Field id="set-last" label="Last name" autoComplete="family-name" value={f.draft.lastName} onChange={(e) => { const value = e.target.value; f.setDraft((d) => ({ ...d, lastName: value })); }} />
          </>
        )}
      </div>
    </Card>
  );
}

function EmailCard({ email, writes }: { email: string | null; writes: ChSettingsWrites }) {
  const [next, setNext] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  useReportDirty('email', next.trim() !== '');
  const send = useSaveAction(
    'settings.changeEmail',
    writes.changeEmail,
    SAVE_COPY.email,
    (_r, v) => {
      setSentTo(v);
      setNext('');
      setTouched(false);
      setSentAt(Date.now());
    },
  );
  const problem = next.trim() ? emailProblem(next, email) : null;
  return (
    <Card
      id="set-email"
      title="Email"
      description="Where GolfHelm sends sign-in links and email notifications."
      save={{
        dirty: next.trim() !== '',
        pending: send.pending,
        savedAt: sentAt,
        label: 'Send confirmation',
        enterSaves: true,
        onReset: () => {
          setNext('');
          setTouched(false);
        },
        onSave: () => {
          setTouched(true);
          if (problem || !next.trim()) {
            haptic('warning');
            focusProblemField(problem);
            return;
          }
          void send.run(next.trim());
        },
      }}
    >
      <Row label="Current email">
        <span className="ch-set-value">{email ?? 'No email on file'}</span>
      </Row>
      {sentTo && (
        <InlineNotice title={`Check ${sentTo}`} body="Open the link in that inbox to finish the change. Your current email works until then." />
      )}
      <div className="ch-set-grid">
        <Field
          id="set-newemail"
          label="New email"
          type="email"
          autoComplete="email"
          placeholder="name@school.edu"
          span={2}
          value={next}
          error={touched ? problem : null}
          onChange={(e) => setNext(e.target.value)}
          onBlur={() => setTouched(true)}
        />
      </div>
    </Card>
  );
}

function PasswordCard({ writes, hasEmail }: { writes: ChSettingsWrites; hasEmail: boolean }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [tried, setTried] = useState(false);
  const [changedAt, setChangedAt] = useState(0);
  useReportDirty('password', !!(cur || next || confirm));
  const clear = () => {
    setCur('');
    setNext('');
    setConfirm('');
    setTried(false);
  };
  const change = useSaveAction('settings.changePassword', writes.changePassword, SAVE_COPY.password, () => {
    clear();
    setChangedAt(Date.now());
  });
  const problem = passwordProblem(cur, next, confirm);
  const pwErrorAt = (id: string) => (tried && problem?.field === id ? problem : null);
  return (
    <Card
      id="set-password"
      title="Password"
      description="You’ll confirm your current password first."
      aside={<Icon icon={KeyRound} size={16} />}
      save={{
        dirty: hasEmail && !!(cur || next || confirm),
        pending: change.pending,
        savedAt: changedAt,
        label: 'Update password',
        invalid: tried ? problem : null,
        onReset: clear,
        onSave: () => {
          setTried(true);
          if (problem) {
            haptic('warning');
            focusProblemField(problem);
            return;
          }
          void change.run(cur, next);
        },
      }}
    >
      <div className="ch-set-grid">
        {/* The field a refused save's problem names says it too, as the save bar does (as Team's fields do). */}
        <Field id="set-pw-cur" label="Current password" type="password" autoComplete="current-password" span={2} error={pwErrorAt('set-pw-cur')} value={cur} onChange={(e) => setCur(e.target.value)} />
        <Field id="set-pw-new" label="New password" type="password" autoComplete="new-password" help="At least 8 characters." error={pwErrorAt('set-pw-new')} value={next} onChange={(e) => setNext(e.target.value)} />
        <Field id="set-pw-confirm" label="Confirm new password" type="password" autoComplete="new-password" error={pwErrorAt('set-pw-confirm')} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
    </Card>
  );
}

function HelpCard() {
  const { report, opening } = useReportProblem();
  const version = useAppVersion();
  return (
    <Card id="set-help" title="Help and legal">
      <div className="ch-set-links">
        <button type="button" className="ch-set-link" onClick={report} disabled={opening}>
          <Icon icon={LifeBuoy} size={16} />
          <span>
            <b>Report a problem</b>
            <span>Tell us what went wrong. Screenshots help.</span>
          </span>
        </button>
        <a className="ch-set-link" href="/privacy" target="_blank" rel="noreferrer">
          <Icon icon={ArrowUpRight} size={16} />
          <span>
            <b>Privacy policy</b>
          </span>
        </a>
        <a className="ch-set-link" href="/terms" target="_blank" rel="noreferrer">
          <Icon icon={ArrowUpRight} size={16} />
          <span>
            <b>Terms of service</b>
          </span>
        </a>
      </div>
      {/* About: which GolfHelm this is, for a problem report or support. */}
      <Row label="Version">
        <span className="ch-set-value ch-num">{version}</span>
      </Row>
    </Card>
  );
}

function SessionCard({ writes }: { writes: ChSettingsWrites }) {
  const { signOut, signingOut } = useSignOut(writes);
  return (
    <Card id="set-session" title="Session">
      <Row label="Sign out" help="Signs you out on this device.">
        <Button size="sm" leftIcon={LogOut} busy={signingOut} onClick={() => void signOut()}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </Row>
    </Card>
  );
}

/** Last in the section, on its own: what can't be undone. Red is for this (D-42); the confirm below is unchanged. */
function DangerCard({ writes, onDeleted }: { writes: ChSettingsWrites; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const del = useDeleteAccount(writes, () => {
    setConfirming(false);
    onDeleted();
  });
  return (
    <>
      <Card id="set-danger" title="Danger zone" description="Things that can’t be undone." tone="danger">
        <Row label="Delete account" help="Removes your account and everything tied to it. This can’t be undone.">
          <Button
            size="sm"
            variant="danger"
            leftIcon={Trash2}
            onClick={() => {
              // CH-8704: the warning pattern as Delete account opens.
              haptic('warning');
              chTrail('settings delete account open');
              setTyped('');
              setConfirming(true);
            }}
          >
            Delete account
          </Button>
        </Row>
      </Card>
      {/* CH-8604: a confirm rises and fades in; CH-8806: it traps focus, Esc closes, focus returns (native dialog). */}
      <Modal
        open={confirming}
        code="CH-8501"
        onClose={() => !del.pending && setConfirming(false)}
        icon={UserRound}
        title="Delete your account?"
        description="This permanently deletes your account and the data tied to it. This can’t be undone."
        footer={
          <>
            <Button variant="secondary" disabled={del.pending} onClick={() => setConfirming(false)}>
              Keep my account
            </Button>
            <Button
              variant="danger"
              busy={del.pending} disabled={typed.trim().toLowerCase() !== 'delete'}
              onClick={() => void del.run()}
            >
              {del.pending ? 'Deleting…' : 'Delete account'}
            </Button>
          </>
        }
      >
        <Field id="set-delete-type" label="Type delete to confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Modal>
    </>
  );
}
