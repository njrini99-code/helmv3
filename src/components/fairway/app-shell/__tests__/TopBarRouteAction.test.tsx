import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TopBarRouteAction, TopBarRouteActionOutlet, TopBarRouteActionProvider } from '../TopBarRouteAction';

describe('TopBarRouteAction (DASH-18)', () => {
  it('portals a route action into the shell outlet', () => {
    const { container } = render(
      <TopBarRouteActionProvider>
        <header>
          <TopBarRouteActionOutlet />
        </header>
        <main>
          <TopBarRouteAction>
            <span>New message</span>
          </TopBarRouteAction>
        </main>
      </TopBarRouteActionProvider>,
    );
    const outlet = container.querySelector('[data-slot="fw-topbar-route-action"]')!;
    expect(outlet.textContent).toBe('New message');
    expect(container.querySelector('main')!.textContent).toBe('');
  });

  it('renders nothing without a shell outlet', () => {
    const { container } = render(
      <TopBarRouteAction>
        <span>New message</span>
      </TopBarRouteAction>,
    );
    expect(container.textContent).toBe('');
  });

  it('keeps the shared bar on the phone conversation list; hides it for an open thread and on wide screens', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(css).toContain("body:has([data-fw-messages][data-fw-thread-open]) [data-slot='fw-topbar']");
    expect(css).not.toMatch(/body:has\(\[data-fw-messages\]\) \[data-slot='fw-topbar'\],/);
    expect(css).toMatch(/@media \(min-width: 768px\) \{\s*body:has\(\[data-fw-messages\]\) \[data-slot='fw-topbar'\]/);
  });
});
