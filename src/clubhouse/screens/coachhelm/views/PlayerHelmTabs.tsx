'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { COACH_PLAYER_VIEWS, PLAYER_HELM_DEVELOPMENT_HREF, PLAYER_HELM_TAB_LABEL, type PlayerHelmView } from '../../../data/coachhelm-views-shape';
import { haptic } from '../../../lib/haptics';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useChPhone } from '../../../lib/use-phone';
import { useHelmViews } from '../../../shell/context';
import { rebuiltHref } from '../../../shell/nav';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Segmented } from '../../../ui/Segmented';
import { useHScroll, useKeepInView } from '../../../ui/use-hscroll';

const VIEWS: readonly PlayerHelmView[] = ['board', 'standing', 'deep-dive'];
/** The player's Ask: a view of this page with its own address, and no read of its own for the strip to wait on. */
const PLAYER_ASK_HREF = '/golf/dashboard/coachhelm?view=ask';
type PlayerTab = PlayerHelmView | 'ask';

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
export function PlayerHelmTabs({ active, onGo, coach = false, held = false }: { active: PlayerTab; onGo?: (view: PlayerHelmView) => void; coach?: boolean; held?: boolean }) {
  const phone = useChPhone();
  const router = useRouter();
  const helmViews = useHelmViews();
  const ask = !coach && !!helmViews.playerAsk;
  const go = (v: PlayerTab) => (v === 'ask' ? router.push(PLAYER_ASK_HREF) : onGo?.(v));
  const row = useRef<HTMLDivElement>(null);
  const rowEdges = useHScroll<HTMLDivElement>(row);
  const development = coach ? null : rebuiltHref(PLAYER_HELM_DEVELOPMENT_HREF, 'player');
  const views: readonly PlayerTab[] = coach ? COACH_PLAYER_VIEWS : ask ? [...VIEWS, 'ask'] : VIEWS;
  const labelOf = (v: PlayerTab) => (v === 'ask' ? 'Ask' : PLAYER_HELM_TAB_LABEL[v]);

  // The chip row is wider than the screen: the current chip is always whole and clear of the fading edge, without moving
  // the page (ui/use-hscroll.ts, as Team Hub's tabs). It was centred instead, which cut a chip on both sides of it
  // ("ard" … "Develop") where the row could have stood at its start with every view whole.
  useKeepInView(row, '[aria-current="true"]', `${phone}:${active}`, useChReducedMotion());

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
                go(v);
              }}
            >
              {labelOf(v)}
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
      <Segmented<PlayerTab> label="CoachHelm view" value={active} options={views.map((v) => ({ value: v, label: labelOf(v) }))} onChange={(v) => go(v)} />
      {development && (
        <Button variant="ghost" size="sm" href={development} rightIcon={ArrowUpRight} feel="select">
          Development
        </Button>
      )}
    </div>
  );
}
