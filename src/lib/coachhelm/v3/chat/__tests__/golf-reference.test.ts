import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOLF_REFERENCE_SECTIONS } from '../golf-reference.generated';
import { splitGolfReference } from '../golf-reference-split';
import { getGolfReference, searchGolfReference } from '../golf-reference';
import { auditNumericClaims, collectEnvelopeNumbers, readFigure } from '../provenance';

const doc = readFileSync(resolve(process.cwd(), 'docs/v3-research-golf-domain.md'), 'utf8');

describe('the golf reference module', () => {
  it('is in sync with docs/v3-research-golf-domain.md (run: npm run coachhelm:golf-reference)', () => {
    expect(GOLF_REFERENCE_SECTIONS).toEqual(splitGolfReference(doc));
  });

  it('splits by section and leaves out the engine’s own constraints and the internal planning pointer', () => {
    const chapters = new Set(GOLF_REFERENCE_SECTIONS.map((s) => s.chapter));
    expect([...chapters].some((c) => /ENGINE IMPLICATIONS/i.test(c))).toBe(false);
    expect(GOLF_REFERENCE_SECTIONS.some((s) => s.text.includes('v3-master-plan'))).toBe(false);
    expect(GOLF_REFERENCE_SECTIONS.length).toBeGreaterThan(40);
    expect(new Set(GOLF_REFERENCE_SECTIONS.map((s) => s.id)).size).toBe(GOLF_REFERENCE_SECTIONS.length);
  });
});

describe('get_golf_reference', () => {
  it('returns the matching sections tagged as reference, each with its source, apart from any team data', () => {
    const e = getGolfReference({ topic: 'lag putting and 3-putts' });
    expect(e.coverage).toBe('complete');
    const d = e.detail as { kind: string; not_team_data: boolean; reference: Array<{ kind: string; source: string; heading: string; text: string }> };
    expect(d.kind).toBe('reference');
    expect(d.not_team_data).toBe(true);
    expect(d.reference.length).toBeGreaterThan(0);
    expect(d.reference.length).toBeLessThanOrEqual(3);
    expect(d.reference.every((r) => r.kind === 'reference' && r.source.startsWith('CoachHelm golf reference'))).toBe(true);
    expect(d.reference.some((r) => /lag/i.test(r.heading))).toBe(true);
    expect(e.summary).toMatch(/not this team’s data/);
    expect(e.measurements).toEqual([]);
  });

  it('finds college baselines and the pressure gap by their own words', () => {
    expect(searchGolfReference('college scoring averages')[0]?.section.chapter).toMatch(/College/);
    expect(searchGolfReference('tournament pressure')[0]?.section.chapter).toMatch(/Pressure|Causal/);
  });

  it('says so, with the chapters, when it has nothing', () => {
    const e = getGolfReference({ topic: 'zzzz qqqq' });
    expect(e.coverage).toBe('empty');
    expect((e.detail as { reference: unknown[]; chapters: string[] }).reference).toEqual([]);
    expect((e.detail as { chapters: string[] }).chapters.length).toBeGreaterThan(5);
  });

  it('caps a long section', () => {
    const e = getGolfReference({ topic: 'wedge gapping' });
    for (const r of (e.detail as { reference: Array<{ text: string }> }).reference) expect(r.text.length).toBeLessThanOrEqual(3300);
  });

  it('grounds a reference figure in the audit only because it was returned', () => {
    const e = getGolfReference({ topic: 'lag putting 3-putt' });
    const text = 'The golf reference puts a 15-handicap at 25-30% three-putts from long range.';
    const grounded = auditNumericClaims(text, e.measurements, e.series, collectEnvelopeNumbers(e));
    expect(grounded).toEqual([]);
    // The same sentence with no read behind it is refused.
    const bare = auditNumericClaims(text, [], [], []);
    expect(bare.map((c) => c.value).sort((a, b) => a - b)).toEqual([15, 25, 30]);
  });

  it('does not let the model’s own topic ground a number', () => {
    const e = getGolfReference({ topic: 'putting 47' });
    const found = auditNumericClaims('Players make 47 percent of them.', e.measurements, e.series, collectEnvelopeNumbers(e));
    expect(found.map((c) => c.value)).toContain(47);
  });

  describe('reference figures ground only a sentence that names the reference', () => {
    // "amateur 15-HCP ≈ 25-30%" is in the returned text; 62 is not in it anywhere.
    const e = getGolfReference({ topic: 'lag putting 3-putt' });
    const players = [{ id: 'p1', name: 'Owen Carter' }];
    const audit = (text: string, extra: Array<ReturnType<typeof readFigure>> = []) => auditNumericClaims(text, extra, [], collectEnvelopeNumbers(e), [], 'America/New_York', { players }).map((c) => c.value);

    it('a team claim that uses a number only the reference holds is refused', () => {
      expect(audit('Owen Carter three-putts 25% of the time.')).toEqual([25]);
      expect(audit('The team three-putts 30% of its holes.')).toEqual([30]);
    });

    it('the same figure is accepted when its sentence names the reference or its source', () => {
      expect(audit('The golf reference puts a 15-handicap at 25-30% three-putts from long range.')).toEqual([]);
      expect(audit('Research on amateurs has them near 25-30%.')).toEqual([]);
    });

    it('is judged sentence by sentence: a sourced sentence does not cover the next one', () => {
      expect(audit('The golf reference has an amateur near 25%. Owen Carter three-putts 25% of the time.')).toEqual([25]);
    });

    it('a number the team’s own read returned still grounds a team claim with no source named', () => {
      const own = readFigure({ metric_id: 'three_putt_pct', metric_label: 'Three-putt %', unit: 'percent', value: 25, entity: { kind: 'player', id: 'p1', label: 'Owen Carter' }, window_start: null, window_end: null, sample_size: 40, sample_unit: 'rounds', source: 'rounds', method: 'm' });
      expect(audit('Owen Carter three-putts 25% of the time.', [own])).toEqual([]);
    });
  });

  describe('the college baselines are only what a source supports', () => {
    const text = (topic: string) => JSON.stringify(getGolfReference({ topic }).detail);

    it('lists the figures that have a citable source, with the source named', () => {
      const t = text('published college baselines strokes gained NCAA D1 championship field');
      expect(t).toMatch(/Published College Baselines/);
      expect(t).toMatch(/2\.3 strokes per round better/);
      expect(t).toMatch(/datagolf\.com\/true-strokes-gained-am/);
      expect(t).toMatch(/shot-quality index/i);
      expect(t).toMatch(/mikkelgolf\.substack\.com/);
    });

    it('says plainly what is not published, so no division fills a missing figure from another or from the Tour', () => {
      const t = text('published college baselines not published no college figure');
      expect(t).toMatch(/Not published \(no college figure\)/);
      expect(t).toMatch(/Division II, Division III, NAIA and JUCO/);
      expect(t).toMatch(/leave them unset/);
    });

    it('marks the old D1 profile as indicative, not a quoted baseline', () => {
      expect(text('typical college stat profile D1 FW GIR putts')).toMatch(/No single published source/);
    });
  });
});
