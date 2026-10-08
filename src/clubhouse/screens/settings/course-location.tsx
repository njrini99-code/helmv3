'use client';

import { LocateFixed, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useId, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { haptic } from '../../lib/haptics';
import { chReport } from '../../lib/track';
import { useAction } from '../../lib/use-action';
import { Card } from './parts';
import type { ChResult } from './model';
import { Group } from './phone/ui';

/**
 * The team's course location (P001-A1, D3-1; owner 2026-10-08): where the Clubhouse's global light takes its sun from,
 * set once here. The browser's own Geolocation reads where the coach is standing (at the course), rounded to two
 * decimals (about a kilometre); there is no geocoding service. Until it is set the light follows the team's time zone.
 *
 * The columns arrive with migration 20261008150000 (held for the owner's apply). Until then the select that names them
 * fails and this section draws nothing: a missing column must never trouble the Team section. The fields are typed here
 * until `npm run db:types` runs after the apply.
 */
export interface ChCourseLocation {
  lat: number;
  lng: number;
  label: string | null;
}

export type ChCourseRead = { status: 'off' } | { status: 'failed' } | { status: 'ok'; value: ChCourseLocation | null };

export interface ChCourseSource {
  read(): Promise<ChCourseRead>;
  save(value: ChCourseLocation | null): Promise<ChResult>;
}

export const COURSE_LABEL_MAX = 80;

/** Two decimals: about a kilometre, enough for the sun and no closer to the coach's exact spot. */
export const roundCoord = (v: number): number => Math.round(v * 100) / 100 + 0;

/** The column is not there yet (the migration is unapplied): Postgres 42703, or PostgREST's schema-cache miss. */
export function isMissingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(error.message ?? '');
}

type Row = { course_latitude: number | null; course_longitude: number | null; course_label: string | null };
type Untyped = {
  select(cols: string): { eq(c: string, v: string): { maybeSingle(): Promise<{ data: Row | null; error: { code?: string; message?: string } | null }> } };
  upsert(row: Record<string, unknown>, opts: { onConflict: string }): Promise<{ error: { code?: string; message?: string } | null }>;
};

export function liveCourseSource(teamId: string): ChCourseSource {
  // The generated types do not have the columns until the migration is applied and db:types runs.
  const table = () => createClient().from('golf_team_settings') as unknown as Untyped;
  return {
    async read() {
      const { data, error } = await table().select('course_latitude, course_longitude, course_label').eq('team_id', teamId).maybeSingle();
      if (isMissingColumn(error)) return { status: 'off' };
      if (error) {
        chReport(error, { surface: 'settings.team', action: 'readCourseLocation' });
        return { status: 'failed' };
      }
      if (!data || data.course_latitude == null || data.course_longitude == null) return { status: 'ok', value: null };
      return { status: 'ok', value: { lat: data.course_latitude, lng: data.course_longitude, label: data.course_label } };
    },
    async save(v) {
      const { error } = await table().upsert(
        {
          team_id: teamId,
          course_latitude: v ? roundCoord(v.lat) : null,
          course_longitude: v ? roundCoord(v.lng) : null,
          course_label: v?.label?.trim().slice(0, COURSE_LABEL_MAX) || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'team_id' },
      );
      return error ? { success: false, error: error.message || 'failed' } : { success: true };
    },
  };
}

/** The live source, or the preview's and the tests' stand-in. */
export const CourseSourceContext = createContext<(teamId: string) => ChCourseSource>(liveCourseSource);

/** Where this device is, rounded; or the reason it can't say, in the coach's words. */
export function locateHere(geo: Geolocation | null | undefined = typeof navigator === 'undefined' ? undefined : navigator.geolocation): Promise<{ lat: number; lng: number } | { problem: string }> {
  if (!geo) return Promise.resolve({ problem: 'This browser can’t share its location.' });
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (p) => resolve({ lat: roundCoord(p.coords.latitude), lng: roundCoord(p.coords.longitude) }),
      (e) =>
        resolve({
          problem: e.code === 1 ? 'Location is off for this app. Allow it in your settings, then try again.' : 'Couldn’t find this device’s location. Try again outdoors.',
        }),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
  });
}

const fmt = (v: ChCourseLocation) => `${v.lat.toFixed(2)}, ${v.lng.toFixed(2)}`;

function useCourseLocation(teamId: string) {
  const sourceFor = useContext(CourseSourceContext);
  const [source] = useState(() => sourceFor(teamId));
  const [read, setRead] = useState<ChCourseRead | null>(null);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [label, setLabel] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let live = true;
    void source.read().then((r) => {
      if (!live) return;
      setRead(r);
      if (r.status === 'ok') setLabel(r.value?.label ?? '');
    });
    return () => {
      live = false;
    };
  }, [source]);

  const saved = read?.status === 'ok' ? read.value : null;
  const save = useAction(
    'settings.saveCourseLocation',
    async (value: ChCourseLocation | null) => {
      const r = await source.save(value);
      if (r.success) {
        setRead({ status: 'ok', value: value ? { lat: roundCoord(value.lat), lng: roundCoord(value.lng), label: value.label?.trim() || null } : null });
        setDraft(null);
        if (!value) setLabel('');
        // The shell reads the place with the page: a fresh read moves the sun.
        router.refresh();
      }
      return r;
    },
    (value: ChCourseLocation | null) => (value ? { done: 'Course location saved', failed: 'Couldn’t save the course location' } : { done: 'Course location cleared', failed: 'Couldn’t clear the course location' }),
  );

  const locate = useCallback(async () => {
    haptic('press');
    setProblem(null);
    setLocating(true);
    const r = await locateHere();
    setLocating(false);
    if ('problem' in r) setProblem(r.problem);
    else setDraft(r);
  }, []);

  const point = draft ?? (saved ? { lat: saved.lat, lng: saved.lng } : null);
  const dirty = draft !== null || (saved !== null && label.trim() !== (saved.label ?? ''));
  return { read, saved, point, draft, label, setLabel, problem, locating, locate, dirty, save };
}

const NOTE = 'The Clubhouse’s light follows the sun where your team plays. Until you set it, the light follows your team’s time zone.';

/** Desktop: a Settings card under Scoring. Draws nothing until the columns exist, or if the read failed. */
export function CourseLocationCard({ teamId }: { teamId: string }) {
  const c = useCourseLocation(teamId);
  const labelId = useId();
  if (c.read?.status !== 'ok') return null;
  const value = c.point ? { lat: c.point.lat, lng: c.point.lng, label: c.label } : null;
  return (
    <Card
      id="set-course"
      code="CH-8320"
      title="Course location"
      description={NOTE}
      foot={
        <>
          <span className="ch-set-course__state">{c.saved ? `Set${c.saved.label ? `: ${c.saved.label}` : ''}` : 'Not set'}</span>
          <span className="ch-set-course__acts">
            {c.saved && (
              <Button variant="ghost" size="sm" onClick={() => void c.save.run(null)} disabled={c.save.pending}>
                Clear
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => value && void c.save.run(value)} disabled={!c.dirty || !value || c.save.pending}>
              Save
            </Button>
          </span>
        </>
      }
    >
      <div className="ch-set-course">
        <div className="ch-set-course__where">
          <Icon icon={MapPin} size={15} />
          <span className="ch-num">{c.point ? fmt({ ...c.point, label: null }) : 'No location yet'}</span>
          <Button variant="secondary" size="sm" leftIcon={LocateFixed} onClick={() => void c.locate()} disabled={c.locating}>
            {c.locating ? 'Finding you…' : 'Use this device’s location'}
          </Button>
        </div>
        {c.problem && (
          <p className="ch-set-course__problem" role="alert">
            {c.problem}
          </p>
        )}
        <div className="ch-field">
          <label htmlFor={labelId} className="ch-field__label">
            Name
          </label>
          <input
            id={labelId}
            className="ch-input"
            value={c.label}
            maxLength={COURSE_LABEL_MAX}
            placeholder="Home course"
            onChange={(e) => c.setLabel(e.target.value)}
            aria-describedby={c.point ? undefined : `${labelId}-h`}
          />
          {!c.point && (
            <span id={`${labelId}-h`} className="ch-field__help">
              The name saves with the location.
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Phone: a Settings group with the same three things: where it is, Use this device's location, and Clear. */
export function CourseLocationPhone({ teamId }: { teamId: string }) {
  const c = useCourseLocation(teamId);
  const labelId = useId();
  if (c.read?.status !== 'ok') return null;
  const value = c.point ? { lat: c.point.lat, lng: c.point.lng, label: c.label } : null;
  return (
    <Group title="Course location" note={NOTE} code="CH-8320">
      <div className="ch-setm-row ch-set-course__prow">
        <span className="ch-setm-row__l">{c.saved?.label || 'Location'}</span>
        <span className="ch-setm-row__v ch-num">{c.point ? fmt({ ...c.point, label: null }) : 'Not set'}</span>
      </div>
      <button type="button" className="ch-setm-row is-plain" onClick={() => void c.locate()} disabled={c.locating}>
        <span className="ch-setm-row__l">{c.locating ? 'Finding you…' : 'Use this phone’s location'}</span>
      </button>
      {c.problem && (
        <p className="ch-set-course__problem ch-setm-row" role="alert">
          {c.problem}
        </p>
      )}
      {/* The name is usable before there is a point (a denied or unavailable location); it saves with the location. */}
      <label className="ch-setm-row ch-set-course__prow" htmlFor={labelId}>
        <span className="ch-setm-row__l">Name</span>
        <input id={labelId} className="ch-set-course__pin" value={c.label} maxLength={COURSE_LABEL_MAX} placeholder="Home course" onChange={(e) => c.setLabel(e.target.value)} />
      </label>
      {c.dirty && value && (
        <button type="button" className="ch-setm-row is-plain" onClick={() => void c.save.run(value)} disabled={c.save.pending}>
          <span className="ch-setm-row__l ch-set-course__save">Save</span>
        </button>
      )}
      {c.saved && !c.dirty && (
        <button type="button" className="ch-setm-row is-plain" onClick={() => void c.save.run(null)} disabled={c.save.pending}>
          <span className="ch-setm-row__l">Clear</span>
        </button>
      )}
    </Group>
  );
}
