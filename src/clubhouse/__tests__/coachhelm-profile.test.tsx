import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The genome (once the Game profile, P013 ?view=profile) as Standing's "How you play" draws it (CH-13915): the shapers, the loader,
 * and every numbered state of the section. Game profile folded into Standing (design call, Nav); its old address lands there.
 */

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
import { loadPlayerGame } from '../data/coachhelm-profile';
import { LABEL_TONE, STANDING_DRAWS, toChGame, toChProfile, toMeasure } from '../data/coachhelm-profile-shape';
import { Standing } from '../screens/coachhelm/views/Standing';
import {
  gameLoad,
  PREVIEW_GAME,
  PREVIEW_GAME_EDGE,
  PREVIEW_GAME_EMPTY,
  PREVIEW_GAME_PARTIAL,
  PREVIEW_PROFILE,
  PREVIEW_PROFILE_EDGE,
  PREVIEW_PROFILE_EMPTY,
  PREVIEW_PROFILE_PARTIAL,
  PREVIEW_STANDING,
  PREVIEW_STANDING_EMPTY,
  standingLoad,
  VIEWS_NOW,
} from '../preview/fixtures-coachhelm-views';
import type { ChGameLoad } from '../data/coachhelm-profile-shape';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <div className="ch-root" data-ui="clubhouse">
      {node}
    </div>
  </LazyMotion>
);
const section = () => screen.getByRole('region', { name: 'How you play' });
const card = (label: string) => within(section()).getByRole('heading', { name: label }).closest('li') as HTMLElement;

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
    expect(by.scrambling_rate).toMatchObject({ headline: 'Reliable', figure: '35%' });
    expect(by.par3_proficiency).toMatchObject({ figure: '−0.84', figureNote: 'strokes to par per par 3' });
    expect(by.scoring_trend).toMatchObject({ headline: 'Improving', figure: '−0.64' });
    expect(by.driver_usage).toMatchObject({ headline: 'Mixed', figure: '62%' });
  });

  it('the radar-normalised 0 to 100 score is never in what the screen is given (Fairway retired it as a grade with no baseline)', () => {
    for (const m of PREVIEW_PROFILE.measures) expect(Object.keys(m).sort()).toEqual(['bound', 'category', 'figure', 'figureNote', 'floor', 'headline', 'id', 'label', 'locked', 'meaning', 'measured', 'pos', 'read', 'scale', 'stance', 'tone']);
    expect(JSON.stringify(PREVIEW_PROFILE)).not.toMatch(/"(norm|radar|score)\w*":/i);
  });

  it('the persona’s strengths and watch-outs are its own (derivePersona), and mark the measures they name', () => {
    expect(PREVIEW_PROFILE.strengths.map((s) => s.id)).toEqual(['par3_proficiency']);
    expect(PREVIEW_PROFILE.watchouts).toEqual([]);
    expect(PREVIEW_PROFILE.measures.find((m) => m.id === 'par3_proficiency')!.stance).toBe('strength');
    // Driver usage is a profile, not a grade: never a strength, whatever its value.
    expect(PREVIEW_PROFILE.measures.find((m) => m.id === 'driver_usage')!.stance).toBeNull();
    expect(PREVIEW_PROFILE.courseProfile).toBe('Mixed off the tee · thrives on par-3 holes · tendency to miss left.');
  });

  it('a measure is coloured by the persona’s call, else by the verdict in its own word; a bias and a profile are plain', () => {
    const tone = Object.fromEntries(PREVIEW_PROFILE.measures.map((m) => [m.id, m.tone]));
    expect(tone).toEqual({ miss_side_bias: 'plain', pressure_delta: 'warn', scrambling_rate: 'plain', par3_proficiency: 'good', back_nine_delta: 'warn', scoring_trend: 'good', driver_usage: 'plain' });
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

describe('How you play: the part of the genome Standing does not already draw', () => {
  it('leaves out the measures Standing’s own rows draw (scrambling, par 3s, pressure), so no stat is drawn twice with two numbers', () => {
    expect([...STANDING_DRAWS].sort()).toEqual(['par3_proficiency', 'pressure_delta', 'scrambling_rate']);
    expect(PREVIEW_GAME.measures.map((m) => m.id)).toEqual(['miss_side_bias', 'back_nine_delta', 'scoring_trend', 'driver_usage']);
    // Each kept measure is the profile's own, unchanged.
    for (const m of PREVIEW_GAME.measures) expect(m).toEqual(PREVIEW_PROFILE.measures.find((x) => x.id === m.id));
    expect(PREVIEW_GAME).toMatchObject({ state: 'full', ready: 4, windowDays: 90, rounds: 14, refreshed: 'yesterday', courseProfile: PREVIEW_PROFILE.courseProfile });
  });

  it('its state and count are over the measures it draws', () => {
    expect(PREVIEW_GAME_PARTIAL).toMatchObject({ state: 'partial', ready: 2, rounds: 6 });
    expect(PREVIEW_GAME_EMPTY).toMatchObject({ state: 'empty', ready: 0, rounds: null, refreshed: null, courseProfile: null });
    // Only a measure Standing draws itself is read: nothing here is ready, so it is the empty state.
    const onlyDrawn = toChGame({ player_id: 'p', vector: { par3_proficiency: { value: -0.4, confidence: 1, label: 'Under par' } }, computed_at: '2026-09-30T02:30:00Z', rounds_basis: 4 }, VIEWS_NOW);
    expect(onlyDrawn).toMatchObject({ state: 'empty', ready: 0 });
  });

  it('a coach’s is about the player, never “you”', () => {
    const coach = toChGame({ player_id: 'p', vector: { back_nine_delta: { value: 0.3, confidence: 0.8, label: 'Fades late' } }, computed_at: '2026-09-30T02:30:00Z', rounds_basis: 6 }, VIEWS_NOW, { role: 'coach', first: 'Jonah' });
    expect(JSON.stringify(coach)).not.toMatch(/\byour?\b/i);
  });
});

describe('the loader reads the player’s own genome through the session’s client, and says when it could not', () => {
  it('ready: the row the session client reads, for the player id it was given, and nothing else (no insight read, so nothing counts as shown)', async () => {
    genomeRead.load.mockResolvedValue({ player_id: 'pl-jonah', vector: { back_nine_delta: { value: 0.31, confidence: 1, label: 'Fades late' } }, computed_at: '2026-09-30T02:30:00Z', rounds_basis: 9 });
    const out = await loadPlayerGame({ playerId: 'pl-jonah' });
    expect(genomeRead.load).toHaveBeenCalledWith(sessionClient, 'pl-jonah');
    expect(genomeRead.load).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ status: 'ready', data: { state: 'partial', ready: 1, rounds: 9 } });
  });

  it('no row yet (or one with nothing computed) is the first-run state, never a failure', async () => {
    genomeRead.load.mockResolvedValue(null);
    const out = await loadPlayerGame({ playerId: 'pl-jonah' });
    expect(out).toMatchObject({ status: 'ready', data: { state: 'empty' } });
    expect(logServer).not.toHaveBeenCalled();
  });

  it('CH-13260 a read that throws is the failed state, logged through chLogServer, never the first run', async () => {
    genomeRead.load.mockRejectedValue(new Error('loadGenome(pl-jonah): boom'));
    const out = await loadPlayerGame({ playerId: 'pl-jonah' });
    expect(out).toEqual({ status: 'failed' });
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'profile.genome', expect.any(Error), 'coachhelm');
  });
});

describe('Standing’s How you play section', () => {
  const show = (game: ChGameLoad = gameLoad(PREVIEW_GAME), at?: 'game') => render(wrap(<Standing load={standingLoad(PREVIEW_STANDING)} game={game} at={at} />));

  it('CH-13915 a labelled section after the stats: the persona’s sentence, its window, then each measure Standing has no row for', () => {
    show();
    const s = section();
    expect(s.id).toBe('how-you-play');
    expect(code('CH-13915')).toBe(s);
    // After every stat group: the last group's region comes before it in the page.
    const groups = screen.getAllByRole('region').filter((r) => r.classList.contains('ch-hs-g'));
    expect(groups.at(-1)!.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(s).getByText((t) => t.replace(/\u00a0/g, ' ') === 'Mixed off the tee · thrives on par-3 holes · tendency to miss left.')).toBeTruthy();
    expect(within(s).getByText('Last 90 days · 14 rounds · Refreshed yesterday').textContent).toBe('Last 90 days\u00a0· 14 rounds\u00a0· Refreshed yesterday');
    expect(within(s).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Miss-side bias', 'Back-9 stamina', 'Scoring trend', 'Driver usage']);
    // The Game profile's duplicates are gone: no "What CoachHelm sees" board, no Strong / Worth watching list, no second scrambling.
    expect(screen.queryByText('What CoachHelm sees')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Strong' })).toBeNull();
    expect(within(s).queryByRole('heading', { name: 'Scrambling rate' })).toBeNull();
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
    // The figure and the words carry every number: the scale is decoration.
    expect(c.querySelector('.ch-hg-sc__t')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('a bound says so in words on the card', () => {
    show(gameLoad(PREVIEW_GAME_EDGE));
    expect(within(card('Back-9 stamina')).getByText(/edge of the scale, so the real gap may be larger/)).toBeTruthy();
  });

  it('CH-13361 an early read: how many of its measures are ready, and the locked ones say what they need and draw nothing as if known', () => {
    show(gameLoad(PREVIEW_GAME_PARTIAL));
    expect(code('CH-13361')!.textContent).toBe('2 of 4 measures have enough rounds so far. The rest fill in as you post more; none is estimated in the meantime.');
    const locked = card('Miss-side bias');
    expect(within(locked).getByText('Needs more rounds')).toBeTruthy();
    expect(locked.querySelector('.ch-hg-sc')).toBeNull();
    expect(within(section()).getByRole('heading', { name: /Still filling in/ }).textContent).toBe('Still filling in 2');
  });

  it('CH-13360 nothing computed yet: one line on how it fills in, and what each measure will read and needs; no second Start a round', () => {
    show(gameLoad(PREVIEW_GAME_EMPTY));
    expect(code('CH-13360')!.textContent).toMatch(/^Starts with a few rounds\. CoachHelm reads how you play.*Nothing is estimated before then\.$/);
    expect(section().querySelectorAll('.ch-hg-m.is-locked')).toHaveLength(4);
    expect(within(section()).queryByRole('link')).toBeNull();
  });

  it('CH-13260 a section that did not load says so in place, with Try again; the rest of Standing stands', async () => {
    show({ status: 'failed' });
    expect(code('CH-13260')!.textContent).toMatch(/How you play didn’t load.*The stats above are not affected/);
    expect(code('CH-13360')).toBeNull();
    expect(screen.getByRole('region', { name: 'Where strokes go' })).toBeTruthy();
    await userEvent.click(within(code('CH-13260') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('with no stats yet the page is its empty state, and the section is drawn under it only once a measure has a read', () => {
    render(wrap(<Standing load={standingLoad(PREVIEW_STANDING_EMPTY)} game={gameLoad(PREVIEW_GAME_EMPTY)} />));
    expect(code('CH-13370')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'How you play' })).toBeNull();
    cleanup();
    render(wrap(<Standing load={standingLoad(PREVIEW_STANDING_EMPTY)} game={gameLoad(PREVIEW_GAME_PARTIAL)} />));
    expect(section()).toBeTruthy();
    cleanup();
    // A failed read is said under the empty state, never left out as if there were nothing to read.
    render(wrap(<Standing load={standingLoad(PREVIEW_STANDING_EMPTY)} game={{ status: 'failed' }} />));
    expect(code('CH-13370')).not.toBeNull();
    expect(code('CH-13260')).not.toBeNull();
  });

  it('CH-13913 Game profile’s old address opens Standing at How you play, once and without animation; any other address does not move', () => {
    const into = vi.fn();
    const was = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = into;
    try {
      show(gameLoad(PREVIEW_GAME), 'game');
      expect(into).toHaveBeenCalledTimes(1);
      expect(into.mock.instances[0]).toBe(section());
      expect(into).toHaveBeenCalledWith({ block: 'start' });
      cleanup();
      into.mockClear();
      show();
      expect(into).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = was;
    }
  });

  it('Keep reading: the Deep dive only, since how you play is on this page now', () => {
    show();
    const next = screen.getByRole('heading', { name: 'Keep reading' }).closest('aside') as HTMLElement;
    expect(within(next).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/golf/dashboard/coachhelm?view=deep-dive']);
    expect(next.textContent).not.toContain('Game profile');
  });
});
