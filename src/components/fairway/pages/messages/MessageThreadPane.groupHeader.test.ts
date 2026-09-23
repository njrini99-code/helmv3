/**
 * G-29c — a group's identity is WHO is in it.
 *
 * The header rendered a single static `Users` glyph in a tinted circle and a
 * subtitle that read "Group conversation" — a category label, next to a stack
 * of nothing. `Group.dc.html:27-34` draws an overlapping member stack and the
 * literal count, "9 members".
 *
 * MEASURED ON BOTH SIDES where a value maps: the artboard's cutout rim colour
 * is compared against the token the component names, and the artboard's own
 * two-avatars-then-overflow shape against the `max` the component passes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const artboard = read('audit/reference/Group.dc.html');
const tokens = read('src/styles/design-tokens.css');
const source = read('src/components/fairway/pages/messages/MessageThreadPane.tsx');
const avatar = read('src/components/fairway/controls/avatar.tsx');

/** Block comments removed whole — a JSX comment body reads as ordinary prose. */
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const code = strip(source);
const avatarCode = strip(avatar);

/** Read a `--fw-*` declaration's value out of the LIGHT block. */
function token(name: string): string {
  const m = tokens.match(new RegExp(`^\\s*${name}:\\s*([^;/]+)`, 'm'));
  expect(m, `expected ${name} in design-tokens.css`).not.toBeNull();
  return (m?.[1] ?? '').trim();
}

/** The artboard's stacked avatar circles. */
const stackedCircles = artboard
  .split('\n')
  .filter((l) => l.includes('border-radius: 9999px') && l.includes('border: 2px solid'));

describe('G-29c — the artboard states a stack, a rim, and a count', () => {
  it('draws overlapping circles with a cutout rim', () => {
    // Two members plus one overflow chip.
    expect(stackedCircles.length).toBe(3);
    expect(stackedCircles.filter((l) => l.includes('margin-left: -12px')).length).toBe(2);
  });

  it('the rim colour IS the surface the header sits on', () => {
    // This is the whole reason `ring-canvas` was wrong here: the rim reads as a
    // cutout in the header's own background, and this header sits on the
    // InstrumentPanel's surface, not on the page canvas.
    const surface = token('--fw-color-surface');
    for (const circle of stackedCircles) {
      expect(circle).toContain(`border: 2px solid ${surface}`);
    }
    expect(surface).not.toBe(token('--fw-color-canvas'));
  });

  it('the last circle is a literal overflow count, and the subtitle a member count', () => {
    expect(stackedCircles[2]).toContain('+7');
    expect(artboard).toContain('9 members');
  });
});

describe('G-29c — the component renders the stack, not a glyph', () => {
  it('stacks the participants it was already being handed', () => {
    expect(code).toContain('<AvatarGroup size="sm" max={2} ring="ring-surface"');
    expect(code).toContain('Array.from(groupParticipants.values())');
  });

  it('names the rim token the artboard states, not the primitive default', () => {
    expect(code).toContain('ring="ring-surface"');
    expect(code).not.toContain('ring="ring-canvas"');
  });

  it('keeps the glyph as the fallback, so a half-loaded map cannot lie', () => {
    // The map is fetched async. An empty stack — or a "+N" off a partial map —
    // would be a header that is briefly wrong on every group open.
    expect(code).toContain('groupParticipants && groupParticipants.size > 0');
    expect(code).toContain('<Users size={18} aria-hidden="true" />');
  });

  it('prints the literal member count instead of a category label', () => {
    expect(code).toContain('`${participantCount} members`');
    expect(code).not.toContain("'Group conversation'");
  });

  it('marks the faces decorative — the count and title already name the group', () => {
    const idx = code.indexOf('<AvatarGroup');
    expect(idx).toBeGreaterThan(-1);
    expect(code.slice(idx, idx + 400)).toContain('<Avatar key={i} decorative');
  });
});

describe('G-29c — the primitive gained a knob, not a fork', () => {
  it('AvatarGroup takes a ring colour and still defaults to the old one', () => {
    expect(avatarCode).toContain('ring?: string;');
    expect(avatarCode).toContain("ring = 'ring-canvas'");
  });

  it('applies it to BOTH the avatar rims and the overflow chip', () => {
    // Missing either one leaves a visibly mismatched circle in the stack.
    expect(avatarCode).toContain("cn('rounded-full ring-2', ring)");
    const chip = avatarCode.slice(avatarCode.indexOf('items-center justify-center rounded-full ring-2'));
    expect(chip.slice(0, 200)).toContain('ring,');
  });

  it('no longer hardcodes ring-canvas anywhere in the group', () => {
    expect(avatarCode).not.toContain('ring-2 ring-canvas');
  });
});
