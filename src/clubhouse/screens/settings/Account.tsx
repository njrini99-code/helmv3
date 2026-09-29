'use client';

import * as Sentry from '@sentry/nextjs';
import { Camera, ExternalLink, KeyRound, LifeBuoy, LogOut, Mail, Trash2, UserRound } from 'lucide-react';
import { useRef, useState } from 'react';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { haptic } from '../../lib/haptics';
import { chReport, chTrail } from '../../lib/track';
import { useAction } from '../../lib/use-action';
import { emailProblem, passwordProblem, type ChProfileInput, type ChSettingsData, type ChSettingsWrites } from './model';
import { Card, Field, ReadFailed, SaveBar, useDraft, useReportDirty } from './parts';

export function AccountSection({ data, writes, onDeleted }: { data: ChSettingsData; writes: ChSettingsWrites; onDeleted: () => void }) {
  return (
    <>
      {data.profile.error ? <ReadFailed what="Your profile" onRetry={writes.refresh} /> : <ProfileCard data={data} profile={data.profile.value} writes={writes} />}
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
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const save = useAction('settings.saveProfile', writes.saveProfile, { done: 'Profile saved', failed: "Couldn't save your profile" });
  const name = coach ? f.draft.fullName : `${f.draft.firstName} ${f.draft.lastName}`.trim();
  const invalid = coach ? (!f.draft.fullName.trim() ? 'Add your name.' : null) : !f.draft.firstName.trim() || !f.draft.lastName.trim() ? 'Add your first and last name.' : null;

  const upload = async (picked: File) => {
    setUploading(true);
    chTrail('settings avatar upload');
    try {
      const r = await writes.uploadAvatar(picked);
      if (r.success && r.data) f.setDraft((d) => ({ ...d, avatarUrl: r.data!.url }));
      else {
        haptic('error');
        chReport(new Error(r.error || 'avatar upload failed'), { surface: 'settings.profile', action: 'uploadAvatar', severity: 'low' });
        toast({ tone: 'error', title: "Couldn't upload that photo", body: r.error && r.error.length < 80 ? r.error : 'Check your connection and try again.' });
      }
    } catch (err) {
      haptic('error');
      chReport(err, { surface: 'settings.profile', action: 'uploadAvatar' });
      toast({ tone: 'error', title: "Couldn't upload that photo", body: 'Check your connection and try again.' });
    } finally {
      setUploading(false);
    }
  };

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
          onSave={async () => {
            const r = await save.run(f.draft);
            if (r.success) {
              f.commit();
              writes.refresh();
            }
          }}
        />
      }
    >
      <div className="ch-set-photo">
        <span className={'ch-set-photo__img' + (uploading ? ' is-busy' : '')}>
          {f.draft.avatarUrl ? (
            // A user-uploaded storage URL, shown as a plain image.
            <img src={f.draft.avatarUrl} alt="" width={64} height={64} />
          ) : (
            <Avatar name={name || 'You'} size={64} />
          )}
        </span>
        <div className="ch-set-photo__txt">
          <b>Photo</b>
          <span>A square photo works best. Up to 5 MB.</span>
          <div className="ch-set-photo__acts">
            <Button size="sm" leftIcon={Camera} disabled={uploading} onClick={() => file.current?.click()}>
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
            accept="image/*"
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
  const send = useAction('settings.changeEmail', writes.changeEmail, (v: string) => ({ done: `Confirmation sent to ${v}`, failed: "Couldn't start the email change" }));
  const problem = next.trim() ? emailProblem(next, email) : null;
  return (
    <Card id="set-email" title="Email" description="Where GolfHelm sends sign-in links and email notifications.">
      <div className="ch-inset ch-set-kv">
        <span>
          <Icon icon={Mail} size={15} />
          Current
        </span>
        <b>{email ?? 'No email on file'}</b>
      </div>
      {sentTo && (
        <InlineNotice title={`Check ${sentTo}.`} body="Open the link in that inbox to finish the change. Your current email works until then." />
      )}
      <form
        className="ch-set-inline"
        onSubmit={async (e) => {
          e.preventDefault();
          setTouched(true);
          if (problem || !next.trim()) return;
          const v = next.trim();
          const r = await send.run(v);
          if (r.success) {
            setSentTo(v);
            setNext('');
            setTouched(false);
          }
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
  const change = useAction('settings.changePassword', writes.changePassword, { done: 'Password updated', failed: "Couldn't update your password" });
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
            {tried && problem ? <span className="is-invalid">{problem}</span> : null}
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
              const r = await change.run(cur, next);
              if (r.success) {
                setCur('');
                setNext('');
                setConfirm('');
                setTried(false);
              }
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
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const report = async () => {
    if (opening) return;
    setOpening(true);
    chTrail('settings report a problem');
    const mail = () => {
      toast({ title: 'Opening email', body: "The in-app report form isn't available right now." });
      window.location.href = 'mailto:admin@helmsportslabs.com?subject=Problem%20report';
    };
    try {
      const dialog = await Sentry.getFeedback?.()?.createForm();
      if (!dialog) mail();
      else {
        dialog.appendToDom();
        dialog.open();
      }
    } catch {
      // The feedback widget is optional (blocked, offline, not loaded): email is the fallback, not an error.
      mail();
    } finally {
      setOpening(false);
    }
  };
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
  const [signingOut, setSigningOut] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const toast = useToast();
  const del = useAction('settings.deleteAccount', writes.deleteAccount, { done: 'Your account was deleted', failed: "Couldn't delete your account" });
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
            onClick={async () => {
              setSigningOut(true);
              chTrail('settings sign out');
              try {
                await writes.signOut();
              } catch (err) {
                chReport(err, { surface: 'settings.session', action: 'signOut' });
                haptic('error');
                toast({ tone: 'error', title: "Couldn't sign you out", body: 'Check your connection and try again.' });
                setSigningOut(false);
              }
            }}
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
      <Modal
        open={confirming}
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
              onClick={async () => {
                const r = await del.run();
                if (r.success) {
                  setConfirming(false);
                  onDeleted();
                }
              }}
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
