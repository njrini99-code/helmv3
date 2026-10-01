'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { AuthFrame } from './AuthFrame';
import { SceneMount } from './SceneMount';

/** How the welcome hands over: the course folds into the dashboard's canvas, or (reduced motion, or a destination that is not the dashboard) it just fades. */
export type Handoff = 'fold' | 'fade';

interface Stage {
  begin: (handoff: Handoff) => void;
}
const StageContext = createContext<Stage | null>(null);

export function useWelcomeStage(): Stage {
  return useContext(StageContext) ?? { begin: () => {} };
}

/**
 * The welcome's frame: the green border, the course filling it and the paper it
 * folds to. It is drawn by the route straight away and stays mounted while the
 * greeting is read from the database and streams in as `children`, so the course
 * never restarts (the camera, the ball) when the text arrives, and the page is
 * never empty while it waits.
 */
export function WelcomeStage({ children }: { children?: ReactNode }) {
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const stage = useMemo<Stage>(() => ({ begin: setHandoff }), []);
  return (
    <StageContext.Provider value={stage}>
      <AuthFrame screen="welcome" phase={handoff ? 'leaving' : 'welcome'}>
        <div className="ch-au-photo" aria-hidden="true" data-ch-code="CH-15401" data-fold={handoff === 'fold' ? '' : undefined}>
          <SceneMount camera={handoff === 'fold' ? 'leave' : 'push'} play />
          <div className="ch-au-paper" />
        </div>
        {children}
      </AuthFrame>
    </StageContext.Provider>
  );
}
