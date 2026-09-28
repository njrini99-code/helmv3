/**
 * The Day block, the Week bar and the Month chip must paint an event type the
 * SAME colour. Day and Week read `typeTone().fill` (inline CSS variables);
 * Month reads `typeToneClasses().vars` (literal classes Tailwind can see).
 * This pins the two to one fill recipe and one ink per type.
 */
import { describe, it, expect } from 'vitest';
import { FILL_INK_PCT, typeTone, typeToneClasses } from '../eventPresentation';

const TYPES = ['practice', 'workout', 'tournament', 'qualifier', 'qualifying', 'travel', 'team_meeting', 'meeting', 'class', 'other'];

describe('event tones agree across the views', () => {
  it.each(TYPES)('%s: the class fill and ink match the inline fill and ink', (type) => {
    const tone = typeTone(type);
    const vars = typeToneClasses(type).vars;
    const pct = 100 - FILL_INK_PCT;
    expect(tone.fill).toBe(`color-mix(in oklch, ${tone.bg} ${pct}%, ${tone.ink})`);
    expect(vars).toContain(`[--ev-fill:color-mix(in_oklch,${tone.bg}_${pct}%,${tone.ink})]`);
    expect(vars).toContain(`[--ev-ink:${tone.ink}]`);
  });
});
