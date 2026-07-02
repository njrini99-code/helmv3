/**
 * BaseballHelm entry-scene design tokens (docs/baseball/ENTRY_SCENES_DESIGN.md).
 * Sibling to `src/components/golf/scenes/palette.ts` — same idea (every
 * painterly scene pulls its colors from one file so a brand change touches
 * one place), new sports/moods: the Yard at Dusk (login) and the Iron Room
 * at Dawn (Lift Lab). Values are lifted verbatim from the spec's layer
 * lists — do not "improve" a hex without updating the spec too.
 */

/** Vertical sky gradient stops, back → front, per `variant`. Dusk is the
 * Yard's primary mood; dawn only warms the horizon stop (spec: "dawn
 * variant warms the horizon to #F2E4C4"). */
export const YARD_SKY = {
  dusk: ['#14261F', '#3E5C4B', '#E8D9B0'] as const,
  dawn: ['#14261F', '#3E5C4B', '#F2E4C4'] as const,
} as const;

export const SCENE_PALETTE = {
  yard: {
    sky: YARD_SKY,
    treeLine: '#143527',
    wall: '#1C3A2C',
    marker: '#F5EDD8',
    grassLight: '#2E5C43',
    grassDark: '#27523B',
    infield: ['#B0703C', '#9A5F32'] as const,
    chalk: '#F5EDD8',
    base: '#F5EDD8',
    mound: '#9A5F32',
    towerMast: '#0F211A',
    towerGlow: '#F7EAC8',
    flag: '#B83A29',
    flagShadow: '#7A2418',
    mote: '#FFF6DE',
  },
  ironRoom: {
    roomTop: '#2A2622',
    roomBottom: '#1F1C19',
    floorLine: '#3A342E',
    window: '#F5EDD8',
    shaftMorning: 'rgba(245, 237, 216, 0.14)',
    shaftEvening: 'rgba(245, 237, 216, 0.08)',
    barSteel: '#4A4238',
    plateShadow: '#161311',
    brass: '#B08D57',
    collar: '#16A34A',
    chalkDust: '#F5EDD8',
  },
} as const;

export type ScenePalette = typeof SCENE_PALETTE;
