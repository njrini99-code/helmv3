'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clubhouseLightAt, LIGHT_PERIOD_MS, lightPlace, lightVars, NEUTRAL_LIGHT, ZONE_POINTS, type ClubhouseLight } from '../lib/light';
import type { LatLng } from '../lib/sun';

const Light = createContext<ClubhouseLight>(NEUTRAL_LIGHT);

/** Where the light's sun is (the course, or the team zone's point) and the team's zone, for day-length reads (sunTimes). */
export interface ChLightPlace {
  place: LatLng;
  timeZone: string;
  /** The place is the course the coach set, not the time zone's stand-in. */
  fromCourse: boolean;
}
const DEFAULT_ZONE = 'America/New_York';
const Place = createContext<ChLightPlace>({ place: ZONE_POINTS[DEFAULT_ZONE]!, timeZone: DEFAULT_ZONE, fromCourse: false });

/**
 * The global light (P001-A1): one sun for the whole Clubhouse. It writes the --ch-sun-* numbers on <html>, so portaled
 * sheets, menus and toasts share the frame's sun, and tokens.css derives the sky, the rims, the shadow lean and the paper
 * temperature from them. The server and the hydration pass draw noon (the CSS fallbacks); the real sun lands in an effect
 * and is recomputed every few minutes and when the tab comes back. Values change in place, never animated, so reduced
 * motion and Animations off need nothing of their own.
 */
export function LightProvider({
  course = null,
  timeZone = null,
  at = null,
  children,
}: {
  /** The team's course location (Team settings), when it is set. */
  course?: LatLng | null;
  /** The team's time zone: the sun's place until the course is set. */
  timeZone?: string | null;
  /** A held instant (the dev preview's ?at=); the real shell never passes it. */
  at?: number | null;
  children: ReactNode;
}) {
  const [light, setLight] = useState<ClubhouseLight>(NEUTRAL_LIGHT);
  const lat = course?.lat;
  const lng = course?.lng;

  useEffect(() => {
    const html = document.documentElement;
    const place = lat !== undefined && lng !== undefined ? { lat, lng } : null;
    let written: string[] = [];
    const apply = () => {
      const next = clubhouseLightAt(at ?? Date.now(), place, timeZone);
      const vars = lightVars(next);
      written = Object.keys(vars);
      for (const [name, value] of Object.entries(vars)) html.style.setProperty(name, value);
      setLight((prev) => (sameLight(prev, next) ? prev : next));
    };
    apply();
    const timer = at === null ? setInterval(apply, LIGHT_PERIOD_MS) : null;
    const onVisible = () => {
      if (document.visibilityState === 'visible') apply();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      for (const name of written) html.style.removeProperty(name);
    };
  }, [lat, lng, timeZone, at]);

  const zone = timeZone || DEFAULT_ZONE;
  const placeValue = useMemo<ChLightPlace>(() => {
    const course = lat !== undefined && lng !== undefined ? { lat, lng } : null;
    // The zone's stand-in point does not depend on the moment, except for an unlisted zone's offset (DST shifts it 15°).
    return { place: lightPlace(course, zone, at ?? Date.now()), timeZone: zone, fromCourse: course !== null };
  }, [lat, lng, zone, at]);

  return (
    <Place.Provider value={placeValue}>
      <Light.Provider value={light}>{children}</Light.Provider>
    </Place.Provider>
  );
}

/** The light's place and the team's zone: `sunTimes(day, place, timeZone)` gives that day's sunrise and sunset. */
export function useLightPlace(): ChLightPlace {
  return useContext(Place);
}

/** The current global light, for TS consumers (a chart's paper, a drawn sun). Noon until the shell's effect has run. */
export function useClubhouseLight(): ClubhouseLight {
  return useContext(Light);
}

function sameLight(a: ClubhouseLight, b: ClubhouseLight): boolean {
  return (Object.keys(a) as (keyof ClubhouseLight)[]).every((k) => a[k] === b[k]);
}
