/**
 * B14, the command palette's graph half (plan §7.2): type a page, an action, a control, a Bridge ID, a CH- code or a
 * finding and land on its dossier. `>pack` also takes a release (`rel:<sha>`), a person (`user:<uuid>`) or a team
 * (`team:<uuid>`), which only live data knows; plain search stays on the graph.
 *
 * Pure: the GET route (`/api/admin/clubhouse/search`) runs it on the server against the graph, so the 1.4 MB file
 * never reaches the browser. Exact IDs win, then prefixes, then words.
 */
import type { BridgeGraph } from './graph';
import { clubhouseHref, controlLabel } from './screens';
import { resolvePackTarget } from './pack';

export type BridgeSearchKind = 'page' | 'action' | 'control' | 'code' | 'finding' | 'release' | 'person' | 'team';

export interface BridgeSearchHit {
  kind: BridgeSearchKind;
  /** The thing's own ID: P007, ACT-P007-SEND-MESSAGE, CTL-P007-014, 70603, F-0001. */
  key: string;
  label: string;
  description: string;
  href: string;
  /** Lower ranks first: 0 exact ID, 1 ID prefix, 2 word match. */
  rank: number;
}

export const SEARCH_MIN_QUERY = 2;
export const SEARCH_MAX_QUERY = 80;
const PER_KIND = 5;
const TOTAL = 12;

function rankFor(key: string, needle: string, texts: ReadonlyArray<string | undefined>): number | null {
  const k = key.toLowerCase();
  if (k === needle) return 0;
  if (k.startsWith(needle)) return 1;
  if (k.includes(needle)) return 2;
  return texts.some((t) => t?.toLowerCase().includes(needle)) ? 2 : null;
}

export function searchBridgeGraph(graph: BridgeGraph, rawQuery: string): BridgeSearchHit[] {
  const needle = rawQuery.trim().toLowerCase().slice(0, SEARCH_MAX_QUERY);
  if (needle.length < SEARCH_MIN_QUERY) return [];
  // `>pack 70603` (plan §7.2, BR-1406): one hit, straight to the Duet desk with the pack built.
  const packFor = /^>\s*pack\s+(\S+)$/.exec(needle);
  if (packFor) {
    const target = resolvePackTarget(graph, packFor[1]);
    return target
      ? [{ kind: target.kind, key: target.key, label: `Build the pack for ${target.key}`, description: 'Opens the Duet desk with it built', href: clubhouseHref.duet(target.key), rank: 0 }]
      : [];
  }
  const hits: BridgeSearchHit[] = [];
  // Each kind keeps its best few, so 2,000 code meanings can never crowd out the one page you meant.
  const push = (list: BridgeSearchHit[]) => {
    hits.push(...list.sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key, 'en', { numeric: true })).slice(0, PER_KIND));
  };

  // A CH- code resolves through the index to its Bridge ID: exact, so it leads.
  const chId = /^ch-\d+$/.test(needle) ? graph.chIndex[needle.toUpperCase()] : undefined;

  const pages: BridgeSearchHit[] = [];
  for (const [key, page] of Object.entries(graph.pages)) {
    const rank = rankFor(key, needle, [page.name, page.slug, ...page.routes]);
    if (rank === null) continue;
    pages.push({ kind: 'page', key, label: `${key} ${page.name}`, description: page.routes[0] ?? 'Clubhouse page', href: clubhouseHref.page(key), rank });
  }
  push(pages);

  const codes: BridgeSearchHit[] = [];
  for (const [key, id] of Object.entries(graph.ids)) {
    const exactCh = chId !== undefined && String(chId) === key;
    const rank = exactCh ? 0 : rankFor(key, needle, [id.ch, id.name, id.meaning, id.catalogRow?.theySee]);
    if (rank === null) continue;
    codes.push({
      kind: 'code',
      key,
      label: id.ch ? `${key} · ${id.ch}` : key,
      description: `${id.page} · ${id.meaning}`,
      href: clubhouseHref.code(key),
      rank: rank === 2 && id.ch?.toLowerCase() === needle ? 0 : rank,
    });
  }
  push(codes);

  const actions: BridgeSearchHit[] = [];
  for (const [key, action] of Object.entries(graph.actions)) {
    const rank = rankFor(key, needle, [action.label, action.handler ?? undefined, action.service ?? undefined]);
    if (rank === null) continue;
    actions.push({ kind: 'action', key, label: action.label, description: `${key} · ${action.page}`, href: clubhouseHref.action(key), rank });
  }
  push(actions);

  const controls: BridgeSearchHit[] = [];
  for (const [key, control] of Object.entries(graph.controls)) {
    const rank = rankFor(key, needle, [control.label, control.labelTemplate, control.description]);
    if (rank === null) continue;
    controls.push({ kind: 'control', key, label: controlLabel(control), description: `${key} · ${control.page}`, href: clubhouseHref.control(key), rank });
  }
  push(controls);

  const findings: BridgeSearchHit[] = [];
  for (const [key, finding] of Object.entries(graph.findings)) {
    const rank = rankFor(key, needle, [finding.title]);
    if (rank === null) continue;
    findings.push({
      kind: 'finding',
      key,
      label: `${key} ${finding.severity}`,
      description: finding.title,
      href: `${clubhouseHref.readiness()}?view=findings#${encodeURIComponent(key)}`,
      rank,
    });
  }
  push(findings);

  return hits.sort((a, b) => a.rank - b.rank).slice(0, TOTAL);
}
