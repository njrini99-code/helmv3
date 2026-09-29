'use client';

import Link from 'next/link';
import { AnimatePresence, m } from 'framer-motion';
import { Ellipsis, Settings, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { Icon } from '../ui/Icon';
import { haptic } from '../lib/haptics';
import { chTween } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import type { ChShellData } from '../data/shell';
import { activeNavItem, navFor, type ChRole } from './nav';
import { badgeCount } from './Sidebar';

/**
 * Phone navigation (owner decision D-3): a green tab bar with the ivory-pass
 * active pill, four destinations plus More. A selection tick on every tab
 * change; More opens a sheet with the rest of the app.
 */
export function TabBar({ pathname, shell, role }: { pathname: string; shell: ChShellData; role: ChRole }) {
  const badges = useNotificationBadges();
  const reduced = useChReducedMotion();
  const [moreOpen, setMoreOpen] = useState(false);
  const nav = navFor(role);
  const current = activeNavItem(pathname, role);
  const tabs = nav.filter((i) => i.tab);
  const rest = nav.filter((i) => !i.tab);
  const moreActive = !!current && !current.tab;

  const moreBtn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => setMoreOpen(false), [pathname]);
  // The sheet is modal: focus moves into it, Tab stays inside, Esc closes it,
  // and focus returns to More when it closes (CH-1802).
  useEffect(() => {
    if (!moreOpen) return;
    const trigger = moreBtn.current;
    // The sheet mounts in the same commit, so it can take focus right away.
    sheet.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setMoreOpen(false);
      if (e.key !== 'Tab' || !sheet.current) return;
      const els = Array.from(sheet.current.querySelectorAll<HTMLElement>('a, button'));
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      trigger?.focus({ preventScroll: true });
    };
  }, [moreOpen]);

  return (
    <>
      <nav className="ch-tabbar" aria-label="Main">
        {tabs.map((t) => {
          const count = badgeCount(t, badges, shell);
          const active = current?.id === t.id;
          return (
            <Link
              key={t.id}
              href={t.href}
              className="ch-tab"
              aria-current={active ? 'page' : undefined}
              onClick={() => !active && haptic('select')}
            >
              <span className="ch-tab__icon">
                <Icon icon={t.icon} size={20} />
                {count != null && <span className="ch-tab__badge ch-num">{count > 99 ? '99+' : count}</span>}
              </span>
              <span className="ch-tab__label">{t.label}</span>
            </Link>
          );
        })}
        <button
          ref={moreBtn}
          type="button"
          className="ch-tab"
          aria-current={moreActive ? 'page' : undefined}
          aria-expanded={moreOpen}
          aria-controls="ch-more"
          onClick={() => {
            haptic('select');
            setMoreOpen((o) => !o);
          }}
        >
          <span className="ch-tab__icon">
            <Icon icon={Ellipsis} size={20} />
          </span>
          <span className="ch-tab__label">More</span>
        </button>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <>
            <m.div
              key="scrim"
              className="ch-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={chTween('base')}
              onClick={() => setMoreOpen(false)}
            />
            <m.div
              ref={sheet}
              key="sheet"
              id="ch-more"
              data-ch-code="CH-1802"
              role="dialog"
              aria-modal="true"
              aria-label="More"
              className="ch-more"
              initial={reduced ? { opacity: 0 } : { y: '100%' }}
              animate={reduced ? { opacity: 1 } : { y: 0 }}
              exit={reduced ? { opacity: 0 } : { y: '100%' }}
              transition={chTween('slow')}
              drag={reduced ? false : 'y'}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 80 || info.velocity.y > 500) {
                  haptic('press');
                  setMoreOpen(false);
                }
              }}
            >
              <div className="ch-more__grab" aria-hidden="true" />
              <div className="ch-more__head">
                <span>More</span>
                <button type="button" className="ch-btn ch-btn--ghost ch-iconbtn ch-btn--sm" aria-label="Close" onClick={() => setMoreOpen(false)}>
                  <Icon icon={X} size={15} />
                </button>
              </div>
              <div className="ch-more__list">
                {[...rest, { id: 'settings', label: 'Settings', href: '/golf/dashboard/settings', icon: Settings }].map((i) => (
                  <Link
                    key={i.id}
                    href={i.href}
                    className="ch-more__row"
                    aria-current={current?.id === i.id ? 'page' : undefined}
                    onClick={() => haptic('select')}
                  >
                    <Icon icon={i.icon} size={18} />
                    <span>{i.label}</span>
                  </Link>
                ))}
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
