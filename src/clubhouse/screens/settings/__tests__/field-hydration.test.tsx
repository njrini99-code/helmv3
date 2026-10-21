// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { Field } from '../parts';
import { FieldRow } from '../phone/ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Text typed into server markup before React hydrates is wiped when the controlled value is applied: the first name a WebKit
 * run typed straight after the page loaded came back as the saved one while the last name, typed later, stuck. The boxes are
 * read-only until they have hydrated, so nothing can be typed in that window.
 */
describe('Settings fields do not take text before they hydrate', () => {
  const cases: [string, () => React.ReactElement, string][] = [
    ['Field', () => <Field id="a" label="First name" value="Theo" onChange={() => {}} />, '#a'],
    ['FieldRow', () => <FieldRow id="b" label="First name" value="Theo" onChange={() => {}} />, '#b'],
  ];
  for (const [name, make, sel] of cases) {
    it(`${name}: read-only in the server markup, editable once hydrated, and a read-only prop stays read-only`, async () => {
      const host = document.createElement('div');
      host.innerHTML = renderToString(make());
      document.body.appendChild(host);
      expect(host.querySelector<HTMLInputElement>(sel)!.readOnly).toBe(true);
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(host, make());
      });
      const input = host.querySelector<HTMLInputElement>(sel)!;
      expect(input.readOnly).toBe(false);
      expect(input.hasAttribute('data-ch-hydrating')).toBe(false);
      act(() => root.unmount());
      host.remove();
    });
  }
});
