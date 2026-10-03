'use client';

import { Camera, ExternalLink, KeyRound, LifeBuoy, LogOut, Trash2, UserRound } from 'lucide-react';
import { useRef, useState } from 'react';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { Modal } from '../../ui/Modal';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { emailProblem, passwordProblem, profileProblem, type ChProfileInput, type ChSettingsData, type ChSettingsWrites } from './model';
import { SAVE_COPY, useAvatarUpload, useDeleteAccount, useReportProblem, useSignOut } from './hooks';
import { Card, Field, ReadFailed, Row, SaveBar, useDraft, useReportDirty, useSaveAction } from './parts';

export function AccountSection({ data, writes, onDeleted }: { data: ChSettingsData; writes: ChSettingsWrites; onDeleted: () => void }) {
  return (
    <>
      {data.profile.error ? <ReadFailed what="Your profile" code="CH-8201" onRetry={writes.refresh} /> : <ProfileCard data={data} profile={data.profile.value} writes={writes} />}
      <EmailCard email={data.email} writes={writes} />
      <PasswordCard writes={writes} hasEmail={!!data.email} />
      <HelpCard />
      <SessionCard writes={writes} onDeleted={onDeleted} />
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

  return (
    <Card
      id="set-profile"
      title="Profile"
      description={coach ? 'How players and staff see you across GolfHelm.' : 'How your coaches and teammates see you.'}
      foot={
        <SaveBar
          dirty={f.dirty}
          pending={save.pending}
          invalid={invalid}
          savedAt={f.savedAt}
          onReset={f.reset}
          onSave={() => void save.run(f.draft)}
        />
      }
    >
      <div className="ch-set-photo">
        <span className={'ch-set-photo__img' + (uploading ? ' is-busy' : '')} data-ch-code={f.draft.avatarUrl ? undefined : 'CH-8304'}>
          {f.draft.avatarUrl ? (
            // A user-uploaded storage URL, shown as a plain image.
            <img src={f.draft.avatarUrl} alt="" width={64} height={64} />
          ) : (
            <Avatar name={name || 'You'} size={64} />
          )}
        </span>
        <div className="ch-set-photo__txt">
          <b>Photo</b>
          <span>A square photo works best. JPEG, PNG or WebP, up to 2 MB.</span>
          <div className="ch-set-photo__acts">
            <Button size="sm" leftIcon={Camera} disabled={uploading} onClick={() => file.current?.click()}>
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
          <Field id="set-fullname" label="Full name" span={2} autoComplete="name" value={f.draft.fullName} onChange={(e) => f.setDraft((d) => ({ ...d, fullName: e.target.value }))} />
        ) : (
          <>
            <Field id="set-first" label="First name" autoComplete="given-name" value={f.draft.firstName} onChange={(e) => f.setDraft((d) => ({ ...d, firstName: e.target.value }))} />
            <Field id="set-last" label="Last name" autoComplete="family-name" value={f.draft.lastName} onChange={(e) => f.setDraft((d) => ({ ...d, lastName: e.target.value }))} />
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
  useReportDirty('email', next.trim() !== '');
  const send = useSaveAction(
    'settings.changeEmail',
    writes.changeEmail,
    SAVE_COPY.email,
    (_r, v) => {
      setSentTo(v);
      setNext('');
      setTouched(false);
    },
  );
  const problem = next.trim() ? emailProblem(next, email) : null;
  return (
    <Card id="set-email" title="Email" description="Where GolfHelm sends sign-in links and email notifications.">
      <Row label="Current email">
        <span className="ch-set-value">{email ?? 'No email on file'}</span>
      </Row>
      {sentTo && (
        <InlineNotice title={`Check ${sentTo}.`} body="Open the link in that inbox to finish the change. Your current email works until then." />
      )}
      <form
        className="ch-set-inline"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setTouched(true);
          if (problem || !next.trim()) return;
          await send.run(next.trim());
        }}
      >
        <Field
          id="set-newemail"
          label="New email"
          type="email"
          autoComplete="email"
          placeholder="name@school.edu"
          value={next}
          error={touched ? problem : null}
          onChange={(e) => setNext(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        <Button type="submit" disabled={!next.trim() || send.pending}>
          {send.pending ? 'Sending…' : 'Send confirmation'}
        </Button>
      </form>
    </Card>
  );
}

function PasswordCard({ writes, hasEmail }: { writes: ChSettingsWrites; hasEmail: boolean }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [tried, setTried] = useState(false);
  useReportDirty('password', !!(cur || next || confirm));
  const change = useSaveAction('settings.changePassword', writes.changePassword, SAVE_COPY.password, () => {
    setCur('');
    setNext('');
    setConfirm('');
    setTried(false);
  });
  const problem = passwordProblem(cur, next, confirm);
  return (
    <Card
      id="set-password"
      title="Password"
      description="You'll confirm your current password first."
      aside={<Icon icon={KeyRound} size={16} />}
      foot={
        <>
          <span className="ch-set-status" aria-live="polite">
            {tried && problem ? (
              <span className="is-invalid" role="alert" data-ch-code={problem.code}>
                {problem.text}
              </span>
            ) : null}
          </span>
          <Button
            variant="primary"
            size="sm"
            disabled={!hasEmail || change.pending || !(cur || next || confirm)}
            onClick={async () => {
              setTried(true);
              if (problem) {
                haptic('warning');
                return;
              }
              await change.run(cur, next);
            }}
          >
            {change.pending ? 'Updating…' : 'Update password'}
          </Button>
        </>
      }
    >
      <div className="ch-set-grid">
        <Field id="set-pw-cur" label="Current password" type="password" autoComplete="current-password" span={2} value={cur} onChange={(e) => setCur(e.target.value)} />
        <Field id="set-pw-new" label="New password" type="password" autoComplete="new-password" help="At least 8 characters." value={next} onChange={(e) => setNext(e.target.value)} />
        <Field id="set-pw-confirm" label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
    </Card>
  );
}

function HelpCard() {
  const { report, opening } = useReportProblem();
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
          <Icon icon={ExternalLink} size={16} />
          <span>
            <b>Privacy policy</b>
          </span>
        </a>
        <a className="ch-set-link" href="/terms" target="_blank" rel="noreferrer">
          <Icon icon={ExternalLink} size={16} />
          <span>
            <b>Terms of service</b>
          </span>
        </a>
      </div>
    </Card>
  );
}

function SessionCard({ writes, onDeleted }: { writes: ChSettingsWrites; onDeleted: () => void }) {
  const { signOut, signingOut } = useSignOut(writes);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const del = useDeleteAccount(writes, () => {
    setConfirming(false);
    onDeleted();
  });
  return (
    <>
      <Card id="set-session" title="Session and account" tone="danger">
        <div className="ch-set-row">
          <div className="ch-set-row__txt">
            <span className="ch-set-row__l">Sign out</span>
            <span className="ch-set-row__h">Signs you out on this device.</span>
          </div>
          <Button
            size="sm"
            leftIcon={LogOut}
            disabled={signingOut}
            onClick={() => void signOut()}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
        <div className="ch-set-row">
          <div className="ch-set-row__txt">
            <span className="ch-set-row__l">Delete account</span>
            <span className="ch-set-row__h">Removes your account and everything tied to it. This can&apos;t be undone.</span>
          </div>
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
        </div>
      </Card>
      {/* CH-8604: a confirm rises and fades in; CH-8806: it traps focus, Esc closes, focus returns (native dialog). */}
      <Modal
        open={confirming}
        code="CH-8501"
        onClose={() => !del.pending && setConfirming(false)}
        icon={UserRound}
        title="Delete your account?"
        description="This permanently deletes your account and the data tied to it. This can't be undone."
        footer={
          <>
            <Button variant="secondary" disabled={del.pending} onClick={() => setConfirming(false)}>
              Keep my account
            </Button>
            <Button
              variant="danger"
              disabled={typed.trim().toLowerCase() !== 'delete' || del.pending}
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
