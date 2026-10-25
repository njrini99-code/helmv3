'use client';

import { ArrowRight, Check, CircleCheck, Copy, Link2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { haptic } from '../../lib/haptics';
import { AuthNotice } from '../auth/AuthNotice';
import { Act, Field, Q, focusField, type StepProps } from './Steps';
import { COACH_INVITE_PATH, DIVISIONS, cleanCity, cleanState, coachNameProblem, photoProblem, programProblem, slotCount, teamNameFor, type ProgramDetails } from './logic';
import { useOnboardWrites } from './writes-context';

/** The words under each division's tile (today's list is the abbreviations alone). */
const DIVISION_NAME: Record<(typeof DIVISIONS)[number], string> = { D1: 'Division I', D2: 'Division II', D3: 'Division III', NAIA: 'Intercollegiate', NJCAA: 'Junior college', Club: 'Club golf' };

/**
 * A new head coach's questions (/golf/coach, signed in already): the program and its team, then the coach, then the code
 * to hand to players. Today's three screens, with the same fields and the same `completeCoachOnboarding`. The member
 * card beside the questions is the coach's own and fills in with the program as it is typed.
 */

export function CProgram({ d, up, next, back, dir, phone }: StepProps) {
  const p = d.prog;
  const [err, setErr] = useState<{ field: 'org' | 'state'; message: string } | null>(null);
  const set = (patch: Partial<ProgramDetails>) => {
    up({ prog: { ...p, ...patch } });
    if (err) setErr(null);
  };
  const submit = () => {
    const bad = programProblem(p);
    if (bad) {
      setErr(bad);
      haptic('warning');
      focusField(bad.field === 'org' ? 'ch-ox-corg' : 'ch-ox-cstate');
      return;
    }
    next();
  };
  return (
    <Q dir={dir} back={back} title="Set up your program." sub="A few details about your school and squad. Only the school is required." onSubmit={submit}>
      <div className="ch-ox-body">
        <div className="ch-ox-fields">
          <Field id="ch-ox-corg" label="School or organization" error={err?.field === 'org' ? err.message : null}>
            <input
              id="ch-ox-corg"
              value={p.org}
              onChange={(e) => set({ org: e.target.value.slice(0, 200) })}
              placeholder="Texas A&M University"
              autoComplete="organization"
              aria-invalid={err?.field === 'org' ? true : undefined}
              aria-describedby={err?.field === 'org' ? 'ch-ox-corg-e' : undefined}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the first question on this screen
              autoFocus={!phone}
            />
          </Field>
          <div>
            <div className="ch-ox-lbl" id="ch-ox-cdiv-k">
              Division <span className="ch-ox-opt">· optional</span>
            </div>
            <div className="ch-ox-tiles ch-ox-tiles--sm" role="radiogroup" aria-labelledby="ch-ox-cdiv-k">
              {DIVISIONS.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={p.division === v}
                  className="ch-ox-tile"
                  onClick={() => {
                    haptic('select');
                    // Choosing the one that is chosen clears it: the division is optional.
                    set({ division: p.division === v ? '' : v });
                  }}
                >
                  <b>{v}</b>
                  <span>{DIVISION_NAME[v]}</span>
                </button>
              ))}
            </div>
          </div>
          <Field id="ch-ox-cconf" label="Conference" optional>
            <input id="ch-ox-cconf" value={p.conference} onChange={(e) => set({ conference: e.target.value.slice(0, 100) })} placeholder="SEC" />
          </Field>
          <div>
            <div className="ch-ox-lbl">
              Location <span className="ch-ox-opt">· optional</span>
            </div>
            <div className="ch-ox-city">
              <div className="ch-ox-field">
                <label htmlFor="ch-ox-ccity">City</label>
                <div className="ch-ox-input">
                  <input id="ch-ox-ccity" value={p.city} onChange={(e) => set({ city: cleanCity(e.target.value) })} placeholder="College Station" autoComplete="address-level2" />
                </div>
              </div>
              <div className="ch-ox-field ch-ox-state">
                <label htmlFor="ch-ox-cstate">State</label>
                <div className="ch-ox-input" data-invalid={err?.field === 'state' ? '' : undefined}>
                  <input
                    id="ch-ox-cstate"
                    value={p.state}
                    onChange={(e) => set({ state: cleanState(e.target.value) })}
                    maxLength={2}
                    autoCapitalize="characters"
                    autoComplete="address-level1"
                    placeholder="TX"
                    aria-invalid={err?.field === 'state' ? true : undefined}
                    aria-describedby={err?.field === 'state' ? 'ch-ox-cstate-e' : undefined}
                  />
                </div>
              </div>
            </div>
            {err?.field === 'state' && (
              <span className="ch-ox-error" id="ch-ox-cstate-e">
                {err.message}
              </span>
            )}
          </div>
          <div>
            <div className="ch-ox-lbl" id="ch-ox-cgender-k">
              Team
            </div>
            <div className="ch-ox-tiles ch-ox-tiles--sm ch-ox-tiles--two" role="radiogroup" aria-labelledby="ch-ox-cgender-k">
              {(['mens', 'womens'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={p.gender === g}
                  className="ch-ox-tile"
                  onClick={() => {
                    haptic('select');
                    set({ gender: g });
                  }}
                >
                  <b>{g === 'mens' ? 'Men’s' : 'Women’s'}</b>
                  <span>Golf team</span>
                </button>
              ))}
            </div>
          </div>
          <Field id="ch-ox-cteam" label="Team name" optional help={p.org.trim() ? `Left blank, it’s called “${teamNameFor(p)}”.` : 'For example, Men’s Golf or Women’s Golf.'}>
            <input id="ch-ox-cteam" value={p.team} onChange={(e) => set({ team: e.target.value.slice(0, 200) })} placeholder={p.gender === 'mens' ? 'Men’s Golf' : 'Women’s Golf'} />
          </Field>
        </div>
      </div>
      <Act phone={phone} />
    </Q>
  );
}

export function CProfile({ d, up, next, back, dir, phone }: StepProps) {
  const { finishCoach, uploadPhoto } = useOnboardWrites();
  const file = useRef<HTMLInputElement>(null);
  const [bad, setBad] = useState<'first' | 'last' | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const name = `${d.first} ${d.last}`.trim();

  const take = async (f: File | undefined) => {
    if (!f || uploading) return;
    const p = photoProblem(f);
    if (p) {
      setErr(p);
      haptic('error');
      return;
    }
    setErr(null);
    setUploading(true);
    const r = await uploadPhoto(f);
    setUploading(false);
    if (!r.ok) {
      setErr(r.error);
      haptic('error');
      return;
    }
    up({ photoUrl: r.url });
    haptic('success');
  };

  const submit = async () => {
    if (busy || uploading) return;
    const problem = coachNameProblem(d.first, d.last);
    if (problem) {
      setBad(problem.field);
      haptic('warning');
      return;
    }
    setBusy(true);
    setErr(null);
    haptic('press');
    const r = await finishCoach(d.prog, name, d.title, d.photoUrl);
    if (!r.ok) {
      setBusy(false);
      setErr(r.error);
      haptic('error');
      return;
    }
    haptic('success');
    next({ teamCode: r.joinCode }, 'cdone');
  };

  return (
    <Q dir={dir} back={back} hold={busy} title="How should players know you?" sub="Your name and title show on the roster and in messages." onSubmit={() => void submit()}>
      <div className="ch-ox-body">
        <div className="ch-ox-names">
          <label className="ch-ox-big" data-invalid={bad === 'first' ? '' : undefined}>
            <span>First name</span>
            <input
              value={d.first}
              onChange={(e) => {
                up({ first: e.target.value.slice(0, 100) });
                setBad(null);
              }}
              placeholder="First"
              autoComplete="given-name"
              aria-invalid={bad === 'first' ? true : undefined}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the first question on this screen
              autoFocus={!phone}
            />
          </label>
          <label className="ch-ox-big" data-invalid={bad === 'last' ? '' : undefined}>
            <span>Last name</span>
            <input
              value={d.last}
              onChange={(e) => {
                up({ last: e.target.value.slice(0, 100) });
                setBad(null);
              }}
              placeholder="Last"
              autoComplete="family-name"
              aria-invalid={bad === 'last' ? true : undefined}
            />
          </label>
        </div>
        <div className="ch-ox-hello" aria-live="polite" data-error={bad ? '' : undefined}>
          {bad ? <span>Add your {bad} name to continue.</span> : null}
        </div>
        <div className="ch-ox-fields">
          <Field id="ch-ox-ctitle" label="Title" optional>
            <input id="ch-ox-ctitle" value={d.title} onChange={(e) => up({ title: e.target.value.slice(0, 100) })} placeholder="Head coach" autoComplete="organization-title" />
          </Field>
          <div className="ch-ox-avrow">
            {d.photoUrl ? <img className="ch-ox-av" src={d.photoUrl} alt="" /> : <Avatar name={name || 'Coach'} size={44} />}
            <div>
              <b>Photo</b>
              <span>{uploading ? 'Uploading…' : d.photoUrl ? 'Players see this on your messages.' : 'Optional. Players see it on your messages.'}</span>
            </div>
            <button type="button" className="ch-ox-link" onClick={() => file.current?.click()} disabled={uploading || busy}>
              {d.photoUrl ? 'Replace' : 'Add a photo'}
            </button>
            {d.photoUrl && (
              <button type="button" className="ch-ox-link" onClick={() => up({ photoUrl: null })} disabled={busy}>
                Remove
              </button>
            )}
            <input ref={file} type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={(e) => void take(e.target.files?.[0])} />
          </div>
        </div>
      </div>
      {err && (
        <div className="ch-ox-err">
          <AuthNotice tone="danger" code="CH-15035">
            {err}
          </AuthNotice>
        </div>
      )}
      <Act phone={phone} label="Create program" busy={busy} busyLabel="Creating your program…" icon={Check} disabled={uploading} />
    </Q>
  );
}

export function CDone({ d, finish, dir }: StepProps) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [failed, setFailed] = useState(false);
  const code = d.teamCode;
  const org = d.prog.org.trim();
  const copy = async (what: 'code' | 'link') => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(what === 'code' ? code : `${window.location.origin}${COACH_INVITE_PATH(code)}`);
      setFailed(false);
      setCopied(what);
      haptic('success');
      window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000);
    } catch {
      // Nothing was copied, and it is not shown as if it were: the code is on screen to select.
      setFailed(true);
      haptic('error');
    }
  };
  const n = code ? slotCount(code) : 8;
  const chars = (code ?? '').split('');
  const slots: Array<number | 'dash'> = [0, 1, 2, 3, 'dash', ...Array.from({ length: n - 4 }, (_, i) => i + 4)];
  return (
    <Q
      dir={dir}
      eyebrow={
        <>
          <Icon icon={CircleCheck} size={15} />
          Program created
        </>
      }
      title={org ? `${org} is ready.` : 'Your program is ready.'}
      sub={code ? 'Share your team code with players and they’ll be on the roster when they sign up.' : 'Your team is set up. Players can be added from the roster.'}
    >
      {code && (
        <div className="ch-ox-body">
          <div className="ch-ox-teamcode" data-ch-code="CH-15950">
            <div className="ch-ox-slots" role="img" aria-label={`Team code ${code.split('').join(' ')}`} style={{ ['--ch-ox-rest' as string]: String(n - 4) }}>
              {slots.map((i) =>
                i === 'dash' ? (
                  <b key="dash" aria-hidden="true" />
                ) : (
                  <span key={i} className="ch-ox-slot" data-filled="">
                    {chars[i] ?? ''}
                  </span>
                ),
              )}
            </div>
            <div className="ch-ox-teamcode__act">
              <Button size="sm" leftIcon={copied === 'code' ? Check : Copy} onClick={() => void copy('code')}>
                {copied === 'code' ? 'Copied' : 'Copy code'}
              </Button>
              <Button size="sm" leftIcon={copied === 'link' ? Check : Link2} onClick={() => void copy('link')}>
                {copied === 'link' ? 'Copied' : 'Copy invite link'}
              </Button>
            </div>
            <span className="ch-au-sr" aria-live="polite">
              {copied ? 'Copied to your clipboard' : ''}
            </span>
          </div>
          {failed && (
            <div className="ch-ox-err">
              <AuthNotice tone="warning" code="CH-15951">
                We couldn’t copy it from here. Select the code above and copy it.
              </AuthNotice>
            </div>
          )}
        </div>
      )}
      <div className="ch-ox-act">
        {/* Next (STATE-O3): a new team's dashboard is empty until players join, so the roster, where invites live, is first. */}
        <Button variant="primary" size="lg" rightIcon={ArrowRight} feel="success" onClick={() => finish('/golf/dashboard/roster')}>
          Invite players
        </Button>
        <Button variant="ghost" size="lg" onClick={() => finish('/golf/dashboard')}>
          Go to your dashboard
        </Button>
      </div>
    </Q>
  );
}
