'use client';

import type { ComponentProps } from 'react';
import { Modal } from '../../../ui/Modal';
import '../../../styles/messages-overlays.css';

/**
 * The Messages sheet (MSG-407, MOT-POLL-4, MOT-X-5, MOT-X-6): the shared `Modal` on its native dialog (focus trap, Escape, the open
 * and close springs that catch a reopen mid-exit) wearing the Messages feel. A blurred scrim (14 px, saturate 120%), 78% tall on a phone
 * with a 36 x 5 grabber, a 400 wide centred card on desktop (82% tall, it scales up from .94), and the drag closes past one third of
 * the sheet's height or a flick faster than 0.5 px/ms, with a `sqrt` band when pulled up. Same props as `Modal`.
 */
export function MsSheet({ className, width = 400, ...rest }: Omit<ComponentProps<typeof Modal>, 'variant'>) {
  return <Modal {...rest} width={width} variant="messages" className={'ch-mss' + (className ? ` ${className}` : '')} />;
}
