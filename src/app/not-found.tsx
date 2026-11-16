import type { Metadata } from 'next';
import { NotFoundView } from './not-found-view';

/**
 * The platform's one dead-end page: `/golf/**`, `/baseball/**`, `/lifting/**`
 * and every marketing route funnel here (golf/not-found.tsx renders it too).
 *
 * A server component so it can name the tab: the 404 used to read only "Helm
 * Sports Labs" (GAP-M-02). The page itself is NotFoundView, a client component,
 * because only the client knows which product the visitor came from.
 *
 * `absolute`: a nested layout's template (golf's '%s · GolfHelm') must not
 * wrap it, so every 404 tab reads the same.
 */
export const metadata: Metadata = {
  title: { absolute: 'Page not found · Helm' },
};

export default function NotFound() {
  return <NotFoundView />;
}
