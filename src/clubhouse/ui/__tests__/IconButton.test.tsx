import { cleanup, render, screen } from '@testing-library/react';
import { Plus } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconButton } from '../Button';

vi.mock('next/link', () => ({
  default: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => cleanup());

/** Auditor on #2361: as a link, IconButton dropped its shortcut's aria-keyshortcuts and silently ignored disabled and
 *  menu. The link reads its key the same way, and the types refuse what a link can't do. */
describe('IconButton', () => {
  it('a single-key shortcut is announced as a button and as a link', () => {
    render(<IconButton icon={Plus} label="New round" shortcut={['N']} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'New round' }).getAttribute('aria-keyshortcuts')).toBe('N');
    cleanup();
    render(<IconButton icon={Plus} label="Next player" shortcut={['J']} href="/stats?player=2" />);
    const link = screen.getByRole('link', { name: 'Next player' });
    expect(link.getAttribute('href')).toBe('/stats?player=2');
    expect(link.getAttribute('aria-keyshortcuts')).toBe('J');
  });

  it('a link takes no disabled, menu or click (a type error, not a silent no-op)', () => {
    const menu = { ref: () => {}, onClick: () => {}, 'aria-expanded': false, 'aria-haspopup': 'menu' as const, 'aria-controls': 'm' };
    // @ts-expect-error a link can't be disabled
    void (<IconButton icon={Plus} label="x" href="/a" disabled />);
    // @ts-expect-error a link can't open a menu
    void (<IconButton icon={Plus} label="x" href="/a" menu={menu} />);
    // @ts-expect-error a link runs no click handler
    void (<IconButton icon={Plus} label="x" href="/a" onClick={() => {}} />);
    render(<IconButton icon={Plus} label="More" menu={menu} disabled />);
    const b = screen.getByRole('button', { name: 'More' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('aria-haspopup')).toBe('menu');
  });
});
