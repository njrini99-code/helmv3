/**
 * Audit A11Y-R3: a template row was a div[role=button] wrapping its own Edit and
 * Delete buttons, so Enter on Edit also fired onSelectTemplate and assistive
 * tech met nested interactive controls. The select action and the icon buttons
 * are now siblings.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const template = {
  id: 't1',
  team_id: 'team',
  title: 'Range session',
  description: 'Wedges 50-100y',
  default_assignee_type: 'all_players',
  category: 'Practice',
  default_priority: 'normal',
  default_due_days: 3,
  created_at: null,
};

vi.mock('@/app/golf/actions/tasks', () => ({
  getTaskTemplates: vi.fn(async () => ({ success: true, data: [template] })),
  seedDefaultTemplates: vi.fn(async () => ({ success: true })),
  createTaskTemplate: vi.fn(),
  updateTaskTemplate: vi.fn(),
  deleteTaskTemplate: vi.fn(),
}));

import { FairwayTaskTemplateList } from '../FairwayTaskTemplateList';

describe('FairwayTaskTemplateList row controls', () => {
  it('keeps Edit and Delete outside the select control', async () => {
    const onSelectTemplate = vi.fn();
    render(<FairwayTaskTemplateList teamId="team" onSelectTemplate={onSelectTemplate} />);

    const use = await screen.findByRole('button', { name: 'Use template Range session' });
    const edit = screen.getByRole('button', { name: 'Edit template Range session' });
    const del = screen.getByRole('button', { name: 'Delete template Range session' });
    expect(use.contains(edit)).toBe(false);
    expect(use.contains(del)).toBe(false);
  });

  it('Enter on Edit opens the editor without selecting the template', async () => {
    const user = userEvent.setup();
    const onSelectTemplate = vi.fn();
    render(<FairwayTaskTemplateList teamId="team" onSelectTemplate={onSelectTemplate} />);

    const edit = await screen.findByRole('button', { name: 'Edit template Range session' });
    edit.focus();
    await user.keyboard('{Enter}');
    expect(onSelectTemplate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: /Update/ })).toBeInTheDocument());
  });

  it('the select control still selects the template', async () => {
    const user = userEvent.setup();
    const onSelectTemplate = vi.fn();
    render(<FairwayTaskTemplateList teamId="team" onSelectTemplate={onSelectTemplate} />);

    await user.click(await screen.findByRole('button', { name: 'Use template Range session' }));
    expect(onSelectTemplate).toHaveBeenCalledWith(template);
  });
});
