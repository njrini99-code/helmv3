import type { LucideIcon } from 'lucide-react';
import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * The empty or failed block inside the card that would hold the data (classes-roster-home 06 1.3): an icon disc, a title, a short
 * body and its buttons. Failed always says nothing was lost and offers Try again. Only the lane's flagged screens draw it.
 */
export function CrhStateBlock({
  kind = 'empty',
  icon,
  title,
  body,
  code,
  children,
}: {
  kind?: 'empty' | 'failed';
  icon?: LucideIcon;
  title: string;
  body?: ReactNode;
  code?: string;
  children?: ReactNode;
}) {
  return (
    <div className={'ch-crh-ste' + (kind === 'failed' ? ' is-failed' : '')} data-ch-code={code}>
      <span className="ch-crh-ste__ic" aria-hidden="true">
        <Icon icon={icon ?? CircleAlert} size={20} />
      </span>
      <b>{title}</b>
      {body && <p>{body}</p>}
      {children && <div className="ch-crh-ste__btns">{children}</div>}
    </div>
  );
}
