/**
 * G-46 — `AttachmentPreview.tsx` was the composer's last legacy-palette child.
 *
 * ESLint does not catch a banned Tailwind color class (`.claude/rules/
 * quality-gates.md` says so of arbitrary values, and the same holds for a
 * retired palette name), and neither does the Review Gate: its blocking rules
 * are about RLS, auth and table names. So nothing would have told us if this
 * file drifted back — the finding stayed open for as long as it did precisely
 * because no gate could see it.
 *
 * Asserted on the source. The classes are strings in JSX with no runtime
 * behaviour to observe: rendering the component and reading `className` would
 * assert the same strings through three more layers, and would not cover the
 * branches (error, uploading, audio, document) without building four fixtures
 * to prove a lint fact.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(process.cwd(), 'src/components/golf/messages/AttachmentPreview.tsx'),
  'utf-8',
);

/** Comment-stripped — this file's own docstring names every banned class. */
const code = source
  .split('\n')
  .filter((line) => {
    const t = line.trim();
    return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
  })
  .join('\n');

describe('AttachmentPreview paints from Fairway tokens only (G-46)', () => {
  it.each([
    ['warm-*', /\b(?:bg|text|border|ring|from|to)-warm-\d{2,3}\b/],
    ['cream-*', /\b(?:bg|text|border|ring|from|to)-cream-\d{2,3}\b/],
    ['red-*', /\b(?:bg|text|border|ring|from|to)-red-\d{2,3}\b/],
    ['primary-*', /\b(?:bg|text|border|ring|from|to)-primary-\d{2,3}\b/],
    ['purple-*', /\b(?:bg|text|border|ring|from|to)-purple-\d{2,3}\b/],
    ['blue-*', /\b(?:bg|text|border|ring|from|to)-blue-\d{2,3}\b/],
  ])('uses no %s class', (_name, pattern) => {
    expect(code).not.toMatch(pattern);
  });

  it('uses no raw-Tailwind radius on the Fairway path', () => {
    // `rounded-full` is on the pill axis and legal in both scales; the
    // card-family steps must come from the fw ramp.
    expect(code).not.toMatch(/\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/);
    expect(code).not.toMatch(/\brounded-\[\d+px\]/);
  });

  it('maps every surface, ink and status onto a token utility', () => {
    for (const cls of [
      'bg-surface-sunken',
      'bg-surface',
      'border-border-subtle',
      'text-text-primary',
      'text-text-secondary',
      'text-text-tertiary',
      'bg-fw-danger-bg',
      'text-fw-danger',
      'text-fw-danger-ink',
      'bg-accent-500',
      'bg-accent-600',
      'rounded-fw-md',
    ]) {
      expect(code).toContain(cls);
    }
  });

  it('keeps the video scrim literal, which is deliberate', () => {
    // Not an oversight: a scrim over arbitrary user media is one of the few
    // places a literal is more honest than a surface token.
    expect(code).toContain('bg-black/20');
  });

  it('leaves the remove control on the module MessageComposer itself uses', () => {
    // The 20px target is a real WCAG 2.2 SC 2.5.8 failure, tracked as G-60
    // against W5/G-47 where composer geometry is owned. G-46 is a palette
    // migration; silently changing a control size under it would be a
    // different change wearing this one's name.
    expect(code).toContain("from '@/components/ui/button'");
    expect(code).toContain("'absolute -top-1 -right-1 w-5 h-5 rounded-full',");
  });
});
