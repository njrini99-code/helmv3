export type AskArtifactKind = 'practice_plan' | 'player_report' | 'lineup' | 'round_recap';

export interface AskArtifactVersion {
  id: string;
  at: string;
  body: unknown;
}

export interface AskArtifact {
  id: string;
  kind: AskArtifactKind;
  title: string;
  versions: AskArtifactVersion[];
}

export const KIND_LABEL: Record<AskArtifactKind, string> = { practice_plan: 'Practice plan', player_report: 'Player report', lineup: 'Lineup', round_recap: 'Round recap' };

/** Every `data-artifact` version of a thread, grouped by artifact, oldest first: an old message opens its old version. */
export function artifactsOf(parts: ReadonlyArray<{ type: string; data?: unknown }>): AskArtifact[] {
  const by = new Map<string, AskArtifact>();
  for (const p of parts) {
    if (p.type !== 'data-artifact') continue;
    const d = p.data as { artifactId?: string; kind?: AskArtifactKind; title?: string; versionId?: string; at?: string; body?: unknown } | undefined;
    if (!d?.artifactId || !d.kind || !d.title || !d.versionId) continue;
    const a = by.get(d.artifactId) ?? { id: d.artifactId, kind: d.kind, title: d.title, versions: [] };
    if (!a.versions.some((v) => v.id === d.versionId)) a.versions.push({ id: d.versionId, at: d.at ?? '', body: d.body });
    a.title = d.title;
    by.set(d.artifactId, a);
  }
  return [...by.values()];
}
