'use client';

/**
 * TEMP redesign direction B (removed before ship) · per-section dirty tracking.
 *
 * The settings panels report unsaved edits into `DirtyRegistryContext`, which
 * the screen-level `UnsavedChangesGuard` provides. That registry is
 * write-only: nothing can ask it which panel is dirty. So each section's panes
 * render under a pass-through provider that forwards every call to the
 * guard's registry UNCHANGED (the leave guard keeps working exactly as
 * before) and also records which section the dirty panel lives in. The rail
 * reads that record to paint its unsaved dot.
 *
 * Stability matters here: `useReportDirty` lists the registry in its effect
 * deps, so a provider value that changed identity on every dirty flip would
 * make each panel clear and re-register itself in a loop. The tracker API is
 * built once, and each section's provider value only depends on the section
 * id, the guard's (stable) registry and that tracker.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DirtyRegistryContext,
  type DirtyRegistry,
} from '@/components/fairway/pages/settings/FairwaySettingsGeneral';
import type { SectionId } from './sections';

export interface SectionDirtyTracker {
  report: (section: SectionId, panelId: string, dirty: boolean) => void;
  release: (section: SectionId, panelId: string) => void;
}

function sameMembers(a: ReadonlySet<SectionId>, b: ReadonlySet<SectionId>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/**
 * Workbench-level record of dirty panel ids per section.
 *
 * `onPanelSettled` fires when a panel goes from dirty back to clean. For the
 * explicit-save panels that is the moment a save landed (their snapshot moved
 * to the saved values) or the user put every field back, and either way the
 * persisted value is worth re-reading for the rail's status line.
 */
export function useSectionDirtyTracker(
  onPanelSettled: (section: SectionId, panelId: string) => void,
) {
  const dirtyRef = useRef(new Map<SectionId, Set<string>>());
  const [dirtySections, setDirtySections] = useState<ReadonlySet<SectionId>>(() => new Set());

  const settledRef = useRef(onPanelSettled);
  useEffect(() => {
    settledRef.current = onPanelSettled;
  });

  const publish = useCallback(() => {
    const next = new Set<SectionId>();
    dirtyRef.current.forEach((ids, section) => {
      if (ids.size > 0) next.add(section);
    });
    setDirtySections((prev) => (sameMembers(prev, next) ? prev : next));
  }, []);

  const tracker = useMemo<SectionDirtyTracker>(
    () => ({
      report: (section, panelId, dirty) => {
        let ids = dirtyRef.current.get(section);
        if (!ids) {
          ids = new Set();
          dirtyRef.current.set(section, ids);
        }
        if (ids.has(panelId) === dirty) return;
        if (dirty) ids.add(panelId);
        else ids.delete(panelId);
        publish();
        if (!dirty) settledRef.current(section, panelId);
      },
      release: (section, panelId) => {
        if (dirtyRef.current.get(section)?.delete(panelId)) publish();
      },
    }),
    [publish],
  );

  return { tracker, dirtySections };
}

export function SectionDirtyScope({
  section,
  tracker,
  children,
}: {
  section: SectionId;
  tracker: SectionDirtyTracker;
  children: React.ReactNode;
}) {
  const guardRegistry = useContext(DirtyRegistryContext);

  const value = useMemo<DirtyRegistry>(
    () => ({
      setDirty: (panelId, dirty) => {
        guardRegistry?.setDirty(panelId, dirty);
        tracker.report(section, panelId, dirty);
      },
      clear: (panelId) => {
        guardRegistry?.clear(panelId);
        tracker.release(section, panelId);
      },
    }),
    [guardRegistry, section, tracker],
  );

  return <DirtyRegistryContext.Provider value={value}>{children}</DirtyRegistryContext.Provider>;
}
