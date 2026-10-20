import { describe, expect, it } from 'vitest';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { toChDeepInsight } from '../data/coachhelm-dive-shape';
import { toChInsight } from '../data/coachhelm-map';
import { readLines, sampleOf, toChRead } from '../data/coachhelm-read-shape';
import { speak, type ChViewer } from '../data/coachhelm-voice';
import { penalties, PREVIEW_TOUR } from '../preview/fixtures-coachhelm';
import { DIVE_BIG, DIVE_BREAK, DIVE_PENALTIES, DIVE_SLOPE, FULL_INPUTS } from '../preview/fixtures-coachhelm-views';

/** The Read (P013, the player's Deep dive): each insight as four lines, What, Why, Next and When, from fields the row carries. */

const PLAYER: ChViewer = { role: 'player' };
const COACH: ChViewer = { role: 'coach', first: 'Jonah' };
const DRILL = 'Rehearse a downhill-only ladder: start 2 ft below the hole and add a foot at a time, focused on dying the ball into the front of the cup rather than a firm strike.';

/** One row through the dive shaper in a voice, as the loader runs it; `newestRound` marks it out of date when it is older. */
function readOf(raw: EvidenceInsight, viewer: ChViewer = PLAYER, extra: { drillText?: string | null; newestRound?: string | null } = {}) {
  const say = (t: string) => speak(t, viewer);
  const base = toChInsight(raw, { drillText: extra.drillText ?? null, tour: PREVIEW_TOUR, newestRound: extra.newestRound ?? null, viewer });
  return toChDeepInsight(raw, base, FULL_INPUTS, say).read;
}
const lines = (raw: EvidenceInsight, viewer: ChViewer = PLAYER, extra: Parameters<typeof readOf>[2] = {}) => readLines(readOf(raw, viewer, extra), 'Tour', (t) => speak(t, viewer));
const numbers = (t: string) => t.match(/\d+(?:\.\d+)?/g) ?? [];
const withEvidence = (raw: EvidenceInsight, ev: Partial<EvidenceInsight['evidence']>): EvidenceInsight => ({ ...raw, evidence: { ...raw.evidence, ...ev } });

describe('the Read: four lines from what the row carries', () => {
  it('What: the subject, the value with its sample, the comparison by name and the confidence word', () => {
    expect(lines(DIVE_SLOPE, PLAYER, { drillText: DRILL }).what).toBe(
      'Make rate, downhill vs level, same distance: 23 pts gap (75 putts). Compared with no downhill penalty (your level putts 81%, downhill 58%). Solid read.',
    );
    // A college comparison is drawn as the Tour's value for the metric (Q-88), named. The subject is the Board's own label.
    expect(lines(DIVE_BIG).what).toBe('Double Bogey-or-Worse rate: 1.6% of holes (21 rounds). Compared with Tour 2%. Solid read.');
    expect(lines(DIVE_BREAK).what).toBe('Break-direction make % (distance-controlled): 36% made (59 putts). Compared with your right-to-left make % (same band) 51%. Early read.');
  });

  it('What: a count is said only when the stored rate times its sample is that whole number; otherwise the sample as the Board says it', () => {
    const ev = { unit: 'percent' as const, your_value: 18 / 31, your_value_display: '58%', sample_n: 31 };
    expect(sampleOf(ev, '31 putts')).toBe('18 of 31 putts');
    expect(sampleOf({ ...ev, your_value: 58.06451612903226 }, '31 putts')).toBe('18 of 31 putts');
    // Stored rounded, so 0.58 × 31 is not a count: never "18 of 31" made up from it.
    expect(sampleOf({ ...ev, your_value: 0.58 }, '31 putts')).toBe('31 putts');
    // A rate of holes over rounds is not a count of rounds.
    expect(sampleOf({ ...ev, your_value: 0.25, your_value_display: '25%', sample_n: 12 }, '12 rounds')).toBe('12 rounds');
    // A gap in points is not a rate.
    expect(sampleOf({ ...ev, your_value: 23, your_value_display: '23 pts', sample_n: 75 }, '75 putts')).toBe('75 putts');
    expect(sampleOf(ev, '')).toBeNull();
  });

  it('What: a comparison with no name is not said, never a bare number', () => {
    const bare = withEvidence(DIVE_BREAK, { comparison_label: '' });
    expect(readOf(bare).what.benchmark).toBeNull();
    expect(lines(bare).what).not.toMatch(/Compared with/);
  });

  it('What: no stroke figure for a zero or an unestimated row; never "0.0 strokes"', () => {
    // peer_delta at zero (most live rows), a rough estimate (a priority seed), and a measured sg_baseline zero.
    for (const ev of [
      { strokes_impact: 0, strokes_impact_method: 'peer_delta' as const },
      { strokes_impact: 0.8, strokes_impact_method: 'rough_estimate' as const },
      { strokes_impact: 0.8, strokes_impact_method: 'historical_correlation' as const },
      { strokes_impact: 0.04, strokes_impact_method: 'sg_baseline' as const },
      { strokes_impact: Number.NaN, strokes_impact_method: 'sg_baseline' as const },
    ]) {
      const raw = withEvidence(DIVE_BREAK, ev);
      expect(readOf(raw).what.strokes).toBeNull();
      expect(lines(raw).what).not.toMatch(/stroke/);
    }
  });

  it('What: the generator’s own "Projected impact: ~0.00 strokes per round." in the text is never what the line is built from', () => {
    const raw: EvidenceInsight = { ...withEvidence(DIVE_BREAK, { strokes_impact: 0, strokes_impact_method: 'peer_delta' }), content: `${DIVE_BREAK.content} Projected impact: ~0.00 strokes per round.` };
    const all = lines(raw);
    expect(all.what).not.toMatch(/stroke|Projected|0\.00/);
    expect(Object.values(all).join(' ')).not.toMatch(/0\.00/);
  });

  it('What: a measured sg_baseline or peer_delta estimate is said in strokes a round, one decimal', () => {
    const sg = withEvidence(DIVE_BREAK, { strokes_impact: 0.42, strokes_impact_method: 'sg_baseline' });
    expect(readOf(sg).what.strokes).toEqual({ value: '0.4', anchor: null });
    expect(lines(sg).what).toContain('Worth about 0.4 strokes a round.');
    const peer = withEvidence(DIVE_BREAK, { strokes_impact: -0.36, strokes_impact_method: 'peer_delta' });
    expect(lines(peer).what).toContain('Worth about 0.4 strokes a round.');
  });

  it('What: the cascade’s figure names what the gap is closed to, and is the one stroke figure on the read', () => {
    const pen = withEvidence(DIVE_PENALTIES, { strokes_impact: 1.6, strokes_impact_method: 'peer_delta' });
    expect(readOf(pen).what.strokes).toEqual({ value: '0.9', anchor: 'team' });
    expect(lines(pen).what).toContain('Closing the gap to your team’s average is worth about 0.9 strokes a round.');
    expect(lines(pen).what).not.toContain('1.6');
    const read = readOf(pen);
    expect(readLines({ ...read, what: { ...read.what, strokes: { value: '1.4', anchor: 'tour' } } }, 'LPGA Tour').what).toContain('Closing the gap to the LPGA Tour is worth about 1.4 strokes a round.');
  });

  it('Why: a cause seen in the shots is said with its basis and its counts', () => {
    const r = readOf(DIVE_PENALTIES);
    expect(r.why).toEqual({ level: 'observed', basis: 'Measured in your shots', text: 'Most of them come off the tee with the driver, on holes where the trouble is on the right (17 and 6 counted).' });
    expect(lines(DIVE_PENALTIES).why).toBe('Measured in your shots: Most of them come off the tee with the driver, on holes where the trouble is on the right (17 and 6 counted).');
  });

  it('Why: a cause inferred from the numbers is marked Likely, not measured, never as fact', () => {
    const r = readOf(DIVE_SLOPE);
    expect(r.why.level).toBe('hypothesis');
    expect(r.why.basis).toBe('Likely, not measured');
    expect(r.why.text).toMatch(/\(31 and 44 counted\)\.$/);
  });

  it('Why: no stated cause is not traced yet, with no mechanism made up', () => {
    for (const raw of [DIVE_BIG, DIVE_BREAK, withEvidence(DIVE_SLOPE, { diagnosis: { ...DIVE_SLOPE.evidence.diagnosis!, root_cause: '  ' } })]) {
      expect(readOf(raw).why).toEqual({ level: null, basis: null, text: 'Not traced yet: the record does not say why.' });
    }
  });

  it('Next: the attached drill, or the row’s own action; the generator’s placeholder action is no next step', () => {
    expect(readOf(DIVE_SLOPE, PLAYER, { drillText: DRILL }).next).toMatchObject({ drill: 'Downhill ladder', meta: '12 min · intermediate', none: null });
    expect(lines(DIVE_SLOPE, PLAYER, { drillText: DRILL }).next).toMatch(/^Downhill ladder · 12 min · intermediate\. Rehearse a downhill-only ladder/);
    expect(readOf(DIVE_PENALTIES).next).toEqual({ drill: null, meta: null, text: 'Play to the wide side off the tee', none: null });
    // "Target penalties per round in the next practice block" (generator-base.ts) is filler: the line says no drill.
    const filler = penalties('pl-jonah');
    expect(filler.evidence.diagnosis?.recommended_action).toMatch(/^Target .+ in the next practice block$/);
    expect(readOf(filler).next).toEqual({ drill: null, meta: null, text: null, none: 'No drill assigned.' });
    expect(lines(filler).next).toBe('No drill assigned.');
  });

  it('When: through the newest round listed under the read, else the window’s end, else the as-of day, else a dash', () => {
    expect(lines(DIVE_PENALTIES).when).toBe('Through Sep 28.');
    const unlisted = withEvidence(DIVE_SLOPE, { source_round_ids: [] });
    expect(lines(unlisted).when).toBe('Through Oct 1.');
    const refreshed: EvidenceInsight = { ...DIVE_BREAK, metadata: { last_refreshed_at: '2026-09-30T08:00:00Z' } };
    expect(lines(refreshed).when).toBe('As of Sep 30.');
    expect(lines(DIVE_BREAK).when).toBe('—');
  });

  it('When: a read older than the newest round is Out of date, in the words the page already uses', () => {
    const old: EvidenceInsight = { ...DIVE_PENALTIES, metadata: { last_refreshed_at: '2026-09-29T08:00:00Z' } };
    expect(readOf(old, PLAYER, { newestRound: '2026-10-03' }).when.stale).toBe('Out of date: a round played Oct 3 isn’t in this read yet, so it may not match the rounds posted since.');
    expect(lines(old, PLAYER, { newestRound: '2026-10-03' }).when).toBe('Through Sep 28. Out of date: a round played Oct 3 isn’t in this read yet, so it may not match the rounds posted since.');
    expect(readOf(old, PLAYER, { newestRound: '2026-09-28' }).when.stale).toBeNull();
  });

  it('the coach’s rendering has the same numbers in every line, about the player by first name', () => {
    for (const raw of [DIVE_SLOPE, DIVE_PENALTIES, DIVE_BREAK, DIVE_BIG]) {
      const extra = { drillText: raw === DIVE_SLOPE ? DRILL : null, newestRound: '2026-10-03' };
      const you = lines({ ...raw, metadata: { ...raw.metadata, last_refreshed_at: '2026-09-29' } }, PLAYER, extra);
      const coach = lines({ ...raw, metadata: { ...raw.metadata, last_refreshed_at: '2026-09-29' } }, COACH, extra);
      for (const k of ['what', 'why', 'next', 'when'] as const) expect(numbers(coach[k])).toEqual(numbers(you[k]));
      expect(Object.values(coach).join(' ')).not.toMatch(/\byou(r)?\b/i);
    }
    expect(lines(DIVE_SLOPE, COACH).what).toContain('Compared with no downhill penalty (Jonah’s level putts 81%, downhill 58%).');
    expect(lines(DIVE_PENALTIES, COACH).why).toMatch(/^Measured in Jonah’s shots: /);
    expect(lines(DIVE_PENALTIES, COACH).what).toContain('Closing the gap to Jonah’s team’s average is worth about 0.9 strokes a round.');
  });

  it('no line says "because" or "caused", and none prints a zero stroke figure', () => {
    for (const raw of [DIVE_SLOPE, DIVE_PENALTIES, DIVE_BREAK, DIVE_BIG, penalties('pl-jonah')]) {
      const all = Object.values(lines(raw)).join(' ');
      expect(all).not.toMatch(/\bbecause\b|\bcaused\b/i);
      expect(all).not.toMatch(/\b0\.0+ strokes?\b/);
    }
  });

  it('toChRead takes only what it is handed: no diagnosis, no cascade figure, no rounds', () => {
    const base = toChInsight(DIVE_BREAK, { tour: PREVIEW_TOUR, viewer: PLAYER });
    const r = toChRead(DIVE_BREAK, base, { diagnosis: null, closes: null, newestListed: null, windowEnd: null });
    expect(r.when).toEqual({ through: null, stale: null });
    expect(r.why.level).toBeNull();
    expect(r.what.strokes).toBeNull();
  });
});
