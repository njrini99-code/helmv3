'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  IconCalendar,
  IconPencil,
  IconUserPlus,
  IconSearch,
  IconPlus,
  IconX,
  IconArrowRight,
} from '@/components/icons';
import type { Coach } from '../crm-config';

// ============================================================================
// TYPES
// ============================================================================
interface FABProps {
  onSchedule: (coach: Coach) => void;
  onLogContact: (coach: Coach) => void;
  onAddCoach: () => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function FAB({ onSchedule, onLogContact, onAddCoach }: FABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Coach[]>([]);
  const [searching, setSearching] = useState(false);
  const [, setSelectedCoach] = useState<Coach | null>(null);
  const [actionMode, setActionMode] = useState<'schedule' | 'log' | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowSearch(false);
        setSelectedCoach(null);
        setActionMode(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  // Search coaches
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await supabase
          .from('crm_coaches')
          .select('*')
          .or(`name.ilike.%${searchQuery}%,school.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
          .limit(8);

        setSearchResults((data || []) as Coach[]);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, supabase]);

  // Handle action selection
  const handleAction = (action: 'schedule' | 'log') => {
    setActionMode(action);
    setShowSearch(true);
    setIsOpen(false);
  };

  // Handle coach selection
  const handleCoachSelect = (coach: Coach) => {
    if (actionMode === 'schedule') {
      onSchedule(coach);
    } else if (actionMode === 'log') {
      onLogContact(coach);
    }
    // Reset state
    setShowSearch(false);
    setSelectedCoach(null);
    setActionMode(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-50 pb-[env(safe-area-inset-bottom)]">
      {/* Search Modal */}
      {showSearch && (
        <div className="absolute bottom-20 right-0 w-96 bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
          <div className="p-4 border-b border-warm-100/50">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center',
                actionMode === 'schedule' ? 'bg-violet-100' : 'bg-primary-100'
              )}>
                {actionMode === 'schedule'
                  ? <IconCalendar size={20} className="text-violet-600" />
                  : <IconPencil size={20} className="text-primary-600" />
                }
              </div>
              <div>
                <h3 className="font-bold text-warm-800">
                  {actionMode === 'schedule' ? 'Schedule Event' : 'Log Contact'}
                </h3>
                <p className="text-xs text-warm-500">Search for a coach or school</p>
              </div>
            </div>
          </div>

          <div className="p-3">
            <div className="relative">
              <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search coaches or schools..."
                className="w-full pl-10 pr-4 py-2.5 bg-white/60 border border-warm-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-300"
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto">
            {searchResults.length > 0 ? (
              <div className="p-2">
                {searchResults.map((coach) => (
                  <button
                    key={coach.id}
                    onClick={() => handleCoachSelect(coach)}
                    className="w-full p-3 rounded-xl hover:bg-primary-50 active:bg-primary-100 transition-colors text-left flex items-center gap-3 group"
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm',
                      coach.division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
                    )}>
                      {coach.division}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-warm-800 truncate">{coach.school}</div>
                      <div className="text-sm text-warm-500 truncate">{coach.name}</div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <IconArrowRight size={14} className="text-primary-500" />
                    </div>
                  </button>
                ))}
              </div>
            ) : searchQuery && !searching ? (
              <div className="p-8 text-center text-warm-500">
                <div className="w-12 h-12 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-2">
                  <IconSearch size={20} className="text-warm-400" />
                </div>
                <p className="text-sm">No coaches found</p>
              </div>
            ) : !searchQuery ? (
              <div className="p-6 text-center text-warm-400">
                <div className="w-12 h-12 rounded-2xl bg-warm-50 flex items-center justify-center mx-auto mb-2">
                  <IconSearch size={20} className="text-warm-300" />
                </div>
                <p className="text-sm">Start typing to search</p>
              </div>
            ) : null}
          </div>

          {/* Cancel */}
          <div className="p-3 border-t border-warm-100/50">
            <button
              onClick={() => {
                setShowSearch(false);
                setActionMode(null);
                setSearchQuery('');
              }}
              className="w-full py-2 text-sm text-warm-500 hover:text-warm-700 font-medium rounded-xl hover:bg-warm-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action Menu */}
      {isOpen && !showSearch && (
        <div className="absolute bottom-20 right-0 flex flex-col items-end gap-3 animate-in slide-in-from-bottom-4 duration-200">
          <button
            onClick={() => handleAction('schedule')}
            className="flex items-center gap-3 px-5 py-3 bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 hover:shadow-xl transition-all group"
          >
            <span className="text-sm font-semibold text-warm-700 group-hover:text-primary-600">Schedule Event</span>
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white shadow-lg">
              <IconCalendar size={20} />
            </span>
          </button>

          <button
            onClick={() => handleAction('log')}
            className="flex items-center gap-3 px-5 py-3 bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 hover:shadow-xl transition-all group"
          >
            <span className="text-sm font-semibold text-warm-700 group-hover:text-primary-600">Log Contact</span>
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-lg">
              <IconPencil size={20} />
            </span>
          </button>

          <button
            onClick={() => { onAddCoach(); setIsOpen(false); }}
            className="flex items-center gap-3 px-5 py-3 bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 hover:shadow-xl transition-all group"
          >
            <span className="text-sm font-semibold text-warm-700 group-hover:text-primary-600">Add Coach</span>
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white shadow-lg">
              <IconUserPlus size={20} />
            </span>
          </button>
        </div>
      )}

      {/* Main FAB Button */}
      <button
        onClick={() => {
          if (showSearch) {
            setShowSearch(false);
            setActionMode(null);
          } else {
            setIsOpen(!isOpen);
          }
        }}
        aria-label={isOpen || showSearch ? 'Close actions menu' : 'Open actions menu'}
        className={cn(
          'w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300',
          'shadow-xl hover:shadow-2xl hover:shadow-primary-500/20',
          isOpen || showSearch
            ? 'bg-warm-800 text-white rotate-45'
            : 'bg-gradient-to-br from-primary-500 to-primary-600 text-white hover:scale-105'
        )}
      >
        {isOpen || showSearch ? <IconX size={28} /> : <IconPlus size={28} />}
      </button>
    </div>
  );
}
