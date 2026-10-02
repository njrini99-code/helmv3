'use client';

import { ArrowRight, CalendarDays, CircleAlert, CircleCheck, ClipboardCheck, Eye, Megaphone, MessageSquare, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { m } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationCategoryId } from '@/app/golf/actions/unified-notifications-model';
import { isDashboardDestination, welcomeDestination, type ChWelcome, type ChWelcomeItem } from '../../data/welcome-shape';
import { haptic } from '../../lib/haptics';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { useChPhone } from '../../lib/use-phone';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { dropHandoffCurtain } from '../../lib/handoff';
import { HANDOFF_MS, WELCOME_PHONE_AUTO_MS, welcomeBody, welcomeCard, welcomeDate, welcomeHint, welcomeItem, welcomeLine1, welcomeMark, welcomeName, welcomeScrim, type AuthCustom } from './auth-motion';
import { greetingWord, isDarkSky } from './scene-sky';
import { useLastHereLabel, useLocalDateLabel, useLocalHour } from './use-hour';
import { useQueryParam } from './use-query-param';
import { useWelcomeStage } from './WelcomeStage';

const CATEGORY_ICON: Record<NotificationCategoryId, LucideIcon> = {
  messages: MessageSquare,
  events: CalendarDays,
  announcements: Megaphone,
  tasks: ClipboardCheck,
  coachhelm: Sparkles,
  pipeline: Users,
  profile_views: Eye,
};

function WelcomeIcon({ icon }: { icon: LucideIcon }) {
  return (
    <span className="ch-au-wl-ic">
      <Icon icon={icon} size={15} />
    </span>
  );
}

function Item({ item, custom }: { item: ChWelcomeItem; custom: AuthCustom }) {
  return (
    <m.li variants={welcomeItem} custom={custom}>
      <WelcomeIcon icon={CATEGORY_ICON[item.category] ?? Sparkles} />
      <span className="ch-au-wl-t">
        <b>{item.title}</b>
        {item.body && <em>{item.body}</em>}
      </span>
    </m.li>
  );
}

/** The card's empty and failed states (CH-15201, CH-15301, CH-15302): each says what is true and never claims what it could not check. */
function NewsEmpty({ icon, code, title, body, custom }: { icon: LucideIcon; code: string; title: string; body: string; custom: AuthCustom }) {
  return (
    <m.div className="ch-au-wl-empty" variants={welcomeItem} custom={custom} data-ch-code={code}>
      <WelcomeIcon icon={icon} />
      <span className="ch-au-wl-t">
        <b>{title}</b>
        <em>{body}</em>
      </span>
    </m.div>
  );
}

/**
 * /golf/welcome in Clubhouse: the course fills the frame, the camera pushes to
 * the pin, a ball lands, the greeting focuses in and the card says what has
 * happened since the last visit. On a desktop it waits for Continue (or
 * Return); on a phone it carries on by itself once the greeting has landed
 * (Q-137), and Continue still goes sooner. Then it folds the course into the app canvas and hands
 * over. The greeting and the date come off the viewer's clock after hydration
 * (the server draws the reserved lines), and the card is only as true as its
 * reads: a failed read says so.
 */
export function Welcome({ data, navigate }: { data: ChWelcome; /** The preview and the tests replace where Continue goes. */ navigate?: (to: string) => void }) {
  const router = useRouter();
  const stage = useWelcomeStage();
  const next = useQueryParam('next');
  const reduced = useChReducedMotion();
  const phone = useChPhone();
  const hour = useLocalHour();
  const dateLabel = useLocalDateLabel();
  const lastHere = useLastHereLabel(data.lastSeenAt);
  const [armed, setArmed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const started = useRef(false);
  const timer = useRef<number | null>(null);

  const destination = welcomeDestination(next, data.isAdmin);
  // The fold lands on the dashboard's canvas, so it is drawn only when that is where this goes and it is Clubhouse.
  const fold = data.clubhouseDashboard && isDashboardDestination(destination) && !reduced;

  // The destination is known at mount, so it is fetched while the person reads.
  useEffect(() => {
    if (!navigate) router.prefetch(destination);
  }, [router, destination, navigate]);

  // Nothing starts before hydration has settled what the viewer's motion setting is: the text waits a frame.
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  /** Idempotent: a double tap, or Return on the focused button, starts one hand-off and no more. */
  const proceed = useCallback(() => {
    if (started.current) return;
    started.current = true;
    // CH-15604, CH-15705: Continue (or Return) commits once and folds the course into the canvas.
    haptic('commit');
    setLeaving(true);
    stage.begin(fold ? 'fold' : 'fade');
    timer.current = window.setTimeout(
      () => {
        // The fold has landed on an empty canvas: hold that frame over the route change until the dashboard is drawn.
        if (fold) dropHandoffCurtain();
        if (navigate) navigate(destination);
        else router.replace(destination);
      },
      reduced ? HANDOFF_MS.reducedNavigate : fold ? HANDOFF_MS.navigate : HANDOFF_MS.plain,
    );
  }, [destination, fold, navigate, reduced, router, stage]);

  // Phone: sign-in flows into the dashboard without a tap (Q-137); the fold still plays.
  useEffect(() => {
    if (!armed || !phone) return;
    const id = window.setTimeout(proceed, WELCOME_PHONE_AUTO_MS);
    return () => window.clearTimeout(id);
  }, [armed, phone, proceed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.defaultPrevented && !e.repeat) proceed();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [proceed]);

  const word = hour === null ? null : greetingWord(hour);
  const named = data.name.status === 'named';
  // Before the viewer's clock is known (the server render and the hydration pass) line 1 holds a non-breaking space, which keeps its height.
  const line1 = word === null ? ' ' : named ? `${word},` : `${word}.`;
  const spoken = word === null ? '' : named ? `${word}, ${data.name.status === 'named' ? data.name.display : ''}.` : `${word}.`;
  const dark = hour !== null && isDarkSky(hour);
  const custom: AuthCustom = { reduced };
  const { news } = data;

  return (
    <>
      <m.main className="ch-au-wl" aria-label="Welcome" data-dark={dark ? '' : undefined} initial="hidden" animate={leaving ? 'leave' : armed ? 'show' : 'hidden'} custom={custom}>
        {/* Announced once, when the sentence is final: the partial greeting would be two half sentences. */}
        <div className="ch-au-sr" role="status" aria-live="polite" aria-atomic="true" data-ch-code="CH-15803">
          {spoken}
        </div>
        <m.div className="ch-au-wl-scrim" variants={welcomeScrim} custom={custom} />
        <m.div className="ch-au-wl-mark" variants={welcomeMark} custom={custom}>
          <img src="/clubhouse/auth/helm-golf-mark.png" alt="" width={32} height={32} />
          <span>
            Golf<b>Helm</b>
          </span>
        </m.div>
        <m.div className="ch-au-wl-body" variants={welcomeBody} custom={custom}>
          <m.span className="ch-au-wl-date" variants={welcomeDate} custom={custom}>
            {dateLabel}
          </m.span>
          <h1 data-ch-code={named ? undefined : 'CH-15303'}>
            <m.span className="ch-au-wl-l1" variants={welcomeLine1} custom={custom}>
              {line1}
            </m.span>
            {data.name.status === 'named' && (
              <span className="ch-au-wl-l2">
                <m.span variants={welcomeName} custom={custom}>
                  {data.name.display}.
                </m.span>
              </span>
            )}
          </h1>
        </m.div>
        <m.div className="ch-au-wl-card" variants={welcomeCard} custom={custom}>
          <div className="ch-au-wl-news">
            <div className="ch-au-wl-news__h">
              <b>{news.first ? 'Your first time in' : 'Since you last signed in'}</b>
              {!news.first && lastHere && <span>{lastHere}</span>}
            </div>
            {news.failed ? (
              <NewsEmpty icon={CircleAlert} code="CH-15201" title="Updates didn’t load" body="They’ll be waiting in your notifications." custom={custom} />
            ) : news.items.length > 0 ? (
              <ul>
                {news.items.map((item, i) => (
                  <Item key={item.id} item={item} custom={{ reduced, index: i }} />
                ))}
              </ul>
            ) : news.first ? (
              <NewsEmpty icon={Sparkles} code="CH-15302" title="Your team’s updates will show up here" body="Messages, posted rounds and RSVPs since your last visit." custom={custom} />
            ) : (
              <NewsEmpty icon={CircleCheck} code="CH-15301" title="You’re all caught up" body="Nothing new since your last visit." custom={custom} />
            )}
          </div>
          <div className="ch-au-wl-cta">
            <Button variant="primary" size="lg" rightIcon={ArrowRight} feel={null} onClick={proceed}>
              Continue
            </Button>
          </div>
        </m.div>
        {!phone && (
          <m.span className="ch-au-wl-hint" variants={welcomeHint} custom={custom}>
            or press <kbd>Return</kbd>
          </m.span>
        )}
      </m.main>
    </>
  );
}
