/**
 * ChatMarkdown tests — audit W2.
 *
 * The Ask CoachHelm reply bubble used to render the model's markdown-ish
 * answer as a raw string (literal `**bold**` asterisks, literal `- ` bullet
 * dashes). Pins that bold spans and lists now render as real elements, and
 * that unrecognized syntax degrades to plain, unmangled text.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMarkdown } from './ChatMarkdown';

describe('ChatMarkdown', () => {
  it('renders **bold** spans as <strong>, not literal asterisks', () => {
    render(<ChatMarkdown text="Mason Reed's **short game** has fallen off." />);
    const strong = screen.getByText('short game');
    expect(strong.tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('renders a "- " bullet list as a real <ul>/<li>, not raw dashes', () => {
    const { container } = render(
      <ChatMarkdown text={'Two things stand out:\n- Short game is down 0.4 SG\n- Driving is up 0.2 SG'} />,
    );
    const list = container.querySelector('ul');
    expect(list).not.toBeNull();
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toBe('Short game is down 0.4 SG');
    expect(items[1]?.textContent).toBe('Driving is up 0.2 SG');
    expect(screen.queryByText(/^- /)).not.toBeInTheDocument();
  });

  it('renders a numbered list as a real <ol>/<li>', () => {
    const { container } = render(
      <ChatMarkdown text={'1. Fix approach play\n2. Add short-game reps'} />,
    );
    const list = container.querySelector('ol');
    expect(list).not.toBeNull();
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('preserves multiple paragraphs as separate blocks', () => {
    const { container } = render(
      <ChatMarkdown text={'First paragraph.\n\nSecond paragraph.'} />,
    );
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toBe('First paragraph.');
    expect(paragraphs[1]?.textContent).toBe('Second paragraph.');
  });

  it('renders plain text with no markdown unchanged', () => {
    render(<ChatMarkdown text="Nothing special here." />);
    expect(screen.getByText('Nothing special here.')).toBeInTheDocument();
  });

  it('never injects raw HTML — a literal tag-looking string stays inert text', () => {
    const { container } = render(<ChatMarkdown text="<strong>not real</strong>" />);
    // Should render as a literal text node, not an actual <strong> element.
    expect(container.querySelector('strong')).toBeNull();
    expect(screen.getByText('<strong>not real</strong>')).toBeInTheDocument();
  });

  it('handles empty content without throwing', () => {
    const { container } = render(<ChatMarkdown text="" />);
    expect(container.querySelector('div')).not.toBeNull();
  });
});
