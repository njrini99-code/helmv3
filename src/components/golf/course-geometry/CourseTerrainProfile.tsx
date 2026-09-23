'use client';

import { useMemo } from 'react';
import { checkedConnection } from '@/lib/golf/course-geometry/quality';
import { terrainHeight, terrainSourceCredit } from '@/lib/golf/course-geometry/terrain';
import type { HoleScene, PointM } from '@/lib/golf/course-geometry/types';

export interface TerrainProfileSample { distanceM: number; positionM: PointM; elevationM: number | null }
export type CourseProfileData = {
  status: 'available'; basis: 'mapped_route' | 'estimated_segment'; shotNumber?: number;
  distanceM: number; samples: TerrainProfileSample[]; changeM: number | null; hasGaps: boolean;
} | { status: 'unavailable'; reason: 'terrain_missing' | 'route_missing' | 'no_elevation' };

/** Source terrain sampled along a real route or a validated estimated segment.
 * Distance is horizontal chainage; no flight arc or display exaggeration enters
 * either axis. Unsupported source cells remain explicit gaps. */
export function buildCourseTerrainProfile(scene: HoleScene, selectedShotNumber?: number): CourseProfileData {
  const mesh = scene.terrain;
  if (!mesh || mesh.geometryHash !== scene.packageHash || mesh.physicalHoleKey !== scene.physicalHoleKey) return { status: 'unavailable', reason: 'terrain_missing' };
  const index = scene.events.findIndex(event => event.evidence.shotNumber === selectedShotNumber);
  const event = scene.events[index];
  const connection = event && checkedConnection(event, scene.events[index - 1], scene.features);
  const raw = connection ? [connection.fromM, connection.toM]
    : scene.features.find(feature => feature.id === scene.hole.routeFeatureId)?.parts[0]?.[0];
  if (!raw || raw.length < 2 || raw.length > 2048 || raw.some(point => !point.every(Number.isFinite))) return { status: 'unavailable', reason: 'route_missing' };
  const route = raw.filter((point, i) => i === 0 || Math.hypot(point[0] - raw[i - 1]![0], point[1] - raw[i - 1]![1]) > 1e-8);
  if (route.length < 2) return { status: 'unavailable', reason: 'route_missing' };
  const chainage = [0];
  for (let i = 1; i < route.length; i++) chainage.push(chainage[i - 1]! + Math.hypot(route[i]![0] - route[i - 1]![0], route[i]![1] - route[i - 1]![1]));
  const distanceM = chainage.at(-1)!;
  if (!Number.isFinite(distanceM) || distanceM <= 0 || distanceM > 10_000) return { status: 'unavailable', reason: 'route_missing' };
  const spacingM = Math.max(.5, mesh.metricGrid?.spacingM ?? mesh.source.nativeResolutionM);
  const count = Math.min(1024, Math.max(2, Math.ceil(distanceM / spacingM)));
  // Preserve route corners alongside the uniformly spaced source samples.
  const distances = [...new Set([...chainage, ...Array.from({ length: count + 1 }, (_, i) => distanceM * i / count)])].sort((a, b) => a - b);
  let segment = 1;
  const samples = distances.map(distance => {
    while (segment < route.length - 1 && chainage[segment]! < distance) segment++;
    const a = route[segment - 1]!, b = route[segment]!;
    const fraction = (distance - chainage[segment - 1]!) / (chainage[segment]! - chainage[segment - 1]!);
    const positionM: PointM = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
    return { distanceM: distance, positionM, elevationM: terrainHeight(mesh, positionM) };
  });
  if (samples.every(sample => sample.elevationM == null)) return { status: 'unavailable', reason: 'no_elevation' };
  const first = samples[0]!.elevationM, last = samples.at(-1)!.elevationM;
  return { status: 'available', basis: connection ? 'estimated_segment' : 'mapped_route',
    ...(connection ? { shotNumber: selectedShotNumber } : {}), distanceM, samples,
    changeM: first == null || last == null ? null : last - first, hasGaps: samples.some(sample => sample.elevationM == null) };
}

function niceRange(min: number, max: number) {
  const range = Math.max(1, max - min), raw = range / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw)), fraction = raw / magnitude;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
  const low = Math.floor((min - range * .08) / step) * step, high = Math.ceil((max + range * .08) / step) * step;
  return { min: low, max: Math.max(low + step * 2, high), step };
}

export function CourseTerrainProfile({ scene, selectedShotNumber, width = 390, height = 400, distanceUnit = 'yards' }: {
  scene: HoleScene; selectedShotNumber?: number; width?: number; height?: number; distanceUnit?: 'yards' | 'meters';
}) {
  const profile = useMemo(() => buildCourseTerrainProfile(scene, selectedShotNumber), [scene, selectedShotNumber]);
  if (profile.status !== 'available') return <div className="flex h-full min-h-[220px] flex-col justify-center gap-2 bg-surface p-6 font-fw-sans" data-slot="terrain-profile">
    <p className="text-body font-semibold text-text-primary">Terrain profile unavailable</p>
    <p className="text-body-sm text-text-secondary">{profile.reason === 'terrain_missing' ? 'This hole has no matching elevation package.'
      : profile.reason === 'route_missing' ? 'A mapped route or supported shot segment is needed for this view.'
        : 'Elevation coverage is missing along this route.'}</p>
  </div>;
  const horizontalFactor = distanceUnit === 'yards' ? .9144 : 1, elevationFactor = distanceUnit === 'yards' ? .3048 : 1;
  const horizontalUnit = distanceUnit === 'yards' ? 'yd' : 'm', elevationUnit = distanceUnit === 'yards' ? 'ft' : 'm';
  const svgWidth = Math.max(280, width - 32), svgHeight = Math.max(170, height - 158);
  const left = 54, right = svgWidth - 16, top = 24, bottom = svgHeight - 42;
  const elevations = profile.samples.flatMap(sample => sample.elevationM == null ? [] : [sample.elevationM / elevationFactor]);
  const domain = niceRange(Math.min(...elevations), Math.max(...elevations));
  const x = (distanceM: number) => left + distanceM / profile.distanceM * (right - left);
  const y = (elevationM: number) => bottom - (elevationM / elevationFactor - domain.min) / (domain.max - domain.min) * (bottom - top);
  const paths: string[] = [];
  let run: string[] = [];
  const finishRun = () => { if (run.length > 1) paths.push(run.join(' ')); run = []; };
  for (const sample of profile.samples) {
    if (sample.elevationM == null) { finishRun(); continue; }
    run.push(`${run.length ? 'L' : 'M'}${x(sample.distanceM).toFixed(3)},${y(sample.elevationM).toFixed(3)}`);
  }
  finishRun();
  const yTicks = Array.from({ length: Math.min(12, Math.round((domain.max - domain.min) / domain.step) + 1) }, (_, i) => domain.min + i * domain.step);
  const distance = Math.round(profile.distanceM / horizontalFactor);
  const change = profile.changeM == null ? null : profile.changeM / elevationFactor;
  const roundedChange = change == null ? null : Math.round(change);
  const credit = terrainSourceCredit(scene.terrain!.source);
  const accuracy = scene.terrain!.source.verticalAccuracyM;
  return <section className="flex h-full min-h-[260px] w-full flex-col bg-surface p-4 font-fw-sans" data-slot="terrain-profile"
    data-profile-basis={profile.basis} data-profile-distance-m={profile.distanceM}>
    <div className="flex items-start justify-between gap-4">
      <div><h3 className="font-fw-display text-body-lg font-semibold text-text-primary">Terrain profile</h3>
        <p className="text-caption text-text-secondary">{profile.basis === 'estimated_segment' ? `Shot ${profile.shotNumber} · estimated endpoints` : 'Mapped hole route'}</p></div>
      <div className="text-right"><p className="text-body-lg font-semibold tabular-nums text-text-primary">{profile.basis === 'estimated_segment' ? '≈ ' : ''}{distance} {horizontalUnit}</p>
        <p className="text-caption text-text-secondary">{roundedChange == null ? 'Elevation change unknown' : `${roundedChange > 0 ? '+' : ''}${roundedChange} ${elevationUnit} elevation change`}</p></div>
    </div>
    <svg className="my-2 w-full shrink-0" viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img"
      aria-label={`Terrain elevation profile along ${profile.basis === 'estimated_segment' ? 'estimated shot endpoints' : 'the mapped hole route'}. Horizontal distance ${distance} ${horizontalUnit}. ${profile.hasGaps ? 'Gaps indicate missing elevation data.' : ''}`}
      style={{ height: svgHeight }}>
      <text x={left} y={12} fontSize="12" fill="var(--fw-color-text-secondary)">Elevation ({elevationUnit})</text>
      {yTicks.map(value => {
        const py = y(value * elevationFactor);
        return <g key={value}><line x1={left} y1={py} x2={right} y2={py} stroke="var(--fw-color-border-subtle)" strokeWidth="1" />
          <text x={left - 8} y={py} dy=".35em" textAnchor="end" fontSize="12" fill="var(--fw-color-text-secondary)">{Number(value.toFixed(1))}</text></g>;
      })}
      <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="var(--fw-color-text-secondary)" strokeWidth="1" />
      {Array.from({ length: 5 }, (_, i) => {
        const d = profile.distanceM * i / 4, px = x(d);
        return <g key={i}><line x1={px} y1={bottom} x2={px} y2={bottom + 4} stroke="var(--fw-color-text-secondary)" strokeWidth="1" />
          <text x={px} y={bottom + 19} textAnchor="middle" fontSize="12" fill="var(--fw-color-text-secondary)">{Math.round(d / horizontalFactor)}</text></g>;
      })}
      <text x={(left + right) / 2} y={svgHeight - 3} textAnchor="middle" fontSize="12" fill="var(--fw-color-text-secondary)">Horizontal distance ({horizontalUnit})</text>
      {paths.map((d, i) => <path key={i} data-profile-run={i} d={d} fill="none" stroke="var(--fw-color-accent-600)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
    <p className="text-caption leading-relaxed text-text-secondary">{profile.hasGaps ? 'Gaps show missing terrain. ' : ''}Axes scaled independently; elevation values are unexaggerated.</p>
    <p className="mt-1 text-caption leading-relaxed text-text-secondary">{credit.provider}{credit.year ? ` · ${credit.year}` : ''} · {accuracy == null ? 'Source accuracy unverified' : `Source vertical accuracy ${accuracy} m`} · {scene.terrain!.verticalDatum}.</p>
  </section>;
}
