import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from '../../ui/Icon';

export type AuthTone = 'danger' | 'warning' | 'info' | 'positive';

const ICON: Record<AuthTone, LucideIcon> = { danger: CircleAlert, warning: TriangleAlert, info: Info, positive: CircleCheck };

/**
 * A notice on the auth screens: the design's four tones (danger, warning, info
 * and the positive one for "Account created"). Danger and warning are read out
 * as they appear (`role="alert"`); info and positive wait their turn (`status`).
 * Clubhouse's own InlineNotice is danger only, which is why this exists.
 */
export function AuthNotice({ tone, id, code, children, action }: { tone: AuthTone; id?: string; code?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`ch-au-notice ch-au-notice--${tone}`} id={id} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} data-ch-code={code}>
      <Icon icon={ICON[tone]} size={16} />
      <p>{children}</p>
      {action}
    </div>
  );
}
