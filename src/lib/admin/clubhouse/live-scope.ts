/**
 * The live half of the scope bar (plan §7.3): the window and the platform, carried in the URL as `w` and `pf` beside
 * page, role and viewport. Its own small module so the scope bar (a client component) does not pull the live model
 * and the ingest code into the browser bundle.
 */

export const LIVE_WINDOWS = ['1h', '24h', '7d', '30d'] as const;
export type LiveWindow = (typeof LIVE_WINDOWS)[number];
export const LIVE_PLATFORMS = ['all', 'ios-app', 'ios-safari', 'desktop', 'other'] as const;
export type LivePlatform = (typeof LIVE_PLATFORMS)[number];

export interface LiveScope {
  w: LiveWindow;
  pf: LivePlatform;
}

export const DEFAULT_LIVE: LiveScope = { w: '24h', pf: 'all' };

const HOUR_MS = 3_600_000;
export const WINDOW_MS: Readonly<Record<LiveWindow, number>> = { '1h': HOUR_MS, '24h': 24 * HOUR_MS, '7d': 7 * 24 * HOUR_MS, '30d': 30 * 24 * HOUR_MS };

export const PLATFORM_WORDS: Readonly<Record<string, string>> = {
  all: 'all platforms',
  'ios-app': 'iOS app',
  'ios-safari': 'iPhone Safari',
  desktop: 'desktop',
  other: 'other',
};

type Params = Record<string, string | string[] | undefined>;

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/** An unknown value falls back to the default, never throws: a stale link opens the last 24 hours. */
export function parseLiveScope(sp: Params | undefined): LiveScope {
  const w = first(sp?.w);
  const pf = first(sp?.pf);
  return {
    w: (LIVE_WINDOWS as readonly string[]).includes(w ?? '') ? (w as LiveWindow) : DEFAULT_LIVE.w,
    pf: (LIVE_PLATFORMS as readonly string[]).includes(pf ?? '') ? (pf as LivePlatform) : DEFAULT_LIVE.pf,
  };
}

export function describeLive(live: LiveScope): string {
  return `last ${live.w} · ${PLATFORM_WORDS[live.pf] ?? live.pf}`;
}
