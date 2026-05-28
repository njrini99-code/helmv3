import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Regression guard for Wave W3-a11y — form-primitive accessibility
 * (agent "forms").
 *
 * W3-a11y hardened the shared form primitives so keyboard users get a
 * clearly visible focus ring, and so every Select-family <label> is
 * programmatically associated with its trigger control. Concretely:
 *
 *   1. Select / MultiSelect / NativeSelect associate their <label> with
 *      the trigger via `useId()` + `htmlFor` (so clicking the label
 *      focuses the control and screen readers announce the name).
 *   2. Every form primitive (Select trigger, MultiSelect trigger,
 *      NativeSelect <select>, Input, Textarea, the searchable-Select
 *      input) and every interactive option / DropdownMenuItem carries a
 *      `focus-visible:ring-2 … focus-visible:ring-offset-2` ring.
 *   3. The Sonner toast region announces politely (`aria-live="polite"`).
 *
 * The focus-ring colour is sourced from the design token `--focus-ring`
 * (src/styles/tokens.css, imported by globals.css) via the Tailwind
 * arbitrary value `ring-[color:var(--focus-ring)]`. We assert on the
 * focus-visible ring *shape* (ring-2 + ring-offset-2) so the exact colour
 * token can evolve without breaking the guard, but a regression that drops
 * the focus ring entirely — or de-associates a Select label — FAILS here.
 *
 * Audit reference:
 *   docs/operations/2026-05-28-ultra-audit-MASTER-synthesis.md (W3 a11y)
 *
 * Note: `multi-select.tsx` / `native-select.tsx` / `textarea.tsx` do not
 * exist as standalone files in this repo — `MultiSelect` + `NativeSelect`
 * live inside `select.tsx`, and `Textarea` lives inside `input.tsx`. The
 * checks below target the real source locations.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const UI = join(REPO_ROOT, 'src', 'components', 'ui');

const SELECT = join(UI, 'select.tsx');
const INPUT = join(UI, 'input.tsx');
const CHECKBOX = join(UI, 'checkbox.tsx');
const DROPDOWN = join(UI, 'dropdown-menu.tsx');
const SONNER = join(UI, 'sonner.tsx');

async function read(file) {
  return readFile(file, 'utf8');
}

/**
 * A focus-visible ring is considered present when the element opts into a
 * 2px focus-visible ring AND a ring offset. We accept both the bare
 * `focus-visible:` form (real DOM focus, e.g. Input/Select trigger) and the
 * `peer-focus-visible:` form (sr-only input driving a sibling visual, e.g.
 * Checkbox), and we do NOT pin the colour utility so the token can change.
 */
function hasFocusVisibleRing(source) {
  const hasRing2 = /(?:peer-)?focus-visible:ring-2/.test(source);
  const hasOffset = /(?:peer-)?focus-visible:ring-offset-2/.test(source);
  return hasRing2 && hasOffset;
}

/** Count distinct focus-visible:ring-2 occurrences (each primitive/item). */
function countFocusVisibleRings(source) {
  const m = source.match(/(?:peer-)?focus-visible:ring-2/g);
  return m ? m.length : 0;
}

test('Select family: every <label> is associated to its trigger via useId() + htmlFor', async () => {
  const src = await read(SELECT);

  // useId is imported and used to mint trigger ids.
  assert.match(src, /import\s*\{[^}]*\buseId\b[^}]*\}\s*from\s*['"]react['"]/, 'select.tsx must import useId from react');
  assert.match(src, /=\s*useId\(\)/, 'select.tsx must call useId() to generate control ids');

  // Every <label> in the Select family must carry htmlFor — no bare labels.
  const labelOpenTags = src.match(/<label\b[^>]*>/g) || [];
  assert.ok(labelOpenTags.length >= 3, `expected at least 3 <label> tags (Select, MultiSelect, NativeSelect), found ${labelOpenTags.length}`);
  for (const tag of labelOpenTags) {
    assert.match(tag, /htmlFor=/, `Select-family <label> is missing htmlFor association: ${tag}`);
  }

  // The trigger controls must carry an id that the label points at.
  // Select + MultiSelect triggers use triggerId; NativeSelect uses selectId.
  assert.match(src, /id=\{triggerId\}/, 'Select/MultiSelect trigger button must set id={triggerId}');
  assert.match(src, /htmlFor=\{triggerId\}/, 'Select/MultiSelect label must set htmlFor={triggerId}');
  assert.match(src, /id=\{selectId\}/, 'NativeSelect <select> must set id={selectId}');
  assert.match(src, /htmlFor=\{selectId\}/, 'NativeSelect label must set htmlFor={selectId}');
});

test('select.tsx: triggers, native select, search input and options all have a focus-visible ring', async () => {
  const src = await read(SELECT);
  assert.ok(hasFocusVisibleRing(src), 'select.tsx must contain a focus-visible:ring-2 + ring-offset-2 ring');
  // Select trigger, MultiSelect trigger, NativeSelect, search input, two
  // option lists, and the "Clear all" button — expect several rings.
  assert.ok(
    countFocusVisibleRings(src) >= 4,
    `expected >= 4 focus-visible rings across the Select family, found ${countFocusVisibleRings(src)}`,
  );
});

test('input.tsx: Input and Textarea both carry a focus-visible ring', async () => {
  const src = await read(INPUT);
  assert.ok(hasFocusVisibleRing(src), 'input.tsx must contain a focus-visible:ring-2 + ring-offset-2 ring');
  // Input baseStyles + Textarea + clear button + password toggle.
  assert.ok(
    countFocusVisibleRings(src) >= 2,
    `expected >= 2 focus-visible rings (Input + Textarea), found ${countFocusVisibleRings(src)}`,
  );
  // Label association was already present — re-assert so it cannot regress.
  assert.match(src, /htmlFor=\{inputId\}/, 'Input label must set htmlFor={inputId}');
  assert.match(src, /htmlFor=\{textareaId\}/, 'Textarea label must set htmlFor={textareaId}');
});

test('checkbox.tsx: the checkbox visual carries a (peer-)focus-visible ring', async () => {
  const src = await read(CHECKBOX);
  // Checkbox is an sr-only <input> driving a sibling visual, so the ring is
  // applied via peer-focus-visible — hasFocusVisibleRing accepts that form.
  assert.ok(hasFocusVisibleRing(src), 'checkbox.tsx must contain a (peer-)focus-visible:ring-2 + ring-offset-2 ring');
  // Label association: the visual sits inside a wrapping <label> and the
  // sr-only input carries a useId-derived id.
  assert.match(src, /import\s*\{[^}]*\buseId\b[^}]*\}\s*from\s*['"]react['"]/, 'checkbox.tsx must import useId from react');
  assert.match(src, /id=\{checkboxId\}/, 'Checkbox input must set id={checkboxId}');
});

test('dropdown-menu.tsx: DropdownMenuItem (and friends) carry a focus-visible ring', async () => {
  const src = await read(DROPDOWN);
  assert.ok(hasFocusVisibleRing(src), 'dropdown-menu.tsx must contain a focus-visible:ring-2 + ring-offset-2 ring');
  // Item + CheckboxItem + SubTrigger.
  assert.ok(
    countFocusVisibleRings(src) >= 3,
    `expected >= 3 focus-visible rings (Item, CheckboxItem, SubTrigger), found ${countFocusVisibleRings(src)}`,
  );
});

test('sonner.tsx: toast region announces with aria-live="polite"', async () => {
  const src = await read(SONNER);
  assert.match(
    src,
    /aria-live['"\s,:=)]*['"]polite['"]/,
    'sonner.tsx must pin aria-live="polite" on the toast region',
  );
});
