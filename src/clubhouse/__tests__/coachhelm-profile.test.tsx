import { LazyMotion, domAnimation } from 'framer-motion';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The player's Game profile (P013, ?view=profile): the genome as the screen draws it, the loader, and every numbered state. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
const phoneState = vi.hoisted(() => ({ on: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => phoneState.on, CH_PHONE_QUERY: '(max-width: 820px)' }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const sessionClient = vi.hoisted(() => ({ marker: 'the session client' }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => sessionClient }));
const genomeRead = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/genome/loader', () => ({ loadGenome: genomeRead.load }));

import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import { loadPlayerProfile } from '../data/coachhelm-profile';
import { LABEL_TONE, toChProfile, toMeasure } from '../data/coachhelm-profile-shape';
import { Profile } from '../screens/coachhelm/views/Profile';
import { ProfileSkeleton } from '../screens/coachhelm/views/Skeletons';
import {
  PREVIEW_PROFILE,
  PREVIEW_PROFILE_EDGE,
  PREVIEW_PROFILE_EMPTY,
  PREVIEW_PROFILE_PARTIAL,
  profileLoad,
  VIEWS_NOW,
} from '../preview/fixtures-coachhelm-views';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <div className="ch-root" data-ui="clubhouse">
      {node}
    </div>
  </LazyMotion>
);
const card = (label: string) => within(screen.getByRole('region', { name: 'Every measure' })).getByRole('heading', { name: label }).closest('li') as HTMLElement;

beforeEach(() => {
  phoneState.on = false;
  router.push.mockClear();
  router.refresh.mockClear();
  hapticSpy.mockClear();
  logServer.mockClear();
  genomeRead.load.mockReset();
});
afterEach(cleanup);

describe('the genome as the profile draws it', () => {
  it('every registered measure is on the page, in the registry’s order, with its own value in its own unit', () => {
    expect(PREVIEW_PROFILE.measures.map((m) => m.id)).toEqual(GENOME_DIMENSIONS.map((d) => d.id));
    const by = Object.fromEntries(PREVIEW_PROFILE.measures.map((m) => [m.id, m]));
    expect(by.miss_side_bias).toMatchObject({ headline: 'Left bias', figure: '71% left', figureNote: 'of the misses that name a side (29% right)' });
    expect(by.pressure_delta).toMatchObject({ headline: 'Tightens up', figure: '+0.82', figureNote: 'strokes per 18 holes, tournaments against practice' });
    expect(by.scrambling_rate).toMatchObject({ headline: 'Wizard', figure: '44%' });
    expect(by.par3_proficiency).toMatchObject({ figure: '−0.38', figureNote: 'strokes to par per par 3' });
    expect(by.scoring_trend).toMatchObject({ headline: 'Improving', figure: '−0.64' });
    expect(by.driver_usage).toMatchObject({ headline: 'Mixed', figure: '62%' });
  });

  it('the radar-normalised 0 to 100 score is never in what the screen is given (Fairway retired it as a grade with no baseline)', () => {
    for (const m of PREVIEW_PROFILE.measures) expect(Object.keys(m).sort()).toEqual(['bound', 'category', 'figure', 'figureNote', 'floor', 'headline', 'id', 'label', 'locked', 'meaning', 'measured', 'pos', 'read', 'scale', 'stance', 'tone']);
    expect(JSON.stringify(PREVIEW_PROFILE)).not.toMatch(/"(norm|radar|score)\w*":/i);
  });

  it('the persona’s strengths and watch-outs are its own (derivePersona), and mark the measures they name', () => {
    expect(PREVIEW_PROFILE.strengths.map((s) => s.id)).toEqual(['driver_usage']);
    expect(PREVIEW_PROFILE.watchouts).toEqual([]);
    expect(PREVIEW_PROFILE.measures.find((m) => m.id === 'driver_usage')!.stance).toBe('strength');
    expect(PREVIEW_PROFILE.courseProfile).toBe('Mixed off the tee · holds steady on par-3 holes · tendency to miss left.');
  });

  it('a measure is coloured by the persona’s call, else by the verdict in its own word; a bias and a profile are plain', () => {
    const tone = Object.fromEntries(PREVIEW_PROFILE.measures.map((m) => [m.id, m.tone]));
    expect(tone).toEqual({ miss_side_bias: 'plain', pressure_delta: 'warn', scrambling_rate: 'good', par3_proficiency: 'good', back_nine_delta: 'warn', scoring_trend: 'good', driver_usage: 'good' });
  });

  it('every word the tone list names is a word a dimension can give (the dimension files are read, so a rename cannot drop one silently)', () => {
    const src = ['miss-side-bias', 'pressure-delta', 'scrambling-rate', 'par3-proficiency', 'back-nine-delta', 'scoring-trend', 'driver-usage']
      .map((f) => readFileSync(`src/lib/coachhelm/v3/genome/dimensions/${f}.ts`, 'utf8'))
      .join('\n');
    for (const word of Object.keys(LABEL_TONE)) expect(src, word).toContain(`'${word}'`);
  });

  it('a value at the end of the scale it is clamped to is a bound, not a measurement', () => {
    const by = Object.fromEntries(PREVIEW_PROFILE_EDGE.measures.map((m) => [m.id, m]));
    expect(by.pressure_delta!.bound).toMatch(/edge of the scale/);
    expect(by.back_nine_delta!.bound).toMatch(/edge of the scale/);
    expect(by.scrambling_rate!.bound).toBeNull();
    expect(by.back_nine_delta).toMatchObject({ figure: '−2.00', pos: 0 });
  });

  it('a measure with nothing computed is locked: no word, no figure, no marker, and what it needs', () => {
    const by = Object.fromEntries(PREVIEW_PROFILE_PARTIAL.measures.map((m) => [m.id, m]));
    expect(by.pressure_delta).toMatchObject({ locked: true, headline: null, figure: null, pos: null, read: null, stance: null, floor: 'At least 4 tournament or qualifier rounds and 4 practice rounds in the window.' });
    expect(PREVIEW_PROFILE_PARTIAL).toMatchObject({ state: 'partial', ready: 4, rounds: 6 });
    expect(PREVIEW_PROFILE).toMatchObject({ state: 'full', ready: 7, windowDays: 90, rounds: 14 });
    expect(PREVIEW_PROFILE_EMPTY).toMatchObject({ state: 'empty', ready: 0, rounds: null, refreshed: null, courseProfile: null });
  });

  it('a value that is not a number is locked, not drawn', () => {
    expect(toMeasure('par3_proficiency', 'Par-3 proficiency', { value: 'n/a', confidence: 1, label: 'Even' }, null)).toMatchObject({ locked: true, figure: null });
  });

  it('a measure the registry gains with no copy here is drawn with its name and its own word, and no number, scale or claim', () => {
    const m = toMeasure('new_thing', 'New thing', { value: 0.4, confidence: 0.8, label: 'Fancy' }, null);
    expect(m).toMatchObject({ locked: false, label: 'New thing', headline: 'Fancy', figure: null, scale: null, pos: null, meaning: null, measured: null, floor: null, tone: 'plain' });
  });

  it('the confidence read is in the canonical words, with no sample size the genome does not store', () => {
    const by = Object.fromEntries(PREVIEW_PROFILE.measures.map((m) => [m.id, m.read]));
    expect(by.miss_side_bias).toEqual({ level: 3, word: 'Solid read' });
    expect(by.pressure_delta).toEqual({ level: 2, word: 'Early read' });
    expect(by.scoring_trend).toEqual({ level: 1, word: 'Thin read' });
  });

  it('"refreshed" is the genome’s own computed_at in UTC, and null when the row has none', () => {
    expect(PREVIEW_PROFILE.refreshed).toBe('yesterday');
    expect(toChProfile({ player_id: 'p', vector: { par3_proficiency: { value: 0, confidence: 1, label: 'Even' } }, computed_at: null as unknown as string, rounds_basis: 3 }, VIEWS_NOW).refreshed).toBeNull();
  });
});

describe('the loader reads the player’s own genome through the session’s client, and says when it could not', () => {
  it('ready: the row the session client reads, for the player id it was given', async () => {
    genomeRead.load.mockResolvedValue({ player_id: 'pl-jonah', vector: { par3_proficiency: { value: -0.38, confidence: 1, label: 'Under par' } }, computed_at: '2026-09-30T02:30:00Z', rounds_basis: 9 });
    const out = await loadPlayerProfile({ playerId: 'pl-jonah' });
    expect(genomeRead.load).toHaveBeenCalledWith(sessionClient, 'pl-jonah');
    expect(out.status).toBe('ready');
    if (out.status !== 'ready') return;
    expect(out.data).toMatchObject({ state: 'partial', ready: 1, rounds: 9 });
  });

  it('no row yet (or one with nothing computed) is the first-run state, never a failure', async () => {
    genomeRead.load.mockResolvedValue(null);
    const out = await loadPlayerProfile({ playerId: 'pl-jonah' });
    expect(out).toMatchObject({ status: 'ready', data: { state: 'empty' } });
    expect(logServer).not.toHaveBeenCalled();
  });

  it('CH-13260 a read that throws is the failed state, logged through chLogServer, never the first run', async () => {
    genomeRead.load.mockRejectedValue(new Error('loadGenome(pl-jonah): boom'));
    const out = await loadPlayerProfile({ playerId: 'pl-jonah' });
    expect(out).toEqual({ status: 'failed' });
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'profile.genome', expect.any(Error), 'coachhelm');
  });
});

describe('the Game profile screen', () => {
  const show = (load = profileLoad(PREVIEW_PROFILE)) => render(wrap(<Profile load={load} />));

  it('CH-13860 the page is labelled by CoachHelm; the shape of the game, then every measure, are labelled regions', () => {
    show();
    expect(screen.getByRole('main').getAttribute('aria-labelledby')).toBe('ch-hl-title');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('CoachHelm');
    expect(screen.getByRole('region', { name: 'Mixed off the tee · holds steady on par-3 holes · tendency to miss left.' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Every measure' })).toBeTruthy();
    expect(screen.getByText('Last 90 days · 14 rounds · Refreshed yesterday')).toBeTruthy();
  });

  it('each measure: its word, its value with what it counts, what it means, how sure the read is, and how it is measured', () => {
    show();
    const c = card('Back-9 stamina');
    expect(c.querySelector('.ch-hg-m__word')!.textContent).toBe('Fades late');
    expect(within(c).getByText('+0.31').textContent).toBe('+0.31');
    expect(within(c).getByText('strokes per hole, back nine against front nine')).toBeTruthy();
    expect(within(c).getByText('Whether your scoring holds up over the round.')).toBeTruthy();
    expect(within(c).getByText('Solid read')).toBeTruthy();
    const how = within(c).getByText('How it is measured').closest('details') as HTMLDetailsElement;
    expect(how.open).toBe(false);
    expect(how.textContent).toContain('Average score to par on holes 10 to 18 minus holes 1 to 9.');
    expect(how.textContent).toContain('At least 5 rounds in the window.');
  });

  it('the figure and the words carry every number: the scale is decoration, hidden from assistive tech', () => {
    show();
    const c = card('Pressure delta');
    expect(c.querySelector('.ch-hg-sc__t')!.getAttribute('aria-hidden')).toBe('true');
    expect(c.querySelector('.ch-hg-sc__e')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('the persona’s call is a word as well as a colour: Strength on the measure it names, and Strong in the shape of the game', () => {
    show();
    expect(within(card('Driver usage')).getByText('Strength')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Strong' })).getByText('Driver usage')).toBeTruthy();
    expect(within(card('Scrambling rate')).queryByText('Strength')).toBeNull();
  });

  it('a bound says so in words on the card', () => {
    show(profileLoad(PREVIEW_PROFILE_EDGE));
    expect(within(card('Pressure delta')).getByText(/edge of the scale, so the real gap may be larger/)).toBeTruthy();
  });

  it('CH-13361 an early read: how many measures are ready, and the locked ones say what they need and draw nothing as if it were known', () => {
    show(profileLoad(PREVIEW_PROFILE_PARTIAL));
    expect(code('CH-13361')!.textContent).toBe('4 of 7 measures have enough rounds so far. The rest fill in as you post more; none is estimated in the meantime.');
    const locked = card('Pressure delta');
    expect(within(locked).getByText('Needs more rounds')).toBeTruthy();
    expect(locked.textContent).toContain('Reads from at least 4 tournament or qualifier rounds and 4 practice rounds in the window.');
    expect(locked.querySelector('.ch-hg-sc')).toBeNull();
    expect(within(locked).queryByText(/read$/)).toBeNull();
  });

  it('CH-13360 nothing computed yet: the first-run page with one action, and what each measure will read and needs', () => {
    show(profileLoad(PREVIEW_PROFILE_EMPTY));
    expect(code('CH-13360')!.textContent).toMatch(/Your game profile starts with a few rounds.*Nothing is estimated before then/);
    const start = within(code('CH-13360') as HTMLElement).getByRole('link', { name: 'Start a round' });
    expect(start.getAttribute('href')).toBe('/golf/dashboard/rounds/new');
    expect(screen.getByRole('region', { name: 'What it will read' })).toBeTruthy();
    expect(document.querySelectorAll('.ch-hg-m.is-locked')).toHaveLength(7);
    expect(screen.queryByText('Your game')).toBeNull();
  });

  it('CH-13260 a profile that did not load says so, with Try again (asks the server again), never the first run', async () => {
    show({ status: 'failed' });
    expect(code('CH-13260')!.textContent).toMatch(/Your game profile didn’t load.*Nothing is lost/);
    expect(code('CH-13360')).toBeNull();
    await userEvent.click(within(code('CH-13260') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('CH-13304 CoachHelm off for them: the board’s own page, in the coach’s words, and no sub-navigation to lead anywhere', () => {
    show({ status: 'off', reason: 'Back after the qualifier' });
    expect(code('CH-13304')!.textContent).toMatch(/CoachHelm is off for your team.*Your coach turned it off: “Back after the qualifier”/);
    expect(code('CH-13930')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('Keep reading: Standing and Deep dive, as links', () => {
    show();
    const next = screen.getByRole('heading', { name: 'Keep reading' }).closest('li') as HTMLElement;
    expect(within(next).getByRole('link', { name: /Standing/ }).getAttribute('href')).toBe('/golf/dashboard/coachhelm?view=standing');
    expect(within(next).getByRole('link', { name: /Deep dive/ }).getAttribute('href')).toBe('/golf/dashboard/coachhelm?view=deep-dive');
  });

  it('CH-13460 loading: the page’s own shape, busy and named, with the sub-navigation’s place held', () => {
    render(wrap(<ProfileSkeleton />));
    const main = screen.getByRole('main', { name: 'Loading your game profile' });
    expect(main.getAttribute('aria-busy')).toBe('true');
    expect(code('CH-13460')).not.toBeNull();
    expect(main.querySelector('.ch-hv-sk-tabs')).not.toBeNull();
    expect(main.querySelectorAll('.ch-hg-sk__m').length).toBeGreaterThanOrEqual(6);
  });

  it('on the phone it is its own layout: the same page with the top bar, and the views as chips that scroll sideways', () => {
    phoneState.on = true;
    show();
    expect(document.querySelector('.ch-hl.is-phone')).not.toBeNull();
    expect(document.querySelector('.ch-hv-tabs.is-phone .ch-hv-chips')).not.toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
