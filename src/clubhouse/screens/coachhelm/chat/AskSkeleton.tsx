import { SkelLine, Skeleton } from '../../../ui/States';
import { CoachHelmTabs } from './SubTabs';

/**
 * The Ask view on its way (CH-13420): the sub-tab strip, the chats, the greeting lines and the composer, in place, so nothing
 * moves when the data arrives. `aria-busy`, no spinner. The route shows it while the chat context, the pulse and the chats
 * read (a Suspense boundary inside the route: `coachhelm/loading.tsx` cannot read `?view=`, so it stays the Board's shape).
 * It draws on the server. `chained`: it follows the route's own skeleton (see CoachHelmSkeleton).
 *
 * Desktop is drawn in the loaded page's own classes (WebKit 1280 and 1440, 2026-10-29), so the existing layout places it: the
 * team at the left of the strip and Board | Ask at the right (the strip itself, held: it was a bar at the left, 1,014px from where
 * the control lands), the chats panel's head, New chat, search and two groups of rows; the chat's "New chat" head, then the
 * two-line greeting, the composer, the starter questions and the four capabilities where the new chat draws them.
 */
export function AskSkeleton({ chained }: { chained?: boolean } = {}) {
  return (
    <main className="ch-ask ch-ask-sk" aria-busy="true" aria-label="Loading Ask CoachHelm" data-skel={chained ? 'chained' : undefined} data-ch-code="CH-13420">
      {/* The screen's one h1 while it loads, for the page outline (P013 D8). */}
      <h1 className="ch-sr-only">Ask CoachHelm</h1>
      <div className="ch-ask-top">
        <CoachHelmTabs active="ask" held />
        <span className="ch-ask-team ch-ask-sk__desk" aria-hidden="true">
          <i />
          <Skeleton width={104} height={12} />
        </span>
      </div>
      <div className="ch-ask-body has-panel">
        <aside className="ch-ask-hist" aria-hidden="true">
          <div className="ch-ask-hist__head">
            <Skeleton width={84} height={14} />
            <Skeleton width={20} height={20} radius={5} />
          </div>
          <Skeleton width="100%" height={42} radius={12} />
          <Skeleton width="100%" height={36} radius={10} />
          {[
            [44, [62, 60]],
            [52, [74, 82, 70]],
          ].map(([label, rows], g) => (
            <div key={g} className="ch-ask-sk__lines">
              <SkelLine line={18} bar={10} width={label as number} />
              {(rows as number[]).map((w, i) => (
                <SkelLine key={i} line={34} bar={13} width={`${w}%`} />
              ))}
            </div>
          ))}
        </aside>
        <section className="ch-ask-main">
          <header className="ch-ask-head ch-ask-sk__desk" aria-hidden="true">
            <SkelLine line={22} bar={13} width={64} />
          </header>
          <div className="ch-ask-scroll is-home ch-ask-sk__desk" aria-hidden="true">
            <div className="ch-ask-home">
              <div className="ch-ask-greet ch-ask-sk__greet">
                <span className="ch-ask-sk__greet">
                  <SkelLine line={38} bar={30} width="58%" />
                  <SkelLine line={38} bar={30} width="50%" />
                </span>
                <SkelLine line={26} bar={13} width="56%" />
              </div>
              <Skeleton width="100%" height={130} radius={24} shape="solid" />
              <div className="ch-ask-sk__pills">
                {[197, 308, 233, 167].map((w) => (
                  <Skeleton key={w} width={w} height={37} radius={18} />
                ))}
              </div>
              <ul className="ch-ask-caps">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i}>
                    <Skeleton width="100%" height={174} radius={16} shape="solid" />
                  </li>
                ))}
              </ul>
            </div>
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
