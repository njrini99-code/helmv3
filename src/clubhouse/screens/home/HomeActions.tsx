'use client';

import { MessageSquare, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '../../ui/Button';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';

const NEW_EVENT = '/golf/dashboard/calendar?new=1';

/** Home's two actions: the team chat, and a new calendar event (N from anywhere on Home). */
export function HomeActions({ teamChatId }: { teamChatId: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      haptic('press');
      chTrail('home new event (keyboard)');
      router.push(NEW_EVENT);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);
  return (
    <div className="ch-h-head__actions">
      <Button href={teamChatId ? `/golf/dashboard/messages?conversation=${teamChatId}` : '/golf/dashboard/messages'} leftIcon={MessageSquare}>
        Message team
      </Button>
      <Button href={NEW_EVENT} variant="primary" leftIcon={Plus} kbd="N">
        New event
      </Button>
    </div>
  );
}
