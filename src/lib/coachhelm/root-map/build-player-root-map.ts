/**
 * Player root map: stored v3 insights → {@link RootMapModel}.
 *
 * Split from `build-root-map.ts` because it needs the delivery ranking
 * helpers (`dedupeBySubject`, `collapseParScoring`), which pull in the
 * ranking module; the page calls this server-side and hands the finished,
 * plain-JSON model to the client map.
 */

import {
  collapseParScoring,
  dedupeBySubject,
  type RankableEvidenceInsight,
} from '@/app/golf/actions/insight-delivery-ranking';
import {
  causalityOf,
  confidenceTier,
  diagnosisOf,
  isoDay,
  isRootArea,
  layoutRootMap,
  rootStyleFor,
  strokesPerRound,
  type CauseSeed,
  type OtherRead,
  type RootArea,
  type RootMapAreaInput,
  type RootMapModel,
  type UnsizedCause,
  humanizeCauseLabel,
} from './build-root-map';
import { plainRootCause } from './plain-copy';
import {
  groupMeasured,
  measuredLabel,
  nodeIdForKey,
  subKeyForMetric,
  type MeasuredGroups,
  type MeasuredSub,
  type MeasuredWhat,
} from './measured-what';
import { formatStrokes, ROOT_AREA_LABEL, type AreaMeasuredMeta, type ConfidenceTier, type RootStyle } from './build-root-map';

/** Per approach band, what the page read from recorded shots
 *  (`approach-context.ts`): the strokes lost from the band when the band
 *  split reconciled with the stored approach SG, and the gated path. */
export interface ApproachBandInput {
  /** Strokes/round lost from the band (positive); null = not sized. */
  strokesLost: number | null;
  /** "175+ yd → par 4s → short-right"; null when it did not narrow. */
  path: string | null;
  /** Rounds the band split was read over. */
  rounds: number;
  /** Why there is no width, when `strokesLost` is null. */
  unsizedNote: string | null;
}

export interface RootMapInput<T extends RankableEvidenceInsight = RankableEvidenceInsight> {
  areas: RootMapAreaInput[];
  insights: T[];
  /** Date-only; insights first detected on/after it are marked new. */
  newSinceDate?: string | null;
  /** Keyed by band (`50_125ft` / `125_175ft` / `175_plus_ft`). Absent → the
   *  approach rows are handled like any other (stored counterfactual only). */
  approachBands?: Partial<Record<string, ApproachBandInput>> | null;
  /** The measured What row (`measured-what.ts#measureWhat`). An area whose
   *  split is `measured` or `share` draws its What row from shots; any other
   *  area keeps the stored-insight row. */
  measured?: MeasuredWhat | null;
}

const BAND_YARDS: Record<string, string> = { '50_125ft': '50–125 yd', '125_175ft': '125–175 yd', '175_plus_ft': '175+ yd' };

/** `approach_proximity_175_plus_ft` → `175_plus_ft`, else null. */
function approachBandOf(insight: RankableEvidenceInsight): string | null {
  const m = typeof insight.evidence?.metric === 'string' ? insight.evidence.metric.match(/^approach_proximity_(50_125ft|125_175ft|175_plus_ft)$/) : null;
  return m?.[1] ?? null;
}

function labelOf(insight: RankableEvidenceInsight): string {
  const l = insight.evidence?.metric_label;
  return humanizeCauseLabel(typeof l === 'string' && l.trim().length > 0 ? l : insight.title);
}

function isNewSince(insight: RankableEvidenceInsight, since: string | null | undefined): boolean {
  if (!since) return false;
  const day = isoDay(insight.created_at);
  return day !== null && day >= since;
}

const STYLE_ORDER: Record<RootStyle, number> = { observed: 0, likely: 1, forming: 2, unexplained: 3 };

const BAND_OF_KEY: Record<string, string> = { '50_125': '50_125ft', '125_175': '125_175ft', '175_plus': '175_plus_ft' };

/** The plain note under a measured area. Built only from the split's numbers. */
export function measuredAreaNote(
  area: RootArea,
  mode: 'measured' | 'share',
  rounds: number,
  stored: number,
  recomputed: number,
  groups: MeasuredGroups,
  audience: 'player' | 'coach' = 'player',
): string {
  const label = ROOT_AREA_LABEL[area];
  const whose = audience === 'coach' ? 'the' : 'your';
  if (mode === 'share') {
    return `${label}: split from ${rounds} rounds of recorded shots. The shot-by-shot total (${formatStrokes(recomputed, { signed: true })}) did not match ${whose} stored ${formatStrokes(stored, { signed: true })} a round, so each spot shows its share of the stored total.`;
  }
  const residual = stored - recomputed;
  const parts = [`${label}: measured from ${rounds} rounds of recorded shots, matching the stored ${formatStrokes(stored, { signed: true })} a round`];
  if (Math.abs(residual) >= 0.005) parts[0] += ` to within ${formatStrokes(Math.abs(residual))}`;
  const offsets = groups.gaining.filter((g) => g.sg >= 0.005);
  if (offsets.length > 0) parts.push(`${offsets.map((g) => `${g.label} gain ${formatStrokes(g.sg)}`).join(', ')}`);
  return `${parts.join('. ')}.`;
}

function measuredNode(sub: MeasuredSub, mode: 'measured' | 'share', area: RootArea): Pick<CauseSeed, 'measured'> {
  const listed = sub.lies ? sub.lies.reduce((t, l) => t + l.sg, 0) : 0;
  const rest = sub.lies ? sub.sg - listed : null;
  return {
    measured: {
      mode,
      n: sub.n,
      unit: area === 'putting' ? 'holes' : 'shots',
      rounds: sub.rounds,
      merged: sub.merged.map((k) => measuredLabel(area, k)),
      lies: sub.lies ? sub.lies.map((l) => ({ label: l.label, sg: l.sg, n: l.n })) : null,
      liesRest: rest !== null && Math.abs(rest) >= 0.005 ? rest : null,
    },
  };
}

export function buildRootMap<T extends RankableEvidenceInsight>(input: RootMapInput<T>): RootMapModel {
  const since = input.newSinceDate ?? null;
  const losing = new Set<RootArea>(
    input.areas
      .filter((a) => typeof a.sgPerRound === 'number' && Number.isFinite(a.sgPerRound) && a.sgPerRound < 0)
      .map((a) => a.area),
  );

  // One card per issue: collapse par-scoring rows, then dedupe by subject,
  // the same helpers every delivery surface uses. Idempotent on rows that
  // were already deduped upstream.
  const collapsed = collapseParScoring(input.insights);
  const insights = dedupeBySubject(collapsed);

  const sized: CauseSeed[] = [];
  const unsized: UnsizedCause[] = [];
  const other: OtherRead[] = [];

  // Losing areas measured from shots: group the split once, then attach each
  // stored insight to the spot its metric reads.
  const measuredAreas = new Map<RootArea, { groups: MeasuredGroups; mode: 'measured' | 'share' }>();
  const attached = new Map<string, T[]>();
  const areaMeta: Partial<Record<RootArea, AreaMeasuredMeta>> = {};
  for (const area of losing) {
    const m = input.measured?.[area];
    if (!m || m.mode === 'none') continue;
    const groups = groupMeasured(area, m.keys);
    if (groups.losing.length === 0) continue;
    measuredAreas.set(area, { groups, mode: m.mode });
    areaMeta[area] = {
      mode: m.mode,
      rounds: m.rounds,
      stored: m.stored,
      recomputed: m.recomputed,
      offsets: groups.gaining.filter((g) => g.sg >= 0.005).map((g) => ({ label: g.label, sg: g.sg })),
      note: measuredAreaNote(area, m.mode, m.rounds, m.stored, m.recomputed, groups),
    };
  }

  for (const insight of insights) {
    const category = insight.category;
    const isNew = isNewSince(insight, since);
    const tier = confidenceTier(insight.evidence?.confidence);
    if (isRootArea(category) && measuredAreas.has(category)) {
      const { groups } = measuredAreas.get(category)!;
      const key = subKeyForMetric(category, insight.evidence?.metric);
      const nodeId = key ? nodeIdForKey(groups, key) : null;
      if (nodeId) {
        const list = attached.get(nodeId) ?? [];
        list.push(insight);
        attached.set(nodeId, list);
      } else {
        other.push({ id: insight.id, title: insight.title, category: category ?? null, tier, isNew });
      }
    } else if (isRootArea(category) && losing.has(category)) {
      const stored = strokesPerRound(insight.evidence);
      const bandKey = category === 'approach' ? approachBandOf(insight) : null;
      const band = bandKey ? input.approachBands?.[bandKey] ?? null : null;
      const strokes = stored ?? band?.strokesLost ?? null;
      const bySg = stored === null && strokes !== null;
      if (strokes !== null) {
        sized.push({
          id: insight.id,
          area: category,
          title: insight.title,
          label: labelOf(insight),
          strokes,
          style: rootStyleFor(insight.evidence),
          tier,
          causality: causalityOf(insight.evidence),
          rootCause: plainRootCause(diagnosisOf(insight.evidence)?.root_cause, insight.evidence?.metric ?? null),
          isNew,
          sizedBy: bySg ? 'band_sg' : 'counterfactual',
          sizingNote:
            bySg && band
              ? `approach strokes gained from ${BAND_YARDS[bandKey!] ?? bandKey}, last ${band.rounds} rounds`
              : null,
          contextPath: band?.path ?? null,
        });
      } else {
        unsized.push({
          id: insight.id,
          area: category,
          title: insight.title,
          label: labelOf(insight),
          style: rootStyleFor(insight.evidence),
          tier,
          isNew,
          contextPath: band?.path ?? null,
          note: band?.unsizedNote ?? null,
        });
      }
    } else {
      other.push({ id: insight.id, title: insight.title, category: category ?? null, tier, isNew });
    }
  }

  // Measured spots: one node per losing sub-area, its Why the best attached
  // read (observed → likely → forming, then the larger stored value).
  for (const [area, { groups, mode }] of measuredAreas) {
    for (const sub of groups.losing) {
      const reads = (attached.get(sub.id) ?? []).slice().sort((a, b) => {
        const s = STYLE_ORDER[rootStyleFor(a.evidence)] - STYLE_ORDER[rootStyleFor(b.evidence)];
        return s !== 0 ? s : (strokesPerRound(b.evidence) ?? 0) - (strokesPerRound(a.evidence) ?? 0);
      });
      const lead = reads[0] ?? null;
      const band = area === 'approach' ? BAND_OF_KEY[sub.key] : undefined;
      const tier: ConfidenceTier | null = lead ? confidenceTier(lead.evidence?.confidence) : null;
      sized.push({
        id: sub.id,
        area,
        title: sub.title,
        label: sub.label,
        strokes: -sub.sg,
        style: lead ? rootStyleFor(lead.evidence) : 'unexplained',
        tier,
        causality: lead ? causalityOf(lead.evidence) : null,
        rootCause: lead ? plainRootCause(diagnosisOf(lead.evidence)?.root_cause, lead.evidence?.metric ?? null) : null,
        isNew: reads.some((r) => isNewSince(r, since)),
        sizedBy: mode,
        sizingNote:
          mode === 'share'
            ? `its share of the stored ${ROOT_AREA_LABEL[area].toLowerCase()} strokes gained, ${sub.n} ${area === 'putting' ? 'holes' : 'shots'} over ${sub.rounds} rounds`
            : `measured from ${sub.n} ${area === 'putting' ? 'holes' : 'shots'} over ${sub.rounds} rounds`,
        contextPath: band ? input.approachBands?.[band]?.path ?? null : null,
        insightIds: reads.map((r) => r.id),
        whyId: lead?.id ?? null,
        ...measuredNode(sub, mode, area),
      });
    }
  }

  // A row the page was handed but this dedupe folded away (e.g. a feed row
  // sharing a subject with the separately fetched top insight) was still
  // recorded as exposed upstream, so it must still render: as an other read.
  const kept = new Set(insights.map((i) => i.id));
  for (const insight of collapsed) {
    if (kept.has(insight.id)) continue;
    other.push({
      id: insight.id,
      title: insight.title,
      category: insight.category ?? null,
      tier: confidenceTier(insight.evidence?.confidence),
      isNew: isNewSince(insight, since),
    });
  }

  return layoutRootMap({
    areas: input.areas,
    sized,
    unsized,
    other,
    newCount: insights.filter((i) => isNewSince(i, since)).length,
    areaMeta,
  });
}
