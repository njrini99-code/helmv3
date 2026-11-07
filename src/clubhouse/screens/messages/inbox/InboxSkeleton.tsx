/**
 * The inbox before its conversations arrive (MSG-112, MSG-126): the same card, the same rows, so nothing moves when the
 * real ones land. Widths are the artifact's, per row (percent of the text column). One host with `role="status"` and the
 * words VoiceOver reads; the shapes are hidden. The pulse (MOT-X-15) and its Reduce Motion stop are in messages-inbox.css.
 * Plain markup with no hooks, so the server-rendered route skeleton (MessagesSkeleton) draws it too.
 */
export const INBOX_SKELETON_WIDTHS = [
  [46, 78],
  [38, 64],
  [52, 82],
  [34, 58],
  [44, 70],
] as const;

function Rows() {
  return (
    <>
      {INBOX_SKELETON_WIDTHS.map(([name, preview], i) => (
        <div key={i} className="ch-ms-row ch-inb-skrow" aria-hidden="true">
          <span className="ch-inb-sk__face" />
          <span className="ch-ms-row__main">
            <span className="ch-inb-sk" style={{ width: `${name}%` }} />
            <span className="ch-inb-sk is-small" style={{ width: `${preview}%` }} />
          </span>
        </div>
      ))}
    </>
  );
}

/** `card`: the phone's Recent card with its header bar. `rail`: the desktop's flat list under a label placeholder. */
export function InboxSkeleton({ layout, code = 'CH-7402' }: { layout: 'card' | 'rail'; code?: string }) {
  if (layout === 'card') {
    return (
      <section className="ch-msv-card ch-inb-skel" role="status" aria-label="Loading conversations" data-ch-code={code}>
        <div className="ch-msv-card__h" aria-hidden="true">
          <span className="ch-inb-sk is-bar" />
        </div>
        <Rows />
      </section>
    );
  }
  return (
    <div className="ch-inb-skel is-rail" role="status" aria-label="Loading conversations" data-ch-code={code}>
      <p className="ch-ms-sec__l" aria-hidden="true">
        <span className="ch-inb-sk is-label" />
      </p>
      <Rows />
    </div>
  );
}
