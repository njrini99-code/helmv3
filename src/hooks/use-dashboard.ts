'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';

// Saved Searches Types
interface SavedSearch {
  id: string;
  name: string;
  filters: Record<string, string>;
  created_at: string;
}

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const { coach } = useAuthStore();

  useEffect(() => {
    async function fetchSearches() {
      if (!coach?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Use localStorage for saved searches since the table may not exist
        const stored = localStorage.getItem(`saved_searches_${coach.id}`);
        if (stored) {
          setSearches(JSON.parse(stored));
        }
      } catch (error) {
        // Silently reset — malformed localStorage is non-critical
        setSearches([]);
      }

      setLoading(false);
    }

    fetchSearches();
  }, [coach?.id]);

  const saveSearch = (name: string, filters: Record<string, string>): SavedSearch | null => {
    if (!coach?.id) return null;

    const newSearch: SavedSearch = {
      id: crypto.randomUUID(),
      name,
      filters,
      created_at: new Date().toISOString(),
    };

    const updated = [newSearch, ...searches].slice(0, 5);
    setSearches(updated);

    try {
      localStorage.setItem(`saved_searches_${coach.id}`, JSON.stringify(updated));
    } catch (error) {
      console.error('Error saving search:', error);
    }

    return newSearch;
  };

  const deleteSearch = (id: string): boolean => {
    if (!coach?.id) return false;

    const updated = searches.filter(s => s.id !== id);
    setSearches(updated);

    try {
      localStorage.setItem(`saved_searches_${coach.id}`, JSON.stringify(updated));
      return true;
    } catch (error) {
      console.error('Error deleting search:', error);
      return false;
    }
  };

  return { searches, loading, saveSearch, deleteSearch };
}

// Player Distribution by State Hook
// Respects discoverability rules based on coach type
export function usePlayersByState(coachId?: string, coachType?: string) {
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStateCounts() {
      setLoading(true);

      try {
        // Use server action to avoid RLS recursion issues
        const { getStateCounts } = await import('@/app/baseball/actions/discover');
        // coachType is already typed as string, getStateCounts accepts it
        const counts = await getStateCounts('players', coachId, coachType as 'college' | 'juco' | 'high_school' | 'showcase' | undefined);

        // Normalize state codes to uppercase
        const normalizedCounts: Record<string, number> = {};
        Object.entries(counts).forEach(([state, count]) => {
          const stateCode = state.toUpperCase().trim();
          normalizedCounts[stateCode] = count;
        });

        setStateCounts(normalizedCounts);
      } catch (error) {
        console.error('Error fetching player distribution:', error);
        setStateCounts({});
      } finally {
        setLoading(false);
      }
    }

    fetchStateCounts();
  }, [coachId, coachType]);

  return { stateCounts, loading };
}
