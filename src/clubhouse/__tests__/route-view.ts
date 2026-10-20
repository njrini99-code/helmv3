import { Suspense, type ReactElement, type ReactNode } from 'react';

/**
 * CoachHelm's route hands back one Suspense around an async view (every view of the page shares it, perf 2026-10-01); a test that
 * wants the screen the view draws runs that view's read, as the server does behind the boundary. Anything that is not that
 * boundary (the no-team page, `null`) comes back as it is.
 */
export async function resolved(el: unknown): Promise<ReactNode> {
  const boundary = el as ReactElement<{ children?: ReactElement }> | null;
  if (boundary?.type !== Suspense || !boundary.props.children) return el as ReactNode;
  const view = boundary.props.children;
  return (await (view.type as (props: unknown) => Promise<ReactNode>)(view.props)) as ReactNode;
}
