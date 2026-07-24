'use client';

import { useCallback, useRef, useState } from 'react';
import { fwHaptic } from '@/lib/fairway/haptics';
import styles from './helm-landing.module.css';
import { useHelmLandingEngine } from './useHelmLandingEngine';
import { HelmHeader } from './sections/HelmHeader';
import { HelmHero } from './sections/HelmHero';
import { HelmThesis } from './sections/HelmThesis';
import { HelmDashboardReveal } from './sections/HelmDashboardReveal';
import { HelmCoachHelm } from './sections/HelmCoachHelm';
import { HelmShotTracking } from './sections/HelmShotTracking';
import { HelmStatsDetail } from './sections/HelmStatsDetail';
import { HelmTeamManagement } from './sections/HelmTeamManagement';
import { HelmFinalCta } from './sections/HelmFinalCta';
import { HelmDemoModal } from './DemoModal';

/**
 * Helm landing — the full scroll-driven marketing page (a faithful port of
 * Helm Landing.dc.html). Owns the single root ref the scroll engine reads, and
 * the shared demo-modal state every "Request Demo" CTA opens.
 */
export function HelmLanding() {
  const rootRef = useRef<HTMLDivElement>(null);
  useHelmLandingEngine(rootRef);
  const [modalOpen, setModalOpen] = useState(false);
  const openModal = useCallback(() => {
    fwHaptic('light');
    setModalOpen(true);
  }, []);
  const closeModal = useCallback(() => setModalOpen(false), []);

  return (
    <div ref={rootRef} className={styles.root} style={{ minHeight: '100vh' }}>
      <HelmHeader onRequestDemo={openModal} />
      <HelmHero onRequestDemo={openModal} />
      <HelmThesis />
      <HelmDashboardReveal />
      <HelmCoachHelm />
      <HelmShotTracking />
      <HelmStatsDetail />
      <HelmTeamManagement />
      <HelmFinalCta onRequestDemo={openModal} />

      <HelmDemoModal open={modalOpen} onClose={closeModal} />
    </div>
  );
}
