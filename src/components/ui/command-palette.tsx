'use client';

import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

export interface Command {
  id: string;
  label: string;
  group: 'navigation' | 'actions';
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  shortcut?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands?: Command[];
}

export function CommandPalette({ open, onClose, commands = [] }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setQuery('');
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!open) return null;

  const filteredCommands = commands.filter(cmd =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-warm-900/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="
        relative z-10
        w-full max-w-lg
        bg-white
        border border-warm-200
        rounded-[20px]
        shadow-2xl
        overflow-hidden
        animate-in fade-in slide-in-from-top-4
        duration-200
      ">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-warm-100">
          <Search className="w-5 h-5 text-warm-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands..."
            className="
              flex-1
              bg-transparent
              text-warm-900 text-sm
              placeholder:text-warm-400
              focus:outline-none
            "
          />
          <kbd className="
            px-2 py-1
            bg-warm-100 text-warm-500
            text-xs font-medium
            rounded-md
          ">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-warm-400">
              No commands found
            </div>
          ) : (
            <>
              <CommandGroup label="Navigation">
                {filteredCommands
                  .filter(cmd => cmd.group === 'navigation')
                  .map(cmd => (
                    <CommandItem key={cmd.id} command={cmd} onSelect={onClose} />
                  ))}
              </CommandGroup>
              <CommandGroup label="Actions">
                {filteredCommands
                  .filter(cmd => cmd.group === 'actions')
                  .map(cmd => (
                    <CommandItem key={cmd.id} command={cmd} onSelect={onClose} />
                  ))}
              </CommandGroup>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CommandGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="px-5 pb-2 text-xs font-medium text-warm-400 uppercase tracking-wide">
        {label}
      </div>
      {children}
    </div>
  );
}

function CommandItem({ command, onSelect }: { command: Command; onSelect: () => void }) {
  const handleClick = () => {
    command.action();
    onSelect();
  };

  return (
    <button
      onClick={handleClick}
      className="
        w-full flex items-center gap-3
        px-5 py-2.5
        text-left
        hover:bg-warm-50
        transition-colors duration-150
      "
    >
      <command.icon className="w-4 h-4 text-warm-500" />
      <span className="flex-1 text-sm text-warm-700">{command.label}</span>
      {command.shortcut && (
        <kbd className="
          px-2 py-0.5
          bg-warm-100 text-warm-500
          text-xs font-medium
          rounded
        ">
          {command.shortcut}
        </kbd>
      )}
    </button>
  );
}
