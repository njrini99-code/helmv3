/**
 * BaseballHelm entry-scene design tokens (docs/baseball/
 * ENTRY_SCENES_DESIGN.md ⚠ AMENDMENT — "The Practice Field at First
 * Light", 2026-07-02). Sibling to `src/components/golf/scenes/palette.ts`
 * — every painterly/abstract scene pulls its colors from one file so a
 * brand change touches one place.
 *
 * These values are the scene-layer equivalents of the shared First Light
 * sage & cream tokens (`src/components/marketing/first-light/
 * first-light.css` `:root` — cream `#F5F1E6`, cream-high `#FBF9F2`,
 * sage-mist `#E4E9DD`, sage `#94A38A`, sage-deep `#5C6E58`, sage-ink
 * `#2E3A2C`, brass `#B08D57`). SVG `fill`/`stop-color` needs real hex
 * (CSS `var()` inside SVG presentation attributes is unreliable across
 * the WKWebView targets this repo supports), so the hexes below are
 * hand-kept in sync with that file rather than referenced live — do not
 * drift them apart.
 */

/** EntryField — the auth/front-door scene. Both variants stay LIGHT (the
 * SAGE & CREAM amendment: "the page never goes dark"); dawn is the
 * warmer/larger bloom, dusk the cooler, deeper-sage cast. */
export const ENTRY_FIELD_PALETTE = {
  /** Morning-air vertical wash stops, bottom → top. */
  sky: {
    dawn: ['#F5F1E6', '#E4E9DD', '#F0E9D8'] as const,
    dusk: ['#F5F1E6', '#E4E9DD', '#94A38A'] as const,
  },
  /** The warm bloom — "the sun you never see." */
  bloom: {
    dawn: { inner: 'rgba(251, 249, 242, 0.95)', mid: 'rgba(251, 249, 242, 0.3)', r: 0.85 },
    dusk: { inner: 'rgba(251, 249, 242, 0.78)', mid: 'rgba(148, 163, 138, 0.26)', r: 0.6 },
  },
  /** The chalk geometry — sage-ink, always faint (6–10% per the amendment). */
  chalk: '#2E3A2C',
  /** The living detail — chalk-dust motes, cream-high. */
  dust: '#FBF9F2',
} as const;

/** IronRoomField — the Lift Lab scene (respecced: abstract, no windows/
 * shafts/interior illustration). May sit darker than EntryField — it's
 * in-app product chrome, not front-door chrome — but must read
 * considered, never murky. */
export const IRON_ROOM_PALETTE = {
  /** Vertical wash, top → bottom: warm graphite → sage-ink. */
  wash: ['#4A4238', '#2E3A2C'] as const,
  plateFace: '#5C5648',
  plateShadow: '#1F251D',
  brass: '#B08D57',
  glint: '#F5EDD8',
  /** The single kept kelly accent — in-app surface, product green is at
   * home here (unlike EntryField, which never uses it). */
  collar: '#16A34A',
  collarRim: '#0F3D1E',
} as const;

export type ScenePalette = typeof ENTRY_FIELD_PALETTE;
