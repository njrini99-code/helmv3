import { describe, expect, it } from 'vitest';
import { hits, ratchet, walk } from './_scan';

/**
 * CONS-31: chips, segmented controls and tabs come from ui/ (Pill, Segmented, a ui/Tabs to come). These are the
 * hand-rolled ones still standing; their counts may only fall. Which of them can move waits on behaviour the shared
 * controls lack and on the owner's calls (What's new's filter, the Roster sort).
 */
const FILES = walk(undefined, /\.(tsx|css)$/);
const GROUPS = {
  chips: /ch-(qfm-chip|th-chip|ask-pill|th-pill|hv-chip|msp-chip|hb-chip|rt-pill|setm-pill|bst-pill|qf-pill)\b/,
  segmented: /ch-(rt-seg|hb-aud|rsu-opts|rsu-par|rsu-sw|rt-opts|rt-amiss|recm-stages)\b/,
  // Not the shell's use-prefetch-tabs module, whose import path ends the same way.
  tabs: /(?<!prefet)ch-(tabs|pf-tabs|hb-tabs|hv-tabs|ask-tabs|stm-legs)\b/,
};

const ALLOW: Record<keyof typeof GROUPS, Record<string, number>> = {
  chips: {
    'screens/coachhelm/chat/ActionCard.tsx': 2,
    'screens/coachhelm/chat/Home.tsx': 1,
    'screens/coachhelm/chat/Thread.tsx': 1,
    'screens/coachhelm/views/PlayerHelmTabs.tsx': 2,
    'screens/hub/sheets.tsx': 1,
    'screens/messages/MessagesPhone.tsx': 1,
    'screens/qualifiers/QualifierDetailPhone.tsx': 1,
    'screens/qualifiers/QualifiersList.tsx': 1,
    'screens/rounds/track/RoundTracking.tsx': 2,
    'screens/settings/phone/StaffPhone.tsx': 2,
    'screens/settings/phone/TeamPhone.tsx': 1,
    'shell/BellStacks.tsx': 2,
    'styles/coachhelm-ask.css': 4,
    'styles/coachhelm-thread.css': 10,
    'styles/coachhelm-views.css': 10,
    'styles/hub.css': 7,
    'styles/messages.css': 8,
    'styles/qualifiers.css': 22,
    'styles/rounds-track.css': 10,
    'styles/settings.css': 7,
    'styles/shell.css': 4,
  },
  segmented: {
    'screens/hub/sheets.tsx': 2,
    'screens/hub/trip-edit.tsx': 1,
    'screens/recruiting/RecruitingPhone.tsx': 1,
    'screens/rounds/setup/AddCourseSheet.tsx': 1,
    'screens/rounds/setup/HoleConfig.tsx': 1,
    'screens/rounds/setup/RoundSetup.tsx': 1,
    'screens/rounds/track/ShotEntry.tsx': 1,
    'screens/rounds/track/parts.tsx': 1,
    'screens/rounds/track/sheets.tsx': 4,
    'styles/hub.css': 7,
    'styles/recruiting.css': 1,
    'styles/rounds-setup.css': 24,
    'styles/rounds-track.css': 32,
  },
  tabs: {
    'screens/coachhelm/chat/SubTabs.tsx': 1,
    'screens/coachhelm/views/PlayerHelmTabs.tsx': 2,
    'screens/hub/HubSkeleton.tsx': 1,
    'screens/hub/HubSkeletonTop.tsx': 1,
    'screens/hub/TeamHub.tsx': 1,
    'screens/stats/SgBars.tsx': 1,
    'screens/stats/StatsPhoneSkeleton.tsx': 1,
    'screens/stats/StatsPlayer.tsx': 2,
    'screens/stats/StatsSkeleton.tsx': 2,
    'screens/stats/StatsTeamPhone.tsx': 4,
    'styles/coachhelm-ask.css': 4,
    'styles/coachhelm-views.css': 2,
    'styles/coachhelm.css': 3,
    'styles/hub.css': 15,
    'styles/stats.css': 11,
  },
};

describe('chips, segmented and tabs from ui/ (CONS-31)', () => {
  for (const [name, re] of Object.entries(GROUPS) as [keyof typeof GROUPS, RegExp][]) {
    it(`no new hand-rolled ${name}`, () => {
      const r = ratchet(hits(re, FILES), ALLOW[name]);
      expect(r.over).toEqual([]);
      expect(r.stale).toEqual([]);
    });
  }
});
