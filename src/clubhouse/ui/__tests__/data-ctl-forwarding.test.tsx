import { cleanup, render } from '@testing-library/react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Spec §4.7 (D11): every control carries `data-ctl="CTL-P###-NNN"` at its call site, and the Bridge counts taps by the
 * attribute on the DOM element. A shared component must hand its caller's id to the element it draws; typecheck can't
 * see a forwarder that drops it, so this does.
 */
vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
import { Button, IconButton } from '../Button';
import { BackLink } from '../Section';
import { PhoneIconAction, PhoneTextAction } from '../PhoneBar';
import { LedgerRow, FeatureCard } from '../Ledger';
import { ExportButton } from '../ExportButton';
import { HowStatsCountLink } from '../StatTerm';

afterEach(cleanup);

const router = { prefetch: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() };
const wrap = (ui: ReactNode) => render(<AppRouterContext.Provider value={router as never}>{ui}</AppRouterContext.Provider>);
const ctl = (c: HTMLElement, id: string) => c.querySelector(`[data-ctl="${id}"]`);

describe('shared components forward data-ctl to their DOM element', () => {
  it('Button and IconButton, as a button and as a link', () => {
    const { container } = wrap(
      <>
        <Button data-ctl="CTL-P007-001" onClick={() => {}}>Send</Button>
        <Button data-ctl="CTL-P007-002" href="/x">Open</Button>
        <IconButton data-ctl="CTL-P007-003" icon={Plus} label="Add" onClick={() => {}} />
        <IconButton data-ctl="CTL-P007-004" icon={Plus} label="Add" href="/y" />
      </>,
    );
    expect(ctl(container, 'CTL-P007-001')?.tagName).toBe('BUTTON');
    expect(ctl(container, 'CTL-P007-002')?.tagName).toBe('A');
    expect(ctl(container, 'CTL-P007-003')?.tagName).toBe('BUTTON');
    expect(ctl(container, 'CTL-P007-004')?.tagName).toBe('A');
  });

  it('BackLink, the phone bar actions, ledger rows, feature cards, Export and How stats are counted', () => {
    const { container } = wrap(
      <>
        <BackLink data-ctl="CTL-P001-001" href="/a">Back</BackLink>
        <BackLink data-ctl="CTL-P001-002" onClick={() => {}}>Back</BackLink>
        <PhoneIconAction data-ctl="CTL-P001-003" icon={Plus} label="Add" onClick={() => {}} />
        <PhoneTextAction data-ctl="CTL-P001-004" onClick={() => {}}>Next</PhoneTextAction>
        <ul>
          <LedgerRow data-ctl="CTL-P001-005" title="Row" href="/r" />
          <LedgerRow data-ctl="CTL-P001-006" title="Row" onClick={() => {}} />
        </ul>
        <FeatureCard data-ctl="CTL-P001-007" kicker="K" title="T" href="/f" />
        <ExportButton data-ctl="CTL-P001-008" file={() => ({ name: 'x', rows: [] }) as never} done={() => 'done'} failed="failed" code="CH-0000" surface="test.export" />
        <HowStatsCountLink data-ctl="CTL-P001-009" />
      </>,
    );
    for (let n = 1; n <= 9; n += 1) expect(ctl(container, `CTL-P001-00${n}`), `CTL-P001-00${n}`).not.toBeNull();
  });
});
