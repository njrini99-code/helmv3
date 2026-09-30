'use client';

import { UserRound } from 'lucide-react';
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

export function MemberCard({ face, issued, season }: { face: CardFace; issued: boolean; season: string }) {
  const label = `GolfHelm member card${face.name ? ` for ${face.name}` : ''}`;
  return (
    <div className="ch-ox-mcw" data-issued={issued ? '' : undefined}>
      {issued && (
        <div className="ch-ox-mc__stamp" aria-hidden="true">
          <span>
            Member<b>{season.slice(-4)}</b>since
          </span>
        </div>
      )}
      <div className="ch-ox-mc" role="img" aria-label={label}>
        <span className="ch-ox-mc__rose" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static mark, drawn as a watermark */}
        <img className="ch-ox-mc__wm" src={MARK} alt="" aria-hidden="true" />
        <div className="ch-ox-mc__top">
          <span className="ch-ox-mc__brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- a small static mark */}
            <img src={MARK} alt="" width={26} height={26} />
            GolfHelm
          </span>
          <span className="ch-ox-mc__tag" key={face.tag}>
            <span className="ch-ox-flash">{face.tag}</span>
          </span>
        </div>
        <div className="ch-ox-mc__who">
          <span className="ch-ox-mc__coin">
            {face.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- the player's own upload, a public avatar URL
              <img src={face.photo} alt="" />
            ) : face.name ? (
              <Avatar name={face.name} size={55} />
            ) : (
              <span className="ch-ox-mc__blank">
                <Icon icon={UserRound} size={20} />
              </span>
            )}
          </span>
          <span className="ch-ox-mc__name" data-blank={face.name ? undefined : ''} key={face.name ? 'n' : 'b'}>
            {face.name ? <span className="ch-ox-flash">{face.name}</span> : 'Your name'}
          </span>
        </div>
        <div className="ch-ox-mc__f">
          {face.fields.map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <b data-blank={v ? undefined : ''} key={v || '-'}>
                {v ? <span className="ch-ox-flash">{v}</span> : '—'}
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
