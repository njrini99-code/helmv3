'use client';

import { useMemo } from 'react';
import type { Draft } from '../screens/onboard/flow';
import { PLAN, type OnboardStep } from '../screens/onboard/logic';
import { Onboard } from '../screens/onboard/Onboard';
import { OnboardWritesContext, type OnboardWrites } from '../screens/onboard/writes-context';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A player partway through, and an assistant with a staff code: the design's own sample people, on a sample team. */
const THEO: Partial<Draft> = { intent: 'code', code: 'K7PQX4MN', kind: 'roster', teamName: 'Varsity Golf', first: 'Theo', last: 'Marchetti', grad: 2027, email: 'theo.marchetti@university.edu', hcp: -1.8, city: 'Austin', state: 'TX' };
const DANA: Partial<Draft> = { intent: 'code', code: 'S4VN8QRT', kind: 'staff', teamName: null, first: 'Dana', last: 'Whitfield', email: 'd.whitfield@university.edu' };
const JORDAN: Partial<Draft> = { intent: 'request', req: { who: 'ad', first: 'Jordan', last: 'Ellis', school: 'Oakmont University', coach: '', email: 'j.ellis@oakmont.edu', note: '' } };

/** What each step starts with, so the member card shows what the answers before it would have filled in. */
function seedFor(step: OnboardStep, who: string | undefined): Partial<Draft> {
  if (step === 'rwho') return { intent: 'request' };
  if (step === 'rdetails') return { ...JORDAN, req: { ...JORDAN.req!, email: '' } };
  if (step === 'sent') return JORDAN;
  if (who === 'staff' || step === 'staffdone') {
    const after = step === 'staffdone';
    return { ...DANA, ...(step === 'name' ? { first: '', last: '' } : {}), ...(step === 'account' ? { email: '' } : {}), accountMade: after };
  }
  if (step === 'intro') return who === 'invite' ? { code: 'K7PQX4MN' } : {};
  if (step === 'code') return who === 'matched' ? { intent: 'code', code: 'K7PQX4MN', kind: 'roster', teamName: 'Varsity Golf' } : { intent: 'code' };
  const plan = PLAN.player;
  const i = plan.indexOf(step);
  const blank: Partial<Draft> = {};
  if (i <= plan.indexOf('name')) Object.assign(blank, { first: '', last: '' });
  if (i <= plan.indexOf('grad')) Object.assign(blank, { grad: null });
  if (i <= plan.indexOf('account')) Object.assign(blank, { email: '', hcp: null, city: '', state: '' });
  const after = i > plan.indexOf('account');
  return { ...THEO, ...blank, accountMade: after, ...(step === 'done' ? { joinedTeam: who !== 'joinfail' } : {}) };
}

/** The server calls, faked: `sim` makes the one it names fail the way the design draws it. */
function fakeWrites(sim: string | undefined): OnboardWrites {
  return {
    async checkCode(code) {
      await wait(700);
      if (sim === 'network') return { kind: 'net' };
      if (code === 'K7PQX4MN') return { kind: 'ok', code: 'roster', teamName: 'Varsity Golf' };
      if (code === 'S4VN8QRT') return { kind: 'ok', code: 'staff', teamName: null };
      return { kind: 'bad' };
    },
    async createAccount(input) {
      await wait(900);
      if (sim === 'exists') return { ok: false, error: 'An account with this email already exists. Please sign in instead.' };
      if (sim === 'network') return { ok: false, error: 'Failed to fetch' };
      if (sim === 'breached') return { ok: false, error: 'Please choose a stronger password — this one is too common or has appeared in a data breach.' };
      return input.kind === 'staff' ? { ok: true, redirectTo: '/golf/dashboard', staffJoined: true } : { ok: true, redirectTo: '/clubhouse-preview/onboard?step=game', staffJoined: false };
    },
    async finishPlayer() {
      await wait(900);
      if (sim === 'network') return { ok: false, error: 'Unable to reach the server. Please check your internet connection and try again.' };
      return { ok: true, joinedTeam: sim !== 'joinfail' };
    },
    async uploadPhoto(file) {
      await wait(700);
      if (sim === 'upload') return { ok: false, error: 'That photo didn’t upload. Try again, or skip it for now.' };
      return { ok: true, url: URL.createObjectURL(file) };
    },
    async sendRequest() {
      await wait(900);
      if (sim === 'network') return { ok: false, error: 'Unable to reach the server. Your details are still here. Check your connection and try again.' };
      return { ok: true };
    },
  };
}

export function PreviewOnboard({ step, who, sim, hour }: { step: OnboardStep; who?: string; sim?: string; hour?: number }) {
  const writes = useMemo(() => fakeWrites(sim), [sim]);
  const seed = useMemo(() => seedFor(step, who), [step, who]);
  return (
    <OnboardWritesContext.Provider value={writes}>
      <Onboard start={step} seed={seed} preview fixedHour={hour} />
    </OnboardWritesContext.Provider>
  );
}
