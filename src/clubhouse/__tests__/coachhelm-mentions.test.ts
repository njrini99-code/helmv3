import { describe, expect, it } from 'vitest';
import { ALL_METRIC_SPECS } from '@/lib/coachhelm/v3/chat/metrics-catalog';
import { insertMention, mentionQuery } from '../data/coachhelm-chat-shape';
import { ASK_STATS, matchStats } from '../data/coachhelm-mentions';

/** The Ask composer's `@` picker beside the roster (P013, CH-13821): the stats, and how a fragment finds them. */
describe('the mention picker’s stats', () => {
  const labels = (q: string, mentioned = '') => matchStats(ASK_STATS, q, mentioned).map((s) => s.label);

  it('are the agent’s own metric catalog, in its order, so a stat the coach mentions is one CoachHelm can measure', () => {
    expect(ASK_STATS.map((s) => s.id)).toEqual(ALL_METRIC_SPECS.map((s) => s.id));
    expect(ASK_STATS[0]).toEqual({ id: 'scoring_average', label: 'Scoring average' });
  });

  it('an empty fragment offers them all; a fragment matches inside the label, case aside', () => {
    expect(labels('')).toHaveLength(ASK_STATS.length);
    expect(labels('PUTT')).toEqual(['Strokes gained putting', 'Putts per round', 'Three-putt rate', 'One-putt rate']);
    expect(labels('regul')).toEqual(['Greens in regulation']);
  });

  it('a fragment also finds a metric by the start of a word of its id (gir, sg), but never by the shared pct', () => {
    expect(labels('gir')).toEqual(['Greens in regulation']);
    expect(labels('sg')).toEqual(['Strokes gained total', 'Strokes gained putting', 'Strokes gained approach', 'Strokes gained off the tee', 'Strokes gained around the green']);
    expect(labels('pct')).toEqual([]);
  });

  it('a stat already in the question is not offered again, and a pick is words the coach can read', () => {
    const typed = insertMention('Who leads @gre', 'Greens in regulation');
    expect(typed).toBe('Who leads @Greens in regulation ');
    expect(mentionQuery(typed)).toBeNull();
    expect(labels('regul', typed)).toEqual([]);
    expect(labels('', typed)).not.toContain('Greens in regulation');
  });
});
