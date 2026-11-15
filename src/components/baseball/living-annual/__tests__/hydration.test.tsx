import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'motion/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// motion's own hook, as each side sees it: the server can't know the setting (null); the reader's browser says reduce.
const state = vi.hoisted(() => ({ reduced: null as boolean | null }));
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => state.reduced,
}));

import { HairlineRule } from '../HairlineRule';
import { Reveal } from '../Reveal';

afterEach(() => {
  state.reduced = null;
  vi.restoreAllMocks();
});

const Tree = () => (
  <LazyMotion features={domAnimation}>
    <HairlineRule />
    <Reveal>Sign in to BaseballHelm</Reveal>
  </LazyMotion>
);

describe('Living Annual atoms hydrate under reduced motion (prod audit SWP-24)', () => {
  it('hydrate the server’s markup with no mismatch, then settle still', async () => {
    const html = renderToString(<Tree />);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.reduced = true;
    await act(async () => {
      hydrateRoot(container, <Tree />);
    });
    const said = errors.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(said).not.toMatch(/hydrat|didn.t match/i);
    // After hydration the rule is the still one: drawn, with no draw-in transform.
    const rule = container.querySelector<HTMLElement>('[aria-hidden]')!;
    expect(rule.style.transform).toBe('');
    container.remove();
  });
});
