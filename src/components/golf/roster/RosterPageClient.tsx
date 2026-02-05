'use client';

import { useState, useEffect, useCallback } from 'react';
import { JoinRequestsModal } from './JoinRequestsModal';
import { getTeamJoinRequests } from '@/app/golf/actions/teams';
import { RosterToolbar, exportRosterCSV } from './RosterToolbar';

type SortField = 'name' | 'handicap' | 'rounds' | 'avg_score';
type SortDirection = 'asc' | 'desc';

interface PlayerData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  hometown: string | null;
  state: string | null;
  graduation_year: number | null;
  handicap: number | null;
  rounds_count?: number;
  avg_score?: number;
}

interface RosterPageClientProps {
  children: React.ReactNode;
  players?: PlayerData[];
}

/**
 * Client wrapper for roster page that provides sorting, export, and join request modal
 */
export function RosterPageClient({ children, players }: RosterPageClientProps) {
  const [showModal, setShowModal] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    // Check for pending requests on mount
    async function checkRequests() {
      const result = await getTeamJoinRequests();
      if (result.success && result.data && result.data.length > 0) {
        // Only show modal once per session for this page visit
        const sessionKey = 'roster_modal_shown';
        const alreadyShown = sessionStorage.getItem(sessionKey);

        if (!alreadyShown) {
          setShowModal(true);
          sessionStorage.setItem(sessionKey, 'true');
        }
      }
      setHasChecked(true);
    }

    checkRequests();
  }, []);

  const handleSortChange = useCallback((field: SortField, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
  }, []);

  const handleExport = useCallback(() => {
    if (players && players.length > 0) {
      exportRosterCSV(players);
    }
  }, [players]);

  return (
    <>
      {/* Toolbar is injected via CSS grid order or portal - for now render before children */}
      {players && players.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-2" data-roster-toolbar>
          <RosterToolbar
            playerCount={players.length}
            onSortChange={handleSortChange}
            onExport={handleExport}
          />
        </div>
      )}

      {children}

      {showModal && hasChecked && (
        <JoinRequestsModal onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
