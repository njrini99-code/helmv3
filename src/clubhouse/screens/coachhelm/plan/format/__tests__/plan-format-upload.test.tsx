import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// The sheet (FormSheet) is a phone component: its styles live in the phone media query, so on a desk it drew as a bare,
// unstyled <dialog> (owner's preview, 11 Nov 2026). On a desk "Upload a plan" opens the file picker at once; the phone
// keeps the sheet with its three ways in.
const phone = { value: false };
vi.mock('../../../../../lib/use-phone', () => ({ useChPhone: () => phone.value }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/golf/dashboard/practice/format', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/app/golf/actions/coachhelm-plan-format', () => ({ readPlanFormat: vi.fn(), setPlanFormat: vi.fn(), undoPlanFormat: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ createGolfDocument: vi.fn(), deleteGolfDocument: vi.fn(), uploadGolfDocument: vi.fn() }));

import { PlanFormat } from '../PlanFormat';

describe('Plan format: Upload a plan', () => {
  let click: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    // jsdom has no modal dialog.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });
  afterEach(() => {
    click.mockRestore();
    cleanup();
  });

  it('on a desk opens the file picker at once and draws no sheet', () => {
    phone.value = false;
    const { container } = render(<PlanFormat teamId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload a plan' }));
    expect(click).toHaveBeenCalledTimes(1);
    const input = click.mock.contexts[0] as HTMLInputElement;
    expect(input.dataset.testid).toBe('plan-format-desk-file');
    expect(input.accept).toContain('application/pdf');
    expect(container.querySelector('dialog')).toBeNull();
    expect(screen.queryByText('Take a photo')).toBeNull();
  });

  it('on a phone opens the sheet with its three ways in', () => {
    phone.value = true;
    const { container } = render(<PlanFormat teamId="t1" />);
    expect(container.querySelector('[data-testid="plan-format-desk-file"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Upload a plan' }));
    expect(click).not.toHaveBeenCalled();
    expect(container.querySelector('dialog.ch-fsheet-dlg')).not.toBeNull();
  });
});
