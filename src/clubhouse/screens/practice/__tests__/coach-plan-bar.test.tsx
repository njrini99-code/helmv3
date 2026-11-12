import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoachPlanBar, type ChPlanStatus } from '../CoachPlanBar';

const take = vi.fn();
const post = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/golf/actions/practice-publish', () => ({ takeDownPracticePlan: (...a: unknown[]) => take(...a) }));
vi.mock('@/app/golf/actions/coachhelm-practice-plans', () => ({ postPracticePlanToChat: (...a: unknown[]) => post(...a) }));
vi.mock('../../../ui/Toast', () => ({ useToast: () => vi.fn() }));

const base: ChPlanStatus = { planId: 'p1', title: 'Plan', version: 2, status: 'published', edited: false, seen: { names: ['Sofia', 'Maya'], of: 9 } };

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  take.mockReset().mockResolvedValue({ success: true });
  post.mockReset().mockResolvedValue({ success: true });
});

describe('CoachPlanBar', () => {
  it('counts who has seen it, and names them', () => {
    render(<CoachPlanBar status={base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Seen by 2 of 9' }));
    expect(screen.getByText('Sofia')).toBeTruthy();
  });
  it('says when edits haven’t been published', () => {
    render(<CoachPlanBar status={{ ...base, edited: true }} />);
    expect(screen.getByText('Edits not published')).toBeTruthy();
  });
  it('has no Seen by on a draft', () => {
    render(<CoachPlanBar status={{ ...base, status: 'draft', seen: null }} />);
    expect(screen.queryByRole('button', { name: /Seen by/ })).toBeNull();
  });
  it('a draft has nobody to share with: Edit and Print, no Share', () => {
    render(<CoachPlanBar status={{ ...base, status: 'draft', seen: null }} />);
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Print' }).getAttribute('href')).toBe('/golf/dashboard/practice/print/p1');
  });
  it('draws what the page hands it under the status', () => {
    const { container } = render(<CoachPlanBar status={base} after={<div data-testid="run" />} />);
    const bar = container.querySelector('.ch-prc-planbar')!;
    expect(bar.compareDocumentPosition(screen.getByTestId('run')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bar.contains(screen.getByRole('button', { name: 'Seen by 2 of 9' }))).toBe(true);
  });
  it('edits through the builder', () => {
    render(<CoachPlanBar status={base} />);
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('/golf/dashboard/practice/plan/p1/edit');
  });
  it('takes the plan down at its version, telling players by default', async () => {
    const { container } = render(<CoachPlanBar status={base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Take down' }));
    const dialog = [...container.ownerDocument.querySelectorAll('dialog')].find((d) => d.textContent?.includes('Take this plan down?'))!;
    fireEvent.click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Take down')!);
    await waitFor(() => expect(take).toHaveBeenCalledWith({ planId: 'p1', expectedVersion: 2, notify: true, title: 'Plan' }));
  });
});
