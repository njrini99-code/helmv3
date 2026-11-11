import { describe, expect, it } from 'vitest';
import { getGolfReference, searchGolfReference, SERVED_SECTIONS } from '../../golf-reference';
import { GOLF_REFERENCE_SECTIONS } from '../../golf-reference.generated';
import { golfBlock } from '../golf';
import { isServed, REDACTED, REFERENCE_TOPICS, referenceTopic, WITHHELD } from '../reference-topics';

type Detail = { reference: Array<{ section: string; topic: string | null; heading: string; text: string }>; more_in_this_topic?: string[]; topics?: Array<{ topic: string; headings: string[] }> };
const detail = (topic: string) => getGolfReference({ topic }).detail as Detail;
const byId = new Map(GOLF_REFERENCE_SECTIONS.map((s) => [s.id, s]));

describe('the on-demand golf reference, by topic', () => {
  it('places every section of the research document on purpose: in one topic, or withheld with a reason', () => {
    const inTopics = REFERENCE_TOPICS.flatMap((t) => t.sections);
    expect(new Set(inTopics).size).toBe(inTopics.length);
    for (const id of inTopics) expect(byId.has(id), `${id} is a section of the document`).toBe(true);
    for (const [id, why] of Object.entries(WITHHELD)) {
      expect(byId.has(id), `${id} is a section of the document`).toBe(true);
      expect(inTopics).not.toContain(id);
      expect(why.length).toBeGreaterThan(30);
    }
    const placed = new Set([...inTopics, ...Object.keys(WITHHELD)]);
    expect(GOLF_REFERENCE_SECTIONS.map((s) => s.id).filter((id) => !placed.has(id))).toEqual([]);
  });

  it('cuts each redacted sentence, and fails when the document no longer holds it', () => {
    for (const r of REDACTED) {
      expect(byId.get(r.section)?.text, `${r.section} still contains the sentence to cut`).toContain(r.cut);
      expect(SERVED_SECTIONS.find((s) => s.id === r.section)?.text).not.toContain(r.cut.trim());
    }
    // The unsourced college figures are gone from what is served; the sourced Tour study is still there.
    const served = SERVED_SECTIONS.map((s) => s.text).join('\n');
    expect(served).not.toMatch(/college ~40%|2-5 stroke|typically \*\*2-5 strokes\*\*|college typically 25-32 ft/);
    expect(served).toMatch(/Hickman & Metz/);
  });

  it('never serves the Tour tables: a Tour figure has one source, the standards table', () => {
    for (const id of Object.keys(WITHHELD)) expect(isServed(id)).toBe(false);
    for (const q of ['tour putt make percentage by distance', 'pga tour baselines', 'sg benchmarks top 30', 'tour proximity benchmarks']) {
      for (const hit of searchGolfReference(q)) expect(hit.section.chapter).not.toMatch(/^2\. PGA Tour Baselines/);
      for (const r of detail(q).reference ?? []) expect(r.section).not.toMatch(/^2-pga-tour-baselines/);
    }
    expect(getGolfReference({ topic: 'zzzz qqqq' }).coverage_note).toMatch(/Tour and level figures are on topic standards/);
  });

  it('returns a topic by its name, in reading order, and says what else the topic holds', () => {
    for (const t of REFERENCE_TOPICS) {
      const d = detail(t.id);
      expect(d.reference.length, t.id).toBeGreaterThan(0);
      expect(d.reference.map((r) => r.section)).toEqual(t.sections.slice(0, d.reference.length));
      expect(d.reference.every((r) => r.topic === t.id)).toBe(true);
      if (t.sections.length > d.reference.length) expect(d.more_in_this_topic?.length).toBe(t.sections.length - d.reference.length);
    }
    expect(referenceTopic('Course Management')?.id).toBe('course_management');
    expect(referenceTopic('what-moves-score')?.id).toBe('what_moves_score');
  });

  it('finds a section by a few words, and by its topic\'s words', () => {
    expect(detail('lag putting and three putts').reference.some((r) => /lag/i.test(r.heading))).toBe(true);
    expect(detail('improvement plateau').reference.some((r) => r.topic === 'improvement')).toBe(true);
    expect(detail('flyer lie from the rough').reference.some((r) => r.topic === 'lies_and_conditions')).toBe(true);
  });

  it('lists its topics with their headings when it finds nothing', () => {
    const d = detail('zzzz qqqq');
    expect(d.reference).toEqual([]);
    expect(d.topics?.map((t) => t.topic)).toEqual(REFERENCE_TOPICS.map((t) => t.id));
    expect(d.topics?.every((t) => t.headings.length > 0)).toBe(true);
  });

  it('tells the model the notes are in shorthand and the answer is not', () => {
    const note = getGolfReference({ topic: 'what_moves_score' }).coverage_note ?? '';
    expect(note).toMatch(/written in shorthand \(SG, GIR, FW, HCP, ft, yds\): in an answer write strokes gained, greens in regulation, fairways, handicap, feet and yards in full/);
  });

  it('is named in the prompt topic by topic, so the model knows what it can look up', () => {
    for (const t of REFERENCE_TOPICS.filter((t) => t.id !== 'sources')) expect(golfBlock('ask')).toContain(`${t.id} (${t.label})`);
  });
});
