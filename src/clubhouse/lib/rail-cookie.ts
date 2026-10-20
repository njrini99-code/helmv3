/**
 * The cookie that remembers a folded sidebar ("1" folded), so a reload draws the icon rail from the first frame and
 * the dashboard never jumps from the wide sidebar to the rail. A plain module for the same reason as phone-cookie.ts:
 * the server reads it in phone-hint.ts and the client writes it in shell/RailToggle.tsx.
 */
export const CH_RAIL_COOKIE = 'ch_rail';
