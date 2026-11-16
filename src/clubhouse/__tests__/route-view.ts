import { Suspense, type ReactElement, type ReactNode } from 'react';
import { CoachHelmSwitchFrame } from '../screens/coachhelm/SwitchFrame';

/**
 * The views under CoachHelm's switch come back inside its frame, the switch mounted once above the view (N13C-67, N13P-18;
 * production audit 2026-11-15 P1-7, P1-19); the view's boundary is the frame's child. Anything else comes back as it is.
 */
export function underSwitchFrame(el: unknown): unknown {
  const frame = el as ReactElement<{ children?: ReactNode }> | null;
  return frame?.type === CoachHelmSwitchFrame ? frame.props.children : el;
}

/**
 * CoachHelm's route hands back one Suspense around an async view (every view of the page shares it, perf 2026-10-01); a test that
 * wants the screen the view draws runs that view's read, as the server does behind the boundary. Anything that is not that
 * boundary (the no-team page, `null`) comes back as it is.
 */
export async function resolved(el: unknown): Promise<ReactNode> {
  const boundary = underSwitchFrame(el) as ReactElement<{ children?: ReactElement }> | null;
  if (boundary?.type !== Suspense || !boundary.props.children) return el as ReactNode;
  const view = boundary.props.children;
  return (await (view.type as (props: unknown) => Promise<ReactNode>)(view.props)) as ReactNode;
}
