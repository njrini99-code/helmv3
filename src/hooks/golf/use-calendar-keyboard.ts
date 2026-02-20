'use client';

import { useEffect } from 'react';

interface UseCalendarKeyboardOptions {
  enabled: boolean;
  isModalOpen: boolean;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onToday: () => void;
  onNewEvent?: () => void;
  onViewDay: () => void;
  onViewWeek: () => void;
  onViewMonth: () => void;
}

/**
 * Calendar-specific keyboard shortcuts for desktop navigation.
 *
 * J/K — navigate prev/next (day, week, or month depending on current view)
 * T   — jump to today
 * N   — new event (coach only)
 * 1   — switch to day view
 * 2   — switch to week view
 * 3   — switch to month view
 *
 * Guards against firing in form fields, when modals are open,
 * or when modifier keys are held (to coexist with Cmd+K command palette).
 */
export function useCalendarKeyboard(options: UseCalendarKeyboardOptions): void {
  useEffect(() => {
    if (!options.enabled) return;

    function handler(e: KeyboardEvent) {
      // Don't intercept when modifier keys are held (Cmd+K, Ctrl+C, etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Don't intercept when typing in a form field
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      // Don't intercept when a modal/sheet is open
      if (options.isModalOpen) return;

      switch (e.key.toLowerCase()) {
        case 'j':
          e.preventDefault();
          options.onNavigatePrev();
          break;
        case 'k':
          e.preventDefault();
          options.onNavigateNext();
          break;
        case 't':
          e.preventDefault();
          options.onToday();
          break;
        case 'n':
          if (options.onNewEvent) {
            e.preventDefault();
            options.onNewEvent();
          }
          break;
        case '1':
          e.preventDefault();
          options.onViewDay();
          break;
        case '2':
          e.preventDefault();
          options.onViewWeek();
          break;
        case '3':
          e.preventDefault();
          options.onViewMonth();
          break;
      }
    }

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [options]);
}
