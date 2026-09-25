import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TemplateSkeleton } from './TemplateSkeleton';

describe('TemplateSkeleton', () => {
  it('is one status region with the field-sheet blocks and five rows by default', () => {
    const { container } = render(<TemplateSkeleton />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByText('Loading')).toBeTruthy();
    const kinds = [...container.querySelectorAll('[data-block]')].map((el) => el.getAttribute('data-block'));
    expect(kinds).toEqual(['masthead', 'verdict', 'stage', 'rows']);
    expect(container.querySelector('[data-block="rows"]')?.children).toHaveLength(5);
  });

  it('reserves the stage at the height it is given', () => {
    const { container } = render(<TemplateSkeleton blocks={['stage']} stageHeight={220} />);
    expect((container.querySelector('[data-block="stage"]') as HTMLElement).style.height).toBe('220px');
  });

  it('spaces blocks on the page rhythm: 8 masthead to verdict, 24 to the stage, 32 to the rows', () => {
    const { container } = render(<TemplateSkeleton />);
    const wrappers = [...container.querySelectorAll('[data-block]')].map((el) => el.parentElement!.className);
    expect(wrappers).toEqual(['', 'mt-2', 'mt-6', 'mt-8']);
  });

  it('builds a ledger template with a custom row count and label', () => {
    const { container } = render(<TemplateSkeleton blocks={['masthead', 'rows']} rows={3} label="Loading players" />);
    expect(screen.getByText('Loading players')).toBeTruthy();
    expect(container.querySelector('[data-block="stage"]')).toBeNull();
    expect(container.querySelector('[data-block="rows"]')?.children).toHaveLength(3);
  });
});
