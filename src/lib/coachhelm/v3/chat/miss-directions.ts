/** The eight the round RPC allows (`submit_round_atomic`); shots store a direction and a distance, not a map position. No dependencies, so the Miss Compass and the server share them. */
export const MISS_DIRECTIONS = ['short', 'long', 'left', 'right', 'short_left', 'short_right', 'long_left', 'long_right'] as const;
export type MissDirection = (typeof MISS_DIRECTIONS)[number];

export const isMissDirection = (value: unknown): value is MissDirection => typeof value === 'string' && (MISS_DIRECTIONS as readonly string[]).includes(value);
