/**
 * Mapbox token accessor. Centralized so the only place the env var
 * name lives is here — if it ever changes (e.g. moving to per-environment
 * tokens), one edit covers every map in the app.
 *
 * The token is public-by-design (it ships in the client bundle).
 * Restrict it by URL in the Mapbox dashboard
 * (https://account.mapbox.com/access-tokens/) to prevent abuse.
 *
 * Free tier limits (2026):
 *   - Web SDK: 50K map loads / month
 *   - Mobile (Capacitor wraps the Web SDK): 25K MAUs / month
 */
export function getMapboxToken(): string {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    throw new Error(
      'NEXT_PUBLIC_MAPBOX_TOKEN is not set. ' +
        'Add it to .env.local — see .env.example for instructions.',
    );
  }
  return token;
}

/**
 * Helm's house map style. Use this everywhere unless you have a
 * specific reason not to — keeps the visual language consistent across
 * Travel, Round Review, recruiting heat-maps, etc.
 *
 * Swap to a custom style once we have one published in the Mapbox
 * Studio dashboard (cream/helm-green color match for the rest of the
 * app — see docs/v3-design-language.md).
 */
export const HELM_MAP_STYLE = 'mapbox://styles/mapbox/outdoors-v12';

/**
 * Default viewport when no specific bounds are provided. Centered on
 * the continental US so college-team users see something meaningful
 * before they zoom.
 */
export const DEFAULT_VIEWPORT = {
  longitude: -98.5,
  latitude: 39.5,
  zoom: 3.5,
} as const;
