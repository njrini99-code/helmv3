import { SpaceRoot } from '../../_ui/ui';
import './reliability.css';

/** Shape-matching placeholder while a Reliability screen reads (BR xx90): tabs, headline, cards, list and detail. */
export function SpaceLoading({ br }: { br: string }) {
  return (
    <SpaceRoot br={br}>
      <div className="rl-skel" style={{ height: 44, width: 360, maxWidth: '100%' }} aria-hidden="true" />
      <div className="rl-skel" style={{ height: 120, width: '60%', maxWidth: '100%' }} aria-hidden="true" />
      <div className="bs-grid" aria-hidden="true">
        <div className="bs-panel" style={{ height: 120 }} />
        <div className="bs-panel" style={{ height: 120 }} />
      </div>
      <div className="rl-split" aria-hidden="true">
        <div className="bs-panel rl-list" style={{ height: 420 }} />
        <div className="bs-panel rl-detail" style={{ height: 420 }} />
      </div>
      <span className="bs-visually-hidden" role="status">
        Loading
      </span>
    </SpaceRoot>
  );
}
