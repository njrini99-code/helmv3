import { SkelLine, Skeleton } from '../../../../ui/States';

/**
 * The sheet in waiting, on the sheet's own boxes so its head, title, facts and first sections stand where the loaded sheet puts
 * them (measured in WebKit at 390 and 1440, 2026-11-11): the masthead (the mark, the team and the copy's line, the date), the
 * title, the focus, the three facts, the groups, then the schedule's first rows. The focus and a fact's value take two lines on
 * a phone and one on a Mac, as the loaded sheet's do (`.ch-prc-sk-phone`, practice.css). How long the schedule runs is the
 * plan's own, so the sheet's foot lands where the plan puts it.
 */
export function PlanSheetSkeleton() {
  return (
    <article className="ch-cp-sheet ch-cp-skel" data-density="phone" aria-hidden="true">
      <header className="pp-top">
        <Skeleton width={36} height={36} radius={8} />
        <span className="pp-org">
          <SkelLine line={19} bar={12} width={150} />
          {/* The copy's line stands in the sheet's own leading: 21 on a Mac, 24 on a phone. */}
          <span className="ch-prc-sk-desk">
            <SkelLine line={21} bar={10} width={132} />
          </span>
          <span className="ch-prc-sk-phone">
            <SkelLine line={24} bar={10} width={132} />
          </span>
        </span>
        <Skeleton width={48} height={70} radius={8} />
      </header>
      <div className="pp-title">
        <SkelLine line={34} bar={24} width="72%" />
      </div>
      <div className="pp-focus">
        <SkelLine line={21} bar={12} width="94%" />
        <span className="ch-prc-sk-phone">
          <SkelLine line={21} bar={12} width="56%" />
        </span>
      </div>
      <div className="pp-meta">
        {[38, 72, 60].map((w) => (
          <div key={w}>
            <SkelLine line={16} bar={10} width={w} />
            <span className="ch-cp-skel__dd">
              <SkelLine line={19} bar={12} width="84%" />
              <span className="ch-prc-sk-phone">
                <SkelLine line={19} bar={12} width="52%" />
              </span>
            </span>
          </div>
        ))}
      </div>
      <section>
        <div className="pp-h">
          <SkelLine line={19} bar={12} width={52} />
          <SkelLine line={19} bar={12} width={57} />
        </div>
        <div className="pp-groups">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={102} radius={8} shape="solid" />
          ))}
        </div>
      </section>
      <section>
        <div className="pp-h">
          <SkelLine line={19} bar={12} width={66} />
          <SkelLine line={19} bar={12} width={22} />
        </div>
        <div className="sched">
          {[0, 1, 2, 3].map((i) => (
            <div className="drow" key={i}>
              <SkelLine line={19} bar={12} width={34} />
              {/* A block's name, where it is, then who it is for: the row a block with no rotation draws. */}
              <span>
                <SkelLine line={20} bar={13} width={`${40 + ((i * 13) % 26)}%`} />
                <SkelLine line={20} bar={11} width={`${24 + ((i * 7) % 20)}%`} />
                <SkelLine line={32} bar={26} width={72} />
              </span>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}
