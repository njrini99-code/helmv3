// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BriefCard, type BriefQuestion } from '../BriefCard';

const questions: BriefQuestion[] = [{ id: 'focus', title: 'What to work on?', options: [{ id: 'putting', label: 'Putting' }], pick: ['putting'] }];

afterEach(cleanup);

describe('BriefCard · a send that is refused', () => {
  it('stays open with the answers when onDone returns false', () => {
    const onDone = vi.fn(() => false);
    render(<BriefCard title="Plan" questions={questions} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip, just build' }));
    expect(onDone).toHaveBeenCalledWith({ focus: ['putting'] }, 'Putting');
    expect(screen.getByRole('button', { name: 'Skip, just build' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change answers' })).toBeNull();
  });

  it.each([
    ['true', true],
    ['nothing', undefined],
  ])('folds to its answers when onDone returns %s', (_label, value) => {
    render(<BriefCard title="Plan" questions={questions} onDone={() => value} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip, just build' }));
    expect(screen.getByRole('button', { name: 'Change answers' })).toBeTruthy();
    expect(screen.getByText('Putting')).toBeTruthy();
  });
});
