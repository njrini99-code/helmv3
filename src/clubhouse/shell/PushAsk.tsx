'use client';

import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { requestPushPermission, setPushSoftAskState, shouldShowPushSoftAsk } from '@/lib/utils/push-registration';
import { haptic } from '../lib/haptics';
import { chTrail } from '../lib/track';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { markPushAskShown, PUSH_ASK_SETTLE_MS, pushAskCalm, pushAskRouteOk, pushAskShown } from './push-ask';

/** What push brings, for the role, under the sheet's title. */
const WHY: Record<'coach' | 'player', string> = {
  player: 'Know when your coach messages you, the schedule changes or a round review is ready, even with GolfHelm closed.',
  coach: 'Know when a player posts a round, messages you or answers an event, even with GolfHelm closed.',
};

/** The ask itself (CH-1910): the shell's sheet, with Not now and Turn on. The preview draws it open. */
export function PushAskSheet({ open, role, asking, onTurnOn, onNotNow }: { open: boolean; role: 'coach' | 'player'; asking: boolean; onTurnOn: () => void; onNotNow: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onNotNow}
      width={420}
      icon={Bell}
      code="CH-1910"
      title="Turn on notifications"
      description={`${WHY[role]} You can change this in Settings, under Notifications.`}
      footer={
        <>
          <Button variant="ghost" disabled={asking} onClick={onNotNow}>
            Not now
          </Button>
          <Button variant="primary" disabled={asking} onClick={onTurnOn}>
            Turn on
          </Button>
        </>
      }
    />
  );
}

/**
 * The push soft ask in the iOS app (release blocker 12; docs/clubhouse/phone/push-opt-in.md). Clubhouse never rendered
 * Fairway's, so a new user in the app was never asked. Shown once, while iOS has not been asked and the person has not
 * answered this ask in either UI (`shouldShowPushSoftAsk`, whose stored answer Fairway's ask shares), at a calm moment:
 * a page held for PUSH_ASK_SETTLE_MS, nothing else open or focused, and not on round entry or Settings (push-ask.ts).
 * Turn on is iOS's own prompt through the shared `requestPushPermission`, which registers with Apple on a yes. Not now,
 * the close button, Esc or a drag keep the answer: it never asks again. On the web it never shows.
 */
export function PushAsk({ pathname, role }: { pathname: string; role: 'coach' | 'player' }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const askingRef = useRef(false);

  useEffect(() => {
    if (pushAskShown() || !pushAskRouteOk(pathname)) return;
    let live = true;
    const timer = window.setTimeout(() => {
      if (!live || !pushAskCalm(document)) return;
      void shouldShowPushSoftAsk().then((ask) => {
        // The read crossed a frame or more: look again before interrupting.
        if (!live || !ask || pushAskShown() || !pushAskCalm(document)) return;
        markPushAskShown();
        chTrail('push ask shown');
        setOpen(true);
      });
    }, PUSH_ASK_SETTLE_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [pathname]);

  const turnOn = async () => {
    if (askingRef.current) return;
    askingRef.current = true;
    setAsking(true);
    chTrail('push ask turn on');
    try {
      const answer = await requestPushPermission();
      setOpen(false);
      if (answer === 'granted') {
        haptic('success');
        toast({ title: 'Notifications are on' });
      }
    } finally {
      askingRef.current = false;
      setAsking(false);
    }
  };

  const notNow = () => {
    // While iOS's prompt is up the sheet waits for its answer.
    if (askingRef.current) return;
    setPushSoftAskState('dismissed');
    chTrail('push ask not now');
    setOpen(false);
  };

  return <PushAskSheet open={open} role={role} asking={asking} onTurnOn={() => void turnOn()} onNotNow={notNow} />;
}
