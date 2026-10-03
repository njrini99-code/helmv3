'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { PLAYER_HELM_DEVELOPMENT_HREF, PLAYER_HELM_TAB_LABEL, type PlayerHelmView } from '../../../data/coachhelm-views-shape';
import { haptic } from '../../../lib/haptics';
import { useChPhone } from '../../../lib/use-phone';
import { rebuiltHref } from '../../../shell/nav';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Segmented } from '../../../ui/Segmented';

const VIEWS: readonly PlayerHelmView[] = ['board', 'profile', 'standing', 'deep-dive'];

/**
 * The player's CoachHelm sub-navigation, the player's counterpart of the coach's Board and Ask strip (CH-13923): Board, Game
 * profile, Standing and Deep dive are views of this page, so they are one radiogroup and a choice is a route change, a real
 * address that reloads and shares. Development is not a view of this page (it is Stats' Development tab), so it is a link after
 * the group, drawn only while that screen is rebuilt, never a radio.
 *
 * Four labels and a link do not fit a phone's width as one control, so on the phone it is a row of chips that scrolls sideways
 * (the phone board's `qm-switch`), with the current one brought into view.
 *
 * It is controlled: `active` is the view the tap has chosen (at once, not when the server answers) and `onGo` changes view. The
 * page that draws it owns that state (`useViewSwitch`), because it is the page that dims and is marked busy while the next view loads.
 */
export function PlayerHelmTabs({ active, onGo }: { active: PlayerHelmView; onGo: (view: PlayerHelmView) => void }) {
  const phone = useChPhone();
  const row = useRef<HTMLDivElement>(null);
  const development = rebuiltHref(PLAYER_HELM_DEVELOPMENT_HREF, 'player');

  // The chip row is wider than the screen: start with the current chip in view, without moving the page.
  useEffect(() => {
    const box = row.current;
    const on = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (box && on) box.scrollLeft = Math.max(0, on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2);
  }, [phone, active]);

  if (phone) {
    return (
      <div className="ch-hv-tabs is-phone" data-ch-code="CH-13930">
        <div ref={row} className="ch-hv-chips" role="group" aria-label="CoachHelm view">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className="ch-hv-chip"
              aria-pressed={v === active}
              onClick={() => {
                if (v === active) return;
                haptic('select');
                onGo(v);
              }}
            >
              {PLAYER_HELM_TAB_LABEL[v]}
            </button>
          ))}
          {development && (
            <Link className="ch-hv-chip is-link" href={development} onClick={() => haptic('select')}>
              Development
              <Icon icon={ArrowUpRight} size={14} />
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="ch-hv-tabs" data-ch-code="CH-13930">
      <Segmented<PlayerHelmView> label="CoachHelm view" value={active} options={VIEWS.map((v) => ({ value: v, label: PLAYER_HELM_TAB_LABEL[v] }))} onChange={onGo} />
      {development && (
        <Button variant="ghost" size="sm" href={development} rightIcon={ArrowUpRight} feel="select">
          Development
        </Button>
      )}
    </div>
  );
}
