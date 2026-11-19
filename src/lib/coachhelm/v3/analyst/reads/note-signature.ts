/**
 * "Nothing found" reads, by signature: tee-strategy.ts `sharp` ("already performing") and `inconclusive` ("no clear
 * preference"), putt-bias.ts `balanced` ("no directional bias detected"). One copy, read by the Clubhouse classifier (a
 * client module, so this file imports nothing) and by the reads rule for the server readers (visibility.ts).
 */
export const NOTE_SIGNATURE = /(?:^|:)(?:tee_strategy:(?:sharp|inconclusive)|putt_bias:balanced)$/;
