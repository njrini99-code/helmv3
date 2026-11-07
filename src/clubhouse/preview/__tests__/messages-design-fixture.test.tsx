import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESIGN_ROUTE_CONV, DESIGN_ROUTES, DESIGN_THREADS } from '../messages-design-cast';

/** Messages 11a: `?state=design&view=<route>` reaches every route the design page draws, on the page's cast. */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/messages', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../ui/Toast', () => ({ useToast: () => vi.fn(), useToastPill: vi.fn() }));
vi.mock('../../lib/use-phone', () => ({ useChPhone: () => true, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));

import { PreviewMessages } from '../PreviewMessages';

afterEach(cleanup);

describe('the Messages design fixture', () => {
  it('names 34 routes, and each route it opens has a thread', () => {
    expect(DESIGN_ROUTES).toHaveLength(34);
    for (const conv of Object.values(DESIGN_ROUTE_CONV)) expect(DESIGN_THREADS[conv]).toBeDefined();
  });

  it.each(DESIGN_ROUTES)('marks the root for %s', (view) => {
    const { container } = render(<PreviewMessages state="design" view={view} />);
    expect(container.querySelector(`[data-ch-preview-view="${view}"]`)).not.toBeNull();
    expect(container.querySelector('[data-ch-ms-v2]')).not.toBeNull();
    expect(window.__chMsgFixture).toBeDefined();
  });

  it('marks the demo it is playing', () => {
    const { container } = render(<PreviewMessages state="design" view="thread" play="send" />);
    expect(container.querySelector('[data-ch-preview-play="send"]')).not.toBeNull();
  });
});
