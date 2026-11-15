// Known motion breaks per gate screen, keyed `<screen id>|motion` or `<screen id>|reduce`, exactly as
// e2e/clubhouse-motion-gate.spec.ts prints them. The list may only shrink: a break that no longer happens fails the gate
// until its line is removed. Recorded from the first run; each entry is a real finding against the motion doctrine.
export const MOTION_KNOWN: Record<string, string[]> = {};
