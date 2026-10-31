'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { COACH_PLAYER_VIEWS, PLAYER_HELM_DEVELOPMENT_HREF, PLAYER_HELM_TAB_LABEL, type PlayerHelmView } from '../../../data/coachhelm-views-shape';
import { haptic } from '../../../lib/haptics';
import { useChPhone } from '../../../lib/use-phone';
import { rebuiltHref } from '../../../shell/nav';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Segmented } from '../../../ui/Segmented';
import { useHScroll } from '../../../ui/use-hscroll';

const VIEWS: readonly PlayerHelmView[] = ['board', 'standing', 'deep-dive'];

/**
 * The player's CoachHelm sub-navigation, the player's counterpart of the coach's Board and Ask strip (CH-13923): Board, Standing
 * and Deep dive are views of this page, so they are one radiogroup and a choice is a route change, a real address that reloads and
 * shares. Game profile was a fourth until it folded into Standing ("How you play"; design call, Nav). Development is not a view of this page (it is Stats' Development tab), so it is a link after
 * the group, drawn only while that screen is rebuilt, never a radio.
 *
 * The labels and a link may not fit a phone's width as one control, so on the phone it is a row of chips that scrolls sideways
 * (the phone board's `qm-switch`), with the current one brought into view.
 *
 * It is controlled: `active` is the view the tap has chosen (at once, not when the server answers) and `onGo` changes view. The
 * page that draws it owns that state (`useViewSwitch`), because it is the page that dims and is marked busy while the next view loads.
 *
 * `coach`: a coach's views of one player (spec A): Deep dive and Standing, in that order. The Board is not one of them
 * (the way back is the header's link and the phone's Back), and Development is the player's own link, so it is not drawn.
 *
 * `held`: drawn by a loading skeleton (desktop), inert and hidden from assistive tech, so the strip stands where and as wide as the
 * page draws it and does not morph from a bar into itself when the page lands.
 */
export function PlayerHelmTabs({ active, onGo, coach = false, held = false }: { active: PlayerHelmView; onGo?: (view: PlayerHelmView) => void; coach?: boolean; held?: boolean }) {
  const phone = useChPhone();
  const row = useRef<HTMLDivElement>(null);
  const rowEdges = useHScroll<HTMLDivElement>(row);
  const development = coach ? null : rebuiltHref(PLAYER_HELM_DEVELOPMENT_HREF, 'player');
  const views = coach ? COACH_PLAYER_VIEWS : VIEWS;

  // The chip row is wider than the screen: start with the current chip in view, without moving the page.
  useEffect(() => {
    const box = row.current;
    const on = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (box && on) box.scrollLeft = Math.max(0, on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2);
  }, [phone, active]);

  if (phone) {
    return (
      <div className="ch-hv-tabs is-phone" data-ch-code="CH-13930">
        <div ref={rowEdges} className="ch-hscroll ch-hv-chips" role="group" aria-label="CoachHelm view">
          {views.map((v) => (
            <button
              key={v}
              type="button"
              className="ch-hv-chip"
              aria-current={v === active ? 'true' : undefined}
              onClick={() => {
                if (v === active) return;
                haptic('select');
                onGo?.(v);
              }}
            >
              {PLAYER_HELM_TAB_LABEL[v]}
            </button>
          ))}
          {development && (
            <Link className="ch-hv-chip is-link" href={development}>
              Development
              <Icon icon={ArrowUpRight} size={14} />
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="ch-hv-tabs" data-ch-strip="" data-ch-code={held ? undefined : 'CH-13930'} inert={held || undefined} aria-hidden={held || undefined}>
      <Segmented<PlayerHelmView> label="CoachHelm view" value={active} options={views.map((v) => ({ value: v, label: PLAYER_HELM_TAB_LABEL[v] }))} onChange={(v) => onGo?.(v)} />
      {development && (
        <Button variant="ghost" size="sm" href={development} rightIcon={ArrowUpRight} feel="select">
          Development
        </Button>
      )}
    </div>
  );
}
