'use client';

import { useState } from 'react';
import { PushAskSheet } from '../shell/PushAsk';

/** The app's push ask (CH-1910) drawn open over a preview page (`&ask=push`): the browser never shows the real one. */
export function PreviewPushAsk({ role }: { role: 'coach' | 'player' }) {
  const [open, setOpen] = useState(true);
  return <PushAskSheet open={open} role={role} asking={false} onTurnOn={() => setOpen(false)} onNotNow={() => setOpen(false)} />;
}
