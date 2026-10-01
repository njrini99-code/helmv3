'use client';

import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { haptic } from '../../../lib/haptics';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { useErrorHaptic } from './parts';
import '../../../styles/rounds-track.css';

/*
 * Both banners are the shot screen's note with an action, the one the hole
 * review draws when a hole doesn't save (`.ch-rt-note`, CH-11003): an icon, a
 * bold first sentence, what to do, and a small button.
 */

/**
 * CH-11902: the round changed on another device, and this one has stopped
 * saving. The legacy screens set `roundConflictBlocked` when a background poll
 * or a save proves the server moved past this device's copy (the round-write
 * calls are a full replace guarded by `expectedUpdatedAt`), and from then on
 * every write refuses, so a stale device can't overwrite newer holes. The only
 * way forward is a reload, and the legacy banner (the tracking-step error
 * banner in new-round-client, the error display in continue-round-client)
 * says so and shows Reload, with no Dismiss: there is nothing to dismiss.
 *
 * It sits above the shot screen, in amber (a step to take, not a failure).
 * `reloading` is the beat after Reload is tapped while the page goes away;
 * the button waits. The legacy screens draw no "restoring" or "back online"
 * state here (the offline warning banner is a no-op, and the recovery dialog
 * has its own restoring state), so this has none either. It fires the error
 * haptic when it appears: a write was refused.
 */
export function ReloadBanner({ reloading = false, onReload }: { reloading?: boolean; onReload: () => void }) {
  useEffect(() => {
    haptic('error');
  }, []);
  return (
    <div className="ch-rt-note is-warn" role="alert" data-ch-code="CH-11902">
      <Icon icon={RefreshCw} size={15} />
      <span>
        <b>This round was updated on another device.</b> Saving is paused here so this device can’t overwrite the newer round. Reload to continue.
      </span>
      <Button variant="secondary" size="sm" disabled={reloading} onClick={onReload}>
        {reloading ? 'Reloading…' : 'Reload'}
      </Button>
    </div>
  );
}

/**
 * CH-11013: an error the round reported while tracking (a failed checkpoint
 * or auto-save, a restore or discard that didn't work). The legacy new-round
 * screen shows it in a dismissible banner above the shot screen (B4: before
 * it, none of these had a visible surface outside a submit); Dismiss hides
 * it and nothing else. `message` is the sentence the round gave.
 *
 * Dismiss is silent: it only hides a message, and D-70 keeps other taps
 * quiet. It fires the error haptic once per new message; clear the message
 * on dismiss and a repeat of the same one ticks again.
 */
export function RoundErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useErrorHaptic(message);
  return (
    <div className="ch-rt-note is-danger" role="alert" data-ch-code="CH-11013">
      <Icon icon={TriangleAlert} size={15} />
      <span>{message}</span>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
