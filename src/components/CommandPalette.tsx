'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconSearch, IconChevronRight } from '@/components/icons';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import {
  buildBaseballCommandPaletteItems,
  type BaseballCommandPaletteItem,
} from '@/lib/baseball/command-palette-nav';
import type { BaseballNavContext } from '@/lib/baseball/nav-registry';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  navContext: BaseballNavContext;
}

export function CommandPalette({ navContext }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  const registryCommands: CommandItem[] = useMemo(() => {
    return buildBaseballCommandPaletteItems(navContext).map((item: BaseballCommandPaletteItem) => ({
      id: item.id,
      label: item.label,
      description: item.description,
      icon: <item.icon size={18} />,
      action: () => router.push(item.href),
      keywords: item.keywords,
    }));
  }, [navContext, router]);

  const filteredCommands = registryCommands.filter((cmd) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(searchLower) ||
      cmd.description?.toLowerCase().includes(searchLower) ||
      cmd.keywords?.some((k) => k.toLowerCase().includes(searchLower))
    );
  });

  // Shared hand-rolled-dialog primitive (already proven in ConfirmDialog /
  // JoinRequestsModal / EventDetailModal): Tab focus trap + focus restore to
  // whatever triggered the palette + Escape-to-close, scoped to `modalRef`
  // below. Replaces the old window-level Escape branch (no trap/restore) —
  // (#a11y-sweep P1).
  const handleClose = useCallback(() => setOpen(false), []);
  const { modalRef } = useFocusTrap(open, handleClose);

  // Keyboard shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Imperative open (mirrors GolfHelm's CommandPalette): lets a shell's top-bar
  // search entry open this SAME palette instance without a synthetic ⌘K
  // keystroke. Additive — the ⌘K shortcut above is unchanged.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('helm:open-command-palette', onOpen);
    return () => window.removeEventListener('helm:open-command-palette', onOpen);
  }, []);

  // Reset search state on open. Initial focus is handled by useFocusTrap
  // above (it focuses the first focusable element inside modalRef, which is
  // this search input).
  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [open]);

  // Navigate with arrow keys
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filteredCommands[selectedIndex]) {
        e.preventDefault();
        filteredCommands[selectedIndex].action();
        setOpen(false);
      }
    },
    [filteredCommands, selectedIndex],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-warm-900/40 backdrop-blur-md animate-fade-in"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg animate-scale-in">
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className={cn(
            'bg-cream-100/68 backdrop-blur-[24px]',
            'rounded-2xl',
            'shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.5)]',
            'border border-warm-200/45',
            'overflow-hidden',
          )}
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/20 bg-cream-50/30">
            <IconSearch size={20} className="text-warm-400" aria-hidden="true" />
            <Input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search commands..."
              aria-label="Search commands"
              className="flex-1 min-h-0 w-auto px-0 py-0 rounded-none border-0 bg-transparent outline-none text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-warm-400 bg-cream-100/68 backdrop-blur-sm rounded-lg border border-warm-200/45">
              ESC
            </kbd>
          </div>

          {/* Commands List */}
          <div
            id="command-list"
            role="listbox"
            aria-label="Available commands"
            className="max-h-80 overflow-y-auto p-2"
            data-scroll-container
          >
            {filteredCommands.length === 0 ? (
              <div className="text-center py-8 text-sm text-warm-500" role="status">
                No commands found
              </div>
            ) : (
              filteredCommands.map((cmd, index) => (
                <Button
                  variant="primary"
                  key={cmd.id}
                  id={`cmd-${cmd.id}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => {
                    cmd.action();
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                    index === selectedIndex
                      ? 'bg-primary-50/80 backdrop-blur-sm text-primary-900'
                      : 'hover:bg-cream-100/40 text-warm-700',
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      index === selectedIndex ? 'bg-primary-100' : 'bg-cream-100/68 backdrop-blur-sm',
                    )}
                    aria-hidden="true"
                  >
                    {cmd.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cmd.label}</p>
                    {cmd.description && (
                      <p className="text-xs text-warm-500 truncate">{cmd.description}</p>
                    )}
                  </div>
                  <IconChevronRight size={16} className="text-warm-400" aria-hidden="true" />
                </Button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-white/20 bg-cream-50/30 backdrop-blur-sm flex items-center justify-between text-xs text-warm-500">
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-cream-100/68 backdrop-blur-sm rounded border border-warm-200/45">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-cream-100/68 backdrop-blur-sm rounded border border-warm-200/45">↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-cream-100/68 backdrop-blur-sm rounded border border-warm-200/45">↵</kbd>
              <span>Select</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
