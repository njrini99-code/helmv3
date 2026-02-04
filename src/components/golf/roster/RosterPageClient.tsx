'use client';

import { useState, useEffect } from 'react';
import { JoinRequestsModal } from './JoinRequestsModal';
import { getTeamJoinRequests } from '@/app/golf/actions/teams';

interface RosterPageClientProps {
  children: React.ReactNode;
}

/**
 * Client wrapper for roster page that shows modal for pending join requests
 */
export function RosterPageClient({ children }: RosterPageClientProps) {
  const [showModal, setShowModal] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

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

  return (
    <>
      {children}

      {showModal && hasChecked && (
        <JoinRequestsModal onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
