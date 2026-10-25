'use client';

import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { heldLine } from '../screens/classes/panel-model';
import { deliverHeldNow } from '../screens/classes/class-status-writes';
import { haptic } from '../lib/haptics';
import { useAction } from '../lib/use-action';
import { useChClock } from '../lib/use-clock';
import { refetchMyClassDay, useMyClassDay } from '../lib/use-class-day';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { useClassAwareness, useClubhouseRole } from './context';
import '../styles/class-awareness.css';

/**
 * P-10 class awareness: the Bell's first row for a player while pushes are held for their class ("3 updates held until
 * 11:50 AM" and Deliver now). The held items themselves are already in the Bell's list (the in-app rows are never held), so
 * the row lists nothing twice. Draws nothing for a coach, with class status off, or when nothing is held. After Deliver now it
 * reads "Delivered" for 2 seconds and goes.
 */
export function BellHeldRow() {
  const awareness = useClassAwareness();
  const role = useClubhouseRole();
  const enabled = awareness && role === 'player';
  const { day } = useMyClassDay({ enabled });
  const clock = useChClock();
  const [delivered, setDelivered] = useState(false);
  const deliver = useAction('bell.deliverHeld', () => deliverHeldNow(), { done: '', failed: 'Couldn’t deliver them', hint: 'They will arrive when class ends. Try again.', code: 'CH-1270' });
  useEffect(() => {
    if (!delivered) return;
    const t = window.setTimeout(() => setDelivered(false), 2000);
    return () => window.clearTimeout(t);
  }, [delivered]);

  if (!enabled || !day) return null;
  const line = heldLine(day, clock);
  if (!line && !delivered) return null;
  return (
    <div className="ch-ca-bell" data-ch-code="CH-1271" role="status">
      <Icon icon={Clock} size={16} />
      <span className="ch-ca-bell__text ch-num">{delivered ? 'Delivered' : line}</span>
      {!delivered && (
        <Button
          size="sm"
          variant="ghost"
          className="ch-ca-bell__deliver"
          busy={deliver.pending}
          onClick={() => {
            void deliver.run().then(async (r) => {
              if (!r.success) return;
              haptic('success');
              setDelivered(true);
              await refetchMyClassDay();
            });
          }}
        >
          Deliver now
        </Button>
      )}
    </div>
  );
}
