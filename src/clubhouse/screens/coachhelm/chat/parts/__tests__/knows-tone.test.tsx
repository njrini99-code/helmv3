import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  setChatTone: vi.fn(async (_id: string, _tone: string) => ({ success: true }) as { success: boolean; error?: string }),
  saveCoachFact: vi.fn(),
  deleteCoachFact: vi.fn(),
}));
vi.mock('@/app/golf/actions/coachhelm-ask', () => actions);

import { AskKnowsPanel } from '../KnowsPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const knows = { tone: 'straight' as const, facts: [], teamId: 't1' };
const radio = (name: string) => screen.queryByRole('radio', { name });

// Prod audit 2026-11-15, CHATSET-01: the tone pill moved with no chat open and nothing was saved. Interim fix, until a coach-wide
// default tone exists (a migration, Nick's call): the control is a chat's, and a save that fails says so.
describe('Ask’s tone setting', () => {
  it('shows no tone control when no chat is open', () => {
    render(<AskKnowsPanel knows={knows} conversationId={null} />);
    expect(radio('Detailed')).toBeNull();
  });

  it('saves the tone on the open chat', async () => {
    render(<AskKnowsPanel knows={knows} conversationId="c1" />);
    await userEvent.click(radio('Detailed')!);
    expect(actions.setChatTone).toHaveBeenCalledWith('c1', 'detailed');
    expect(radio('Detailed')!.getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('puts the pill back and says so when the save fails', async () => {
    actions.setChatTone.mockResolvedValueOnce({ success: false });
    render(<AskKnowsPanel knows={knows} conversationId="c1" />);
    await userEvent.click(radio('Team talk')!);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('The tone wasn’t saved. Try again.'));
    expect(radio('Straight')!.getAttribute('aria-checked')).toBe('true');
  });
});
