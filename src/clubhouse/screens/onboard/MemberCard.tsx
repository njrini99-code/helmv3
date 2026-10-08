'use client';

import { UserRound } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import type { Draft } from './flow';
import { REQUEST_TITLE, classOf, fmtHcp, type OnboardPath, type OnboardStep } from './logic';

const MARK = '/clubhouse/auth/helm-golf-mark.png';

export interface CardFace {
  name: string;
  tag: string;
  fields: Array<[string, string]>;
  band: string;
  photo: string | null;
}

/**
 * What the member card says. Presentation only: nothing on it is read back or
 * trusted. Before the account exists the team is the name the gate returned for
 * a roster code, and nothing about the team's people is shown.
 */
export function cardOf(d: Draft, path: OnboardPath, step: OnboardStep, now: Date): CardFace {
  if (path === 'request') {
    const r = d.req;
    return {
      name: `${r.first} ${r.last}`.trim(),
      tag: 'Access request',
      fields: [
        ['Title', r.who ? REQUEST_TITLE[r.who] : ''],
        ['Program', r.school.trim()],
        ['Email', r.email.includes('@') ? r.email.split('@')[0]! : ''],
      ],
      band: 'Access request',
      photo: null,
    };
  }
  const team = d.joinedTeam === false ? '' : d.teamName ?? '';
  const name = `${d.first} ${d.last}`.trim();
  if (path === 'staff') {
    return {
      name,
      tag: 'Assistant coach',
      fields: [
        ['Team', team],
        ['Role', 'Assistant'],
        ['Status', step === 'staffdone' ? 'Full access' : ''],
      ],
      band: team || 'GolfHelm Clubhouse',
      photo: null,
    };
  }
  return {
    name,
    tag: path === 'player' ? 'Player' : 'Member',
    fields: [
      ['Team', team],
      ['Class', d.grad ? `${classOf(d.grad, now)} · ’${String(d.grad).slice(2)}` : ''],
      ['Handicap', d.hcp != null ? fmtHcp(d.hcp) : ''],
    ],
    band: team || 'GolfHelm Clubhouse',
    photo: d.photoUrl,
  };
}

/** The season printed on the card: fall from July, spring before. */
export const seasonLabel = (now: Date): string => (now.getMonth() >= 6 ? `Fall ${now.getFullYear()}` : `Spring ${now.getFullYear()}`);

/**
 * How many times `v` has changed since this mounted, kept while rendering (React's "information from previous
 * renders" pattern), so nothing waits a frame on an effect.
 */
function useChanges<T>(v: T): number {
  const [s, setS] = useState({ v, n: 0 });
  if (!Object.is(s.v, v)) setS({ v, n: s.n + 1 });
  return Object.is(s.v, v) ? s.n : s.n + 1;
}

/**
 * A value on the card filling in (CH-15621). The first time it is filled it rises into place in brass and dries to
 * ink (the design's 900ms flash). Each change after that, a keystroke or a step of the handicap, wets it again where
 * it stands: the brass holds while the answer is moving and dries once it rests. It never fades from nothing again,
 * never moves under the reader's eye, and never counts.
 */
function Ink({ v }: { v: string }) {
  const n = useChanges(v);
  return (
    <span className="ch-ox-flash" data-wet={n === 0 ? undefined : n % 2}>
      {v}
    </span>
  );
}

/** The coin: an empty silhouette, then the monogram once there is a name, then the photo. Each change settles in. */
function Coin({ name, photo }: { name: string; photo: string | null }) {
  const kind = photo ? 'photo' : name ? 'mono' : 'blank';
  const n = useChanges(kind);
  return (
    <span className="ch-ox-mc__coin" key={kind} data-settle={n === 0 ? undefined : ''}>
      {photo ? (
        <img src={photo} alt="" />
      ) : name ? (
        <Avatar name={name} size={55} />
      ) : (
        <span className="ch-ox-mc__blank">
          <Icon icon={UserRound} size={20} />
        </span>
      )}
    </span>
  );
}

/** `issued` (done and staff done only) plays the one reveal: the card lifted and laid back on the desktop, arriving on the phone, then the seal (CH-15623). */
export function MemberCard({ face, issued, season }: { face: CardFace; issued: boolean; season: string }) {
  const label = `GolfHelm member card${face.name ? ` for ${face.name}` : ''}`;
  return (
    <div className="ch-ox-mcw" data-issued={issued ? '' : undefined}>
      {issued && (
        <div className="ch-ox-mc__stamp" aria-hidden="true">
          {/* P015 D5: it reads "Member since 2026", in that order. */}
          <span>
            Member since<b>{season.slice(-4)}</b>
          </span>
        </div>
      )}
      <div className="ch-ox-mc" role="img" aria-label={label}>
        <span className="ch-ox-mc__rose" aria-hidden="true" />
        <img className="ch-ox-mc__wm" src={MARK} alt="" aria-hidden="true" />
        <div className="ch-ox-mc__top">
          <span className="ch-ox-mc__brand">
            <img src={MARK} alt="" width={26} height={26} />
            GolfHelm
          </span>
          <span className="ch-ox-mc__tag" key={face.tag}>
            <span className="ch-ox-flash">{face.tag}</span>
          </span>
        </div>
        <div className="ch-ox-mc__who">
          <Coin name={face.name} photo={face.photo} />
          <span className="ch-ox-mc__name" data-blank={face.name ? undefined : ''} key={face.name ? 'n' : 'b'}>
            {face.name ? <Ink v={face.name} /> : 'Your name'}
          </span>
        </div>
        <div className="ch-ox-mc__f">
          {face.fields.map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <b data-blank={v ? undefined : ''} key={v ? 'v' : '-'}>
                {v ? <Ink v={v} /> : '—'}
              </b>
            </div>
          ))}
        </div>
        <div className="ch-ox-mc__band">
          <span>{face.band}</span>
          <span>{season}</span>
        </div>
      </div>
    </div>
  );
}
