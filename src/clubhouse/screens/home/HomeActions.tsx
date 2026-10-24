'use client';

import { MessageSquare, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '../../ui/Button';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { usePageKeys, type ChPageKey } from '../../shell/command/page-keys';
import { isInOverlay, isTypingTarget, modalOpen } from '../../shell/command/shortcuts';

const NEW_EVENT = '/golf/dashboard/calendar?new=1';
const HOME_KEYS: readonly ChPageKey[] = [{ label: 'New event', keys: ['N'] }];

/** Home's two actions: the team chat, and a new calendar event (N from anywhere on Home). */
export function HomeActions({ teamChatId }: { teamChatId: string | null }) {
  const router = useRouter();
  usePageKeys('Home', HOME_KEYS);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // B11: the shell's own tests for a field, a dialog or menu (a native <dialog> has no role attribute), or any modal open.
      if (e.key !== 'n' || e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target) || isInOverlay(e.target) || modalOpen(document)) return;
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
