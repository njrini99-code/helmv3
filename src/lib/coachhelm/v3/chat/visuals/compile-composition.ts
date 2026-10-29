import 'server-only';
import { createHash } from 'node:crypto';
import type { Measurement, MeasurementSeries, ToolEnvelope } from '../provenance';
import {
  COMPOSITION_SCHEMA_VERSION,
  type CompositionBlockSpec,
  type CompositionSpec,
  type ResolvedBlock,
  type ValidatedComposition,
} from './composition';

/**
 * Turn the model's design into a drawable composition.
 *
 * Each block is resolved against the reads made this turn, and only those: a
 * figure is copied from a `Measurement` or `MeasurementSeries`, never taken from
 * the spec. A block that cannot be drawn honestly is dropped and the model is
 * told why in words; a composition with no figure left is refused, and the
 * generic evidence blocks draw instead.
 */

export type CompositionResult =
  | { ok: true; composition: ValidatedComposition; dropped: string[] }
  | { ok: false; reason: 'figure_in_text' | 'nothing_to_draw'; message: string; dropped: string[] };

/** Below this a "trend" is a change between two rounds, not a trend. Same rule as the chat's renderers. */
const MIN_TREND_POINTS = 3;
/** A whole college roster: past this a comparison stops being readable on a phone. */
const MAX_COMPARE_PLAYERS = 12;

const hasDigit = (s: string) => /\p{N}/u.test(s);

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

// What the composition drew, by full content: two reads of the same metric over
// different windows are different observations, and drawing one must not hide the other.
const key = (m: Measurement) => canonical(m);
/** One player's one metric: where two reads must agree, or the later one wins. */
const slot = (m: Measurement) => `${m.entity.id}|${m.metric_id}`;
const seriesKey = (s: MeasurementSeries) => canonical(s);
const isBucketSeries = (s: MeasurementSeries) => s.points.some((p) => p.bucket !== null);
const drawable = (m: Measurement) => m.value !== null && m.coverage !== 'unavailable';

type Resolve = { ok: true; block: ResolvedBlock; drawn: { m: Measurement[]; s: MeasurementSeries[] } } | { ok: false; why: string };

function resolveBlock(block: CompositionBlockSpec, evidence: ReadonlyMap<string, ToolEnvelope>): Resolve {
  const read = (ref: string): ToolEnvelope | null => {
    const e = evidence.get(ref);
    return e && e.coverage !== 'unavailable' ? e : null;
  };
  const missing = (ref: string) => ({ ok: false as const, why: `no usable read named ${ref} this answer` });

  switch (block.type) {
    case 'note': {
      if (hasDigit(block.text)) return { ok: false, why: 'a note may not contain a number' };
      return { ok: true, block: { type: 'note', kind: block.kind, text: block.text }, drawn: { m: [], s: [] } };
    }
    case 'headline': {
      const e = read(block.ref);
      if (!e) return missing(block.ref);
      const m = e.measurements.find((x) => x.metric_id === block.metricId && drawable(x));
      if (!m) return { ok: false, why: `read ${block.ref} has no figure for ${block.metricId}` };
      if (block.label && hasDigit(block.label)) return { ok: false, why: 'a headline label may not contain a number' };
      return { ok: true, block: { type: 'headline', measurement: m, label: block.label ?? null }, drawn: { m: [m], s: [] } };
    }
    case 'kpis': {
      const e = read(block.ref);
      if (!e) return missing(block.ref);
      const want = block.metricIds ? new Set(block.metricIds) : null;
      const ms = e.measurements.filter((x) => drawable(x) && (!want || want.has(x.metric_id))).slice(0, 6);
      if (ms.length === 0) return { ok: false, why: `read ${block.ref} has none of those figures` };
      return { ok: true, block: { type: 'kpis', measurements: ms }, drawn: { m: ms, s: [] } };
    }
    case 'trend': {
      const e = read(block.ref);
      if (!e) return missing(block.ref);
      const s = e.series.find((x) => !isBucketSeries(x) && (!block.metricId || x.metric_id === block.metricId));
      if (!s) return { ok: false, why: `read ${block.ref} has no series over time` };
      if (s.points.length < MIN_TREND_POINTS) {
        return { ok: false, why: `a trend needs at least ${MIN_TREND_POINTS} rounds and this read has ${s.points.length}` };
      }
      // A benchmark is only drawn when the read carried a real one; otherwise the player's own average stands in.
      const reference =
        block.reference === 'benchmark' && !(s.benchmark && !s.benchmark.omitted_for_cohort) ? 'average' : block.reference;
      // The series' own mean measurement (`<metric>_mean`) is what the reference line already says.
      const mean = e.measurements.filter((x) => x.metric_id === `${s.metric_id}_mean` && x.entity.id === s.entity.id);
      return { ok: true, block: { type: 'trend', series: s, reference }, drawn: { m: mean, s: [s] } };
    }
    case 'bars': {
      const e = read(block.ref);
      if (!e) return missing(block.ref);
      const bands = e.series.find((x) => isBucketSeries(x) && (!block.metricId || x.metric_id === block.metricId));
      if (bands) {
        if (bands.points.length < 2) return { ok: false, why: 'bars need at least two bands' };
        const labels = new Set(bands.points.map((p) => p.bucket));
        // Bucket tools also return one measurement per band; those are the same figures.
        const mirror = e.measurements.filter((x) => x.entity.id === bands.entity.id && x.unit === bands.unit);
        return {
          ok: true,
          block: { type: 'bands', series: bands, highlight: block.highlight && labels.has(block.highlight) ? block.highlight : null },
          drawn: { m: mirror, s: [bands] },
        };
      }
      const metricIds = new Set(e.measurements.filter(drawable).map((x) => x.metric_id));
      const metric = block.metricId ?? (metricIds.size === 1 ? [...metricIds][0] : undefined);
      if (!metric) return { ok: false, why: `read ${block.ref} has several metrics; name one with metricId` };
      const ms = e.measurements.filter((x) => x.metric_id === metric && drawable(x));
      if (new Set(ms.map((x) => x.entity.id)).size < 2) return { ok: false, why: 'bars need at least two players or bands' };
      const hit = ms.find((x) => x.entity.id === block.highlight || x.entity.label === block.highlight);
      return {
        ok: true,
        block: {
          type: 'ranking',
          measurements: ms,
          // Best-first needs to know which way is best; without a direction it would be a guess.
          order: block.order === 'best_first' && ms[0]!.direction ? 'best_first' : 'as_read',
          highlight: hit ? hit.entity.id : null,
        },
        drawn: { m: ms, s: [] },
      };
    }
    case 'split': {
      const envs: ToolEnvelope[] = [];
      for (const ref of block.refs) {
        const e = read(ref);
        if (!e) return missing(ref);
        envs.push(e);
      }
      const want = block.metricIds ? new Set(block.metricIds) : null;
      const byKey = new Map<string, Measurement>();
      for (const m of envs.flatMap((e) => e.measurements)) {
        if (!drawable(m) || m.unit !== 'strokes' || (want && !want.has(m.metric_id))) continue;
        // `sg_total` is the whole, not a part; a split of the parts leaves it out unless asked for.
        if (!want && m.metric_id === 'sg_total') continue;
        const had = byKey.get(slot(m));
        if (had && had.value !== m.value) return { ok: false, why: `two reads disagree on ${m.metric_label}` };
        byKey.set(slot(m), m);
      }
      const ms = [...byKey.values()];
      if (ms.length < 2) return { ok: false, why: 'a split needs at least two signed figures' };
      if (new Set(ms.map((m) => m.entity.id)).size > 1) return { ok: false, why: 'a split shows one player; use compare for several' };
      if (new Set(ms.map((m) => `${m.window_start}|${m.window_end}`)).size > 1) {
        return { ok: false, why: 'those figures cover different date windows' };
      }
      return { ok: true, block: { type: 'split', measurements: ms }, drawn: { m: ms, s: [] } };
    }
    case 'compare': {
      const envs: ToolEnvelope[] = [];
      for (const ref of block.refs) {
        const e = read(ref);
        if (!e) return missing(ref);
        envs.push(e);
      }
      const want = block.metricIds ? new Set(block.metricIds) : null;
      const byKey = new Map<string, Measurement>();
      for (const m of envs.flatMap((e) => e.measurements)) {
        if (drawable(m) && (!want || want.has(m.metric_id))) byKey.set(slot(m), m);
      }
      const ms = [...byKey.values()];
      const players = new Set(ms.map((m) => m.entity.id));
      if (players.size < 2) return { ok: false, why: 'a comparison needs at least two players' };
      if (players.size > MAX_COMPARE_PLAYERS) return { ok: false, why: `compare at most ${MAX_COMPARE_PLAYERS} players; use bars to rank the rest` };
      return { ok: true, block: { type: 'compare', measurements: ms }, drawn: { m: ms, s: [] } };
    }
  }
}

export function compileComposition(
  spec: CompositionSpec,
  evidence: ReadonlyMap<string, ToolEnvelope>,
  now: Date = new Date(),
): CompositionResult {
  const dropped: string[] = [];
  if (hasDigit(spec.title) || (spec.lede && hasDigit(spec.lede))) {
    return {
      ok: false,
      reason: 'figure_in_text',
      message: 'The title and lede may not contain a number; every figure comes from the reads. Write them in words.',
      dropped,
    };
  }

  const blocks: ResolvedBlock[] = [];
  const drawnM = new Set<string>();
  const drawnS = new Set<string>();
  spec.blocks.forEach((b, i) => {
    const r = resolveBlock(b, evidence);
    if (!r.ok) {
      dropped.push(`block ${i + 1} (${b.type}): ${r.why}`);
      return;
    }
    blocks.push(r.block);
    r.drawn.m.forEach((m) => drawnM.add(key(m)));
    r.drawn.s.forEach((s) => drawnS.add(seriesKey(s)));
  });

  if (!blocks.some((b) => b.type !== 'note')) {
    return {
      ok: false,
      reason: 'nothing_to_draw',
      message: 'None of the blocks could be drawn from the reads you named.',
      dropped,
    };
  }

  // A read is hidden from the generic evidence only when this composition draws every figure in it.
  const refs = [...new Set(spec.blocks.flatMap((b) => ('ref' in b ? [b.ref] : 'refs' in b ? b.refs : [])))];
  const evidenceRefs = refs.filter((ref) => {
    const e = evidence.get(ref);
    if (!e || (e.measurements.length === 0 && e.series.length === 0)) return false;
    return e.measurements.every((m) => drawnM.has(key(m))) && e.series.every((s) => drawnS.has(seriesKey(s)));
  });
  const coverageNotes = [
    ...new Set(
      evidenceRefs
        .map((ref) => evidence.get(ref)!)
        // The read's own note, and every figure's: a stale cache marks the
        // measurement partial while the envelope can still say complete.
        .flatMap((e) => [e, ...e.measurements, ...e.series])
        .filter((x) => x.coverage !== 'complete' && x.coverage_note)
        .map((x) => x.coverage_note as string),
    ),
  ];

  const body = { title: spec.title, lede: spec.lede ?? null, layout: spec.layout, blocks, coverageNotes };
  const dataHash = createHash('sha256').update(canonical(body)).digest('hex');
  return {
    ok: true,
    dropped,
    composition: {
      artifactId: `vc-${dataHash.slice(0, 12)}`,
      schemaVersion: COMPOSITION_SCHEMA_VERSION,
      kind: 'compose',
      ...body,
      evidenceRefs,
      dataHash,
      createdAt: now.toISOString(),
    },
  };
}
