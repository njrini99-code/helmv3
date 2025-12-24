'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { IconX, IconSearch } from '@/components/icons';

const STORAGE_KEY = 'helm-shortcut-hint-dismissed';

export function KeyboardShortcutHint() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Check if user has dismissed this hint
    const wasDismissed = localStorage.getItem(STORAGE_KEY) === 'true';
    setDismissed(wasDismissed);
    
    if (!wasDismissed) {
      // Show after a short delay
      const timer = setTimeout(() => setVisible(true), 2000);
      // Auto-hide after 8 seconds
      const hideTimer = setTimeout(() => setVisible(false), 10000);
      return () => {
        clearTimeout(timer);
        clearTimeout(hideTimer);
      };
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  if (dismissed || !visible) return null;

  return (
    <div className={cn(
      'fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-40',
      'bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl',
      'flex items-center gap-3 animate-slide-up'
    )}>
      <IconSearch size={16} className="text-slate-400" />
      <span className="text-sm">
        Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-xs mx-1">⌘K</kbd> for quick actions
      </span>
      <button
        onClick={handleDismiss}
        className="p-1 hover:bg-slate-800 rounded transition-colors"
      >
        <IconX size={14} />
      </button>
    </div>
  );
}
