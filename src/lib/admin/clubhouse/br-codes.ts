/**
 * The Bridge numbers itself (plan §6, owner decision D4). Every control and state on a Bridge screen carries a
 * `BR-<screen><nn>` code as `data-br`, so a test (and later the Bridge's own signal) can name it. The tables come
 * from plan §8; the four repeating states are xx90 loading, xx91 empty, xx92 failed, xx93 no signal yet.
 *
 * Pure data, isomorphic: server pages, client components and tests read the same map.
 * Plan: docs/superpowers/specs/helm-bridge/2026-11-18-clubhouse-bridge-redesign.md
 */

function states(screen: string) {
  return {
    loading: `BR-${screen}90`,
    empty: `BR-${screen}91`,
    failed: `BR-${screen}92`,
    noSignal: `BR-${screen}93`,
  } as const;
}

export const BR = {
  /** B02 Pages. */
  pages: {
    row: 'BR-0201',
    sort: 'BR-0202',
    viewRail: 'BR-0203',
    matrixCell: 'BR-0204',
    categoryLabel: 'BR-0205',
    show: 'BR-0206',
    docLink: 'BR-0207',
    forceState: 'BR-0208',
    pack: 'BR-0209',
    copy: 'BR-0210',
    ...states('02'),
  },
  /** B03 Controls. */
  controls: {
    row: 'BR-0301',
    filter: 'BR-0302',
    actionChip: 'BR-0303',
    codeLink: 'BR-0304',
    boardNote: 'BR-0305',
    pack: 'BR-0306',
    /** Not in the §8 table: the evidence footer's Copy (§7.5) is on every screen, so it takes the next number. */
    copy: 'BR-0307',
    ...states('03'),
  },
  /** B04 Actions. */
  actions: {
    row: 'BR-0401',
    sort: 'BR-0402',
    funnelSegment: 'BR-0403',
    wiringLink: 'BR-0404',
    failureReason: 'BR-0405',
    sessions: 'BR-0406',
    pack: 'BR-0407',
    /** Not in the §8 table; see BR-0307. */
    copy: 'BR-0408',
    ...states('04'),
  },
  /** B05 Codes. */
  codes: {
    row: 'BR-0501',
    filters: 'BR-0502',
    search: 'BR-0503',
    occurrence: 'BR-0504',
    sentry: 'BR-0505',
    markExpected: 'BR-0506',
    watch: 'BR-0507',
    forceState: 'BR-0508',
    pack: 'BR-0509',
    copy: 'BR-0510',
    ...states('05'),
  },
  /** B12 Readiness. */
  readiness: {
    pageRow: 'BR-1201',
    gateCell: 'BR-1202',
    heldPlan: 'BR-1203',
    migration: 'BR-1204',
    viewRail: 'BR-1205',
    findingRow: 'BR-1206',
    findingPack: 'BR-1207',
    numberCheck: 'BR-1208',
    /** Not in the §8 table; see BR-0307. */
    copy: 'BR-1209',
    ...states('12'),
  },
  /** B14 command palette. */
  palette: {
    open: 'BR-1401',
    result: 'BR-1402',
    byCode: 'BR-1403',
    byPerson: 'BR-1404',
    bySha: 'BR-1405',
    buildPack: 'BR-1406',
  },
  /** B15 shell. */
  shell: {
    railItem: 'BR-1501',
    sectionFold: 'BR-1502',
    scopeBar: 'BR-1503',
    refresh: 'BR-1504',
    pauseLive: 'BR-1505',
    viewAsExit: 'BR-1506',
    phoneMore: 'BR-1507',
  },
} as const;

export type BrScreen = Exclude<keyof typeof BR, 'palette' | 'shell'>;
