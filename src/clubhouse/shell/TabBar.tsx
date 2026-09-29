'use client';

import Link from 'next/link';
import { AnimatePresence, m } from 'framer-motion';
import { Ellipsis, Settings, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { Icon } from '../ui/Icon';
import { haptic } from '../lib/haptics';
import { chTween } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import type { ChShellData } from '../data/shell';
import { CH_NAV, activeNavItem } from './nav';
import { badgeCount } from './Sidebar';

/**
 * Phone navigation (owner decision D-3): a green tab bar with the ivory-pass
 * active pill, four destinations plus More. A selection tick on every tab
 * change; More opens a sheet with the rest of the app.
 */
export function TabBar({ pathname, shell }: { pathname: string; shell: ChShellData }) {
  const badges = useNotificationBadges();
  const reduced = useChReducedMotion();
  const [moreOpen, setMoreOpen] = useState(false);
  const current = activeNavItem(pathname);
  const tabs = CH_NAV.filter((i) => i.tab);
  const rest = CH_NAV.filter((i) => !i.tab);
  const moreActive = !!current && !current.tab;

  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
              key="sheet"
              id="ch-more"
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
