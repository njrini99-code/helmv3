import { Skeleton } from '../../../ui/States';

/**
 * The Ask view on its way (CH-13420): the sub-tab strip, the chats, the greeting lines and the composer, in place, so nothing
 * moves when the data arrives. `aria-busy`, no spinner. The route shows it while the chat context, the pulse and the chats
 * read (a Suspense boundary inside the route: `coachhelm/loading.tsx` cannot read `?view=`, so it stays the Board's shape).
 * Server-safe: it draws on the server and needs no script. `chained`: it follows the route's own skeleton (see CoachHelmSkeleton).
 */
export function AskSkeleton({ chained }: { chained?: boolean } = {}) {
  return (
    <main className="ch-ask ch-ask-sk" aria-busy="true" aria-label="Loading Ask CoachHelm" data-skel={chained ? 'chained' : undefined} data-ch-code="CH-13420">
      {/* The screen's one h1 while it loads, for the page outline (P013 D8). */}
      <h1 className="ch-sr-only">Ask CoachHelm</h1>
      <div className="ch-ask-top">
        <Skeleton width={150} height={38} radius={12} />
      </div>
      <div className="ch-ask-body has-panel">
        <aside className="ch-ask-hist" aria-hidden="true">
          <Skeleton width={110} height={14} />
          <Skeleton width="100%" height={42} radius={12} />
          <Skeleton width="100%" height={38} radius={10} />
          <div className="ch-ask-sk__rows">
            {[72, 58, 66, 80, 52, 70].map((w, i) => (
              <Skeleton key={i} width={`${w}%`} height={13} />
            ))}
          </div>
        </aside>
        <section className="ch-ask-main">
          <div className="ch-ask-sk__mid" aria-hidden="true">
            <Skeleton width={44} height={44} radius={14} />
            <Skeleton width="62%" height={30} radius={8} />
            <Skeleton width="40%" height={14} />
            <Skeleton width="100%" height={112} radius={24} />
          </div>
          {/* The phone's shape (CSS shows one or the other): the opener and its three question rows at the foot, over the
              composer, as the new chat draws them. */}
          <div className="ch-ask-sk__ph" aria-hidden="true">
            <div className="ch-ask-sk__phgreet">
              <Skeleton width="86%" height={26} radius={7} />
              <Skeleton width="58%" height={26} radius={7} />
              <Skeleton width="72%" height={13} />
            </div>
            <ul className="ch-ask-sk__phrows">
              {[34, 46, 40].map((w, i) => (
                <li key={i}>
                  <Skeleton width={`${w}%`} height={14} />
                  <Skeleton width={`${w + 22}%`} height={11} />
                </li>
              ))}
            </ul>
            <Skeleton width="100%" height={60} radius={24} />
          </div>
        </section>
      </div>
    </main>
  );
}
