'use client';

import { useEffect, useRef, useState } from 'react';
import { getMapboxToken, HELM_MAP_STYLE, DEFAULT_VIEWPORT } from '@/lib/mapbox/client';

export interface CourseMapMarker {
  id: string;
  longitude: number;
  latitude: number;
  label?: string;
}

interface CourseMapProps {
  /**
   * Initial viewport. Defaults to continental US — pass a course
   * centroid for Round Review and Travel use cases.
   */
  longitude?: number;
  latitude?: number;
  zoom?: number;
  /**
   * Pins to render. Use stable ids so React can diff cleanly when the
   * marker set updates (e.g. as new shots come in mid-round).
   */
  markers?: CourseMapMarker[];
  /**
   * Map style URL. Defaults to the Helm house style; pass your own
   * Mapbox Studio style for a one-off (e.g. dark mode round review).
   */
  styleUrl?: string;
  className?: string;
  /**
   * Hide all UI controls (compass, zoom buttons). Useful for embedded
   * mini-maps in cards.
   */
  minimal?: boolean;
}

/**
 * Lightweight Mapbox GL React wrapper.
 *
 * Why no `react-map-gl` (the popular wrapper):
 *   - `react-map-gl` adds ~30KB on top of mapbox-gl and re-renders
 *     liberally. For our use cases (courses, travel, recruiting
 *     heat-maps) the imperative mapbox-gl API is plenty.
 *   - We can always add it later without changing this component's
 *     surface area.
 *
 * SSR notes:
 *   - The dynamic `import()` is necessary because `mapbox-gl` reaches
 *     for `window` at module load.
 *   - The 'use client' directive plus the conditional render based on
 *     `mounted` state guarantees no server render of the canvas.
 *
 * Capacitor (iOS) notes:
 *   - Works as-is inside the WKWebView Capacitor wraps. Caps the same
 *     50K loads / 25K MAU free quota — see the Mapbox dashboard.
 *   - For better performance, add the `@capacitor-community/mapbox-gl`
 *     native plugin in a follow-up; this component will accept both.
 */
export function CourseMap({
  longitude = DEFAULT_VIEWPORT.longitude,
  latitude = DEFAULT_VIEWPORT.latitude,
  zoom = DEFAULT_VIEWPORT.zoom,
  markers = [],
  styleUrl = HELM_MAP_STYLE,
  className,
  minimal = false,
}: CourseMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Use `any` for the mapbox instance because the type lives behind a
  // dynamic import — pinning it here would force eager type loading.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current) return;

    let cancelled = false;
    let mapInstance: { remove: () => void } | null = null;

    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      // mapbox-gl needs its CSS — import once and the bundler dedupes.
      await import('mapbox-gl/dist/mapbox-gl.css');

      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = getMapboxToken();

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: styleUrl,
        center: [longitude, latitude],
        zoom,
        attributionControl: !minimal,
      });

      if (!minimal) {
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      }

      map.on('load', () => {
        for (const m of markers) {
          const marker = new mapboxgl.Marker()
            .setLngLat([m.longitude, m.latitude])
            .addTo(map);
          if (m.label) {
            marker.setPopup(new mapboxgl.Popup({ offset: 24 }).setText(m.label));
          }
        }
      });

      mapRef.current = map;
      mapInstance = map;
    })();

    return () => {
      cancelled = true;
      mapInstance?.remove();
      mapRef.current = null;
    };
    // Intentionally re-init when style or initial viewport changes.
    // Marker updates without a re-init would need an imperative diff;
    // see `react-map-gl` if we need that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, styleUrl, longitude, latitude, zoom, minimal]);

  return (
    <div
      ref={containerRef}
      className={className ?? 'h-64 w-full rounded-2xl overflow-hidden border border-white/20'}
      data-testid="course-map"
    />
  );
}
