'use client';

import { AnimatePresence, m } from 'framer-motion';
import { Bell, Flag, Settings2, Sparkles, UserRound, Users, type LucideIcon } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { haptic } from '../../lib/haptics';
import { CH_ROUTE } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { chTrail } from '../../lib/track';
import { keepSaved } from './live';
import { SECTIONS, type ChDevice, type ChSettingsData, type ChSettingsSection, type ChSettingsWrites } from './model';
import { DirtyContext, useUnsavedGuard } from './parts';
import { AccountSection } from './Account';
import { NotificationsSection } from './Notifications';
import { TeamSection } from './Team';
import { GolfSection } from './Golf';
import { CoachHelmSection } from './CoachHelm';
import { PreferencesSection } from './Preferences';
import '../../styles/settings.css';

const ICON: Record<ChSettingsSection, LucideIcon> = {
  account: UserRound,
  notifications: Bell,
  team: Users,
  golf: Flag,
  coachhelm: Sparkles,
  preferences: Settings2,
};

/**
 * Settings: one page, a section rail on the left (a scrolling strip on narrow
 * canvases), one section at a time on the right. The section lives in the
 * URL (`?section=`) so every section is linkable, and the old
 * /settings/notifications and /settings/coaching-intelligence links land on
 * theirs. Moving away with unsaved edits asks first.
 */
export function SettingsView({
  data: served,
  writes: raw,
  device,
  initialSection,
  onDeleted,
}: {
  data: ChSettingsData;
  writes: ChSettingsWrites;
  device: ChDevice;
  initialSection: ChSettingsSection;
  onDeleted: () => void;
}) {
  const reduced = useChReducedMotion();
  // The page's copy of the data: what the server rendered, plus what has been saved since (81204).
  // A section reads it when it opens; a fresh server read (after a refresh) replaces it.
  const [data, setData] = useState(served);
  const [seen, setSeen] = useState(served);
  if (seen !== served) {
    setSeen(served);
    setData(served);
  }
  const writes = useMemo(() => keepSaved(raw, setData), [raw]);
  const sections = SECTIONS[data.role];
  const [section, setSection] = useState<ChSettingsSection>(initialSection);
  const [ask, setAsk] = useState<ChSettingsSection | null>(null);
  const dirtyIds = useRef(new Set<string>());
  const [dirty, setDirty] = useState(false);
  const report = useCallback((id: string, d: boolean) => {
    if (d) dirtyIds.current.add(id);
    else dirtyIds.current.delete(id);
    setDirty(dirtyIds.current.size > 0);
  }, []);
  const guard = useUnsavedGuard(dirty);

  const show = (next: ChSettingsSection) => {
    if (next === section) return;
    haptic('select');
    chTrail(`settings section ${next}`);
    setSection(next);
    const url = new URL(window.location.href);
    url.pathname = '/golf/dashboard/settings';
    url.searchParams.set('section', next);
    window.history.replaceState(null, '', url.pathname + url.search);
    document.getElementById('ch-canvas')?.scrollTo({ top: 0 });
  };
  const go = (next: ChSettingsSection) => (dirty ? setAsk(next) : show(next));
  const current = sections.find((s) => s.id === section) ?? sections[0]!;

  return (
    <DirtyContext.Provider value={report}>
      <main className="ch-set">
        <header className="ch-set-head">
          <h1 className="ch-display">Settings</h1>
          <p>
            {data.role === 'coach' ? 'Coach' : 'Player'}
            {data.teamName ? ` · ${data.teamName}` : ''}
            {data.email ? ` · ${data.email}` : ''}
          </p>
        </header>
        <div className="ch-set-layout">
          <nav className="ch-set-rail" aria-label="Settings sections">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className={'ch-set-rail__i' + (s.id === section ? ' is-on' : '')}
                aria-current={s.id === section ? 'page' : undefined}
                onClick={() => go(s.id)}
              >
                <Icon icon={ICON[s.id]} size={16} />
                <span>
                  <b>{s.label}</b>
                  <span>{s.hint}</span>
                </span>
              </button>
            ))}
          </nav>
          <div className="ch-set-body">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={section}
                className="ch-set-stack"
                initial={reduced ? { opacity: 0 } : CH_ROUTE.initial}
                animate={reduced ? { opacity: 1 } : CH_ROUTE.animate}
                exit={reduced ? { opacity: 0 } : CH_ROUTE.exit}
                transition={CH_ROUTE.transition}
              >
                <SectionBoundary surface={`settings.${section}`} label={current.label} code="CH-8212">
                  {section === 'account' && <AccountSection data={data} writes={writes} onDeleted={onDeleted} />}
                  {section === 'notifications' && <NotificationsSection data={data} writes={writes} device={device} />}
                  {section === 'team' && <TeamSection data={data} writes={writes} />}
                  {section === 'golf' && <GolfSection data={data} writes={writes} />}
                  {section === 'coachhelm' && <CoachHelmSection data={data} writes={writes} />}
                  {section === 'preferences' && <PreferencesSection device={device} />}
                </SectionBoundary>
              </m.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
      {guard}
      <Modal
        open={ask != null}
        code="CH-8507"
        onClose={() => setAsk(null)}
        title="Leave without saving?"
        description="Your changes in this section haven't been saved."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAsk(null)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              feel="warning"
              onClick={() => {
                const next = ask;
                setAsk(null);
                dirtyIds.current.clear();
                setDirty(false);
                if (next) show(next);
              }}
            >
              Discard changes
            </Button>
          </>
        }
      />
    </DirtyContext.Provider>
  );
}
