import type { BridgeGraph } from '../graph';
import type { ChSignal } from '../signal';

/** A small graph: Messages (P007) with one action, the shell (P001), and Practice (P017) borrowing a P013 row. */
export function fixtureGraph(): BridgeGraph {
  const page = (name: string, borrows: number[] = []) => ({
    name,
    slug: name.toLowerCase(),
    namespace: 0,
    routes: [],
    plannedRoutes: [],
    roles: [],
    gates: {},
    catalog: null,
    docs: {},
    held: [],
    screens: [],
    borrows,
  });
  return {
    version: 1,
    contentHash: 'fixture',
    pages: { P001: page('Shell'), P007: page('Messages'), P013: page('CoachHelm'), P017: page('Practice', [130645]) },
    surfaces: {},
    controls: {},
    actions: {
      'ACT-P007-SEND-MESSAGE': {
        page: 'P007',
        label: 'Send a message',
        component: null,
        handler: 'api.send',
        service: null,
        tables: ['golf_messages'],
        outcomes: { success: 70901, failure: 70603 },
        tests: [],
        useActionNames: ['messages.send'],
      },
    },
    ids: {
      10703: { ch: 'CH-1903', page: 'P001', category: 7, name: 'OFFLINE', meaning: 'Offline', status: 'implemented' },
      70603: { ch: 'CH-7004', page: 'P007', category: 6, name: 'SENDING_A_MESSAGE_THROWS', meaning: 'Sending a message throws', status: 'implemented' },
      70604: { ch: 'CH-7005', page: 'P007', category: 6, name: 'OLD', meaning: 'Retired', status: 'deprecated' },
      70605: { ch: 'CH-7006', page: 'P007', category: 6, name: 'UNBUILT', meaning: 'Not built', status: 'reserved' },
      70901: { ch: 'CH-7101', page: 'P007', category: 9, name: 'SENT', meaning: 'Sent', status: 'implemented' },
      70101: { page: 'P007', category: 1, name: 'THREAD_READY', meaning: 'The thread opens', status: 'implemented' },
      130645: { ch: 'CH-13080', page: 'P013', category: 6, name: 'SAVES_FAILED', meaning: 'Three saves failed', status: 'implemented' },
    },
    tombstones: { 70602: { removedAt: '2026-11-01', replacement: 70603 } },
    chIndex: { 'CH-1903': 10703, 'CH-7004': 70603, 'CH-7005': 70604, 'CH-7006': 70605, 'CH-7101': 70901, 'CH-13080': 130645 },
    codeIndex: {},
    findings: {},
    numberChecks: {},
  };
}

export function signal(over: Partial<ChSignal> = {}): ChSignal {
  return {
    v: 1,
    code: 'CH-7004',
    kind: 'action',
    outcome: 'failure',
    page: 'P007',
    role: 'coach',
    sessionId: 'sess_12345678',
    seq: 1,
    at: 1_763_000_000_000,
    release: 'abc1234',
    platform: 'ios-safari',
    viewport: 'phone',
    online: true,
    reducedMotion: false,
    animationsOff: false,
    ...over,
  };
}
