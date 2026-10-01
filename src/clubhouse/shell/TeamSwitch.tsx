'use client';

import { AnimatePresence, m } from 'framer-motion';
import { Check, ChevronsUpDown, Users } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../ui/Icon';
import { haptic } from '../lib/haptics';
import { CH_POP } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { useTeamSwitch, type ChTeamSwitch } from './team-switch';

const OPTION = '[role="option"]';

/**
 * Desktop: the sidebar's team line is a menu button (the boards draw its up-down chevrons) that opens the coach's
 * teams. A listbox in a portal, so the sidebar's scroll never clips it: arrows, Home and End move, Enter or Space
 * picks, Esc closes and focus goes back to the button.
 */
export function BrandTeamSwitch({ model, teamName }: { model: ChTeamSwitch; teamName: string | null }) {
  const sw = useTeamSwitch(model);
  const reduced = useChReducedMotion();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = model.choices.find((c) => c.id === sw.shownId)?.label ?? teamName;

  const close = useCallback((focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 6, width: Math.max(r.width, 224) });
    };
    place();
    const onScroll = (e: Event) => {
      if (list.current && e.target instanceof Node && list.current.contains(e.target)) return;
      close(false);
    };
    window.addEventListener('resize', place);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    document.addEventListener('mousedown', onDown);
    // The team you are on takes focus, so Enter again changes nothing and an arrow goes straight to the other.
    const frame = requestAnimationFrame(() => (list.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.current?.querySelector<HTMLElement>(OPTION))?.focus());
    return () => {
      document.removeEventListener('mousedown', onDown);
      cancelAnimationFrame(frame);
    };
  }, [open, close]);

  const onKey = (e: React.KeyboardEvent) => {
    const els = Array.from(list.current?.querySelectorAll<HTMLElement>(OPTION) ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      els[e.key === 'Home' ? 0 : els.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  const choose = (teamId: string) => {
    haptic('select');
    close();
    sw.pick(teamId);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="ch-brand ch-brand--switch"
        aria-label={`GolfHelm, ${current ?? 'your team'}. Switch team`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-busy={sw.pending || undefined}
        data-ch-code="CH-1813"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <img src="/helm-main-logo-transparent-white-trim.png" alt="" width={32} height={32} />
        <span className="ch-brand__txt">
          <span className="ch-brand__word">GolfHelm</span>
          {/* The board's team line: the name, then the up-down chevrons that say it opens. */}
          <span className="ch-brand__team ch-brand__team--switch">
            <span>{current ?? 'Choose a team'}</span>
            <Icon icon={ChevronsUpDown} size={13} />
          </span>
        </span>
      </button>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <m.div
                id={id}
                className="ch-popover ch-tsw"
                data-ui="clubhouse"
                style={{ left: pos?.left ?? -9999, top: pos?.top, width: pos?.width }}
                initial={reduced ? { opacity: 0 } : CH_POP.initial}
                animate={reduced ? { opacity: 1 } : CH_POP.animate}
                exit={reduced ? { opacity: 0 } : CH_POP.exit}
                transition={CH_POP.transition}
                onKeyDown={onKey}
              >
                <div className="ch-popover__label" id={`${id}-l`}>
                  Switch team
                </div>
                <div ref={list} role="listbox" aria-labelledby={`${id}-l`}>
                  {model.choices.map((c) => {
                    const on = c.id === sw.shownId;
                    return (
                      <button key={c.id} type="button" role="option" aria-selected={on} tabIndex={-1} className="ch-tsw__opt" onClick={() => choose(c.id)}>
                        <span className="ch-tsw__ic">
                          <Icon icon={Users} size={15} />
                        </span>
                        <span className="ch-tsw__name">{c.label}</span>
                        {on && <Icon icon={Check} size={16} className="ch-tsw__tick" />}
                      </button>
                    );
                  })}
                </div>
              </m.div>
            )}
          </AnimatePresence>,
          document.querySelector('.ch-root') ?? document.body,
        )}
    </>
  );
}

/**
 * Phone: the More sheet lists the coach's teams under who they are, the current one ticked. Each is a plain button
 * (the current one is `aria-current`), so the sheet's own focus trap and Tab order already cover it. The sheet closes
 * once a switch lands, so the new team's page is what is on screen; a refused one stays open with its Retry toast.
 */
export function MoreTeamSwitch({ model, onSwitched }: { model: ChTeamSwitch; onSwitched: () => void }) {
  const sw = useTeamSwitch(model, onSwitched);
  const label = useId();
  return (
    <section className="ch-more__team" data-ch-code="CH-1814">
      <h3 className="ch-more__cap" id={label}>
        Team
      </h3>
      <div className="ch-more__list" role="group" aria-labelledby={label} aria-busy={sw.pending || undefined}>
        {model.choices.map((c) => {
          const on = c.id === sw.shownId;
          return (
            <button
              key={c.id}
              type="button"
              className="ch-more__row"
              aria-current={on ? 'true' : undefined}
              onClick={() => {
                if (on) return;
                haptic('select');
                sw.pick(c.id);
              }}
            >
              <span className="ch-more__ic">
                <Icon icon={Users} size={17} />
              </span>
              <span className="ch-more__label">{c.label}</span>
              {on && <Icon icon={Check} size={17} className="ch-more__tick" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
