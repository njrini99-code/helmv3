'use client';

import { useState } from 'react';

interface SearchResults {
  players: any[];
  colleges: any[];
}

// Placeholder search hook - to be fully implemented in later phases
export function useSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results] = useState<SearchResults>({ players: [], colleges: [] });
  const [loading] = useState(false);

  const search = (query: string) => {
    setSearchQuery(query);
  };

  const clear = () => {
    setSearchQuery('');
  };

  return { searchQuery, setSearchQuery, results, loading, search, clear };
}
