import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';
import { InsufficientData } from './InsufficientData';

describe('feedback before hydration', () => {
  it.each([
    ['empty collection', <EmptyState title="No rounds yet" description="Log your first round." />],
    ['insufficient data', <InsufficientData current={2} required={5} unit="rounds" />],
  ])('renders %s guidance without a transparent root', (_, node) => {
    const markup = renderToStaticMarkup(node);
    const root = document.createElement('div');
    root.innerHTML = markup;
    const status = root.querySelector<HTMLElement>('[role="status"]')!;
    expect(status.textContent).toBeTruthy();
    expect(status.style.opacity).not.toBe('0');
  });
});
