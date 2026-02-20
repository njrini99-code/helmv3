'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { useGolfUser } from '@/contexts/golf-user-context';
import { NewAnnouncementsModal } from './NewAnnouncementsModal';

const LS_KEY = 'golfhelm-last-announcements-seen';
const DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Conditionally renders the NewAnnouncementsModal for players.
 * - Checks localStorage to avoid re-showing within 5 minutes
 * - Checks notification context for unseen announcements
 * - On dismiss: updates server + localStorage
 */
export function NewAnnouncementsModalWrapper() {
  const { role, playerId } = useGolfUser();
  const badges = useNotificationBadges();
  const [showModal, setShowModal] = useState(false);
  const [checked, setChecked] = useState(false);

  // Only run for players
  const isPlayer = role === 'player' && !!playerId;

  useEffect(() => {
    if (!isPlayer || checked) return;

    // Check localStorage to prevent re-showing within session
    const lastSeen = localStorage.getItem(LS_KEY);
    if (lastSeen) {
      const elapsed = Date.now() - new Date(lastSeen).getTime();
      if (elapsed < DEBOUNCE_MS) {
        setChecked(true);
        return;
      }
    }

    // Wait for badge data to load before deciding
    if (badges.hasUnseenAnnouncements) {
      setShowModal(true);
      setChecked(true);
    }
  }, [isPlayer, checked, badges.hasUnseenAnnouncements]);

  const handleDismiss = useCallback(async () => {
    setShowModal(false);
    localStorage.setItem(LS_KEY, new Date().toISOString());
    await badges.markAnnouncementsSeen();
    await badges.refetch();
  }, [badges]);

  if (!isPlayer || !showModal || badges.unseenAnnouncements.length === 0) return null;

  return (
    <NewAnnouncementsModal
      announcements={badges.unseenAnnouncements}
      onDismiss={handleDismiss}
    />
  );
}
