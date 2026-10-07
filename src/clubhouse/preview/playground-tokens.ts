/** Local design proposals only; no settings persistence or production writes. */
export const PLAYGROUND_CHANNEL = 'clubhouse-component-playground';
export const TUNERS = [
  { key: 'body', label: 'Body size', min: 12, max: 18, initial: 14, unit: 'px' },
  { key: 'radius', label: 'Corner radius', min: 4, max: 20, initial: 10, unit: 'px' },
  { key: 'gutter', label: 'Content spacing', min: 12, max: 48, initial: 24, unit: 'px' },
  { key: 'depth', label: 'Reading shadow strength', min: 0, max: 100, initial: 40, unit: '%' },
  { key: 'motion', label: 'Motion sample duration', min: 110, max: 520, initial: 260, unit: 'ms' },
] as const;
export type Draft = Partial<Record<(typeof TUNERS)[number]['key'], number>>;
export function validDraft(value: unknown): value is Draft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, number]) => {
    const tuner = TUNERS.find(item => item.key === key);
    return tuner && typeof number === 'number' && Number.isFinite(number) && number >= tuner.min && number <= tuner.max;
  });
}
export function draftCSS(draft: Draft): string {
  const declarations: string[] = [];
  const adapters: string[] = [];
  if (draft.body !== undefined) declarations.push(`--ch-type-body: 400 ${draft.body}px/1.5 var(--ch-font-sans);`);
  if (draft.gutter !== undefined) declarations.push(`--ch-gutter: ${draft.gutter}px;`);
  if (draft.motion !== undefined) declarations.push(`--ch-play-duration: ${draft.motion}ms;`);
  if (draft.radius !== undefined) {
    declarations.push(`--ch-radius-md: ${draft.radius}px;`, `--ch-radius-lg: ${draft.radius + 4}px;`);
    adapters.push('border-radius: var(--ch-radius-lg);');
  }
  if (draft.depth !== undefined) {
    const alpha = (draft.depth / 1000).toFixed(3);
    declarations.push(`--ch-elevation-reading: 0 1px 2px rgb(28 25 18 / ${alpha}), 0 3px 8px -4px rgb(28 25 18 / ${alpha});`);
    // Surface currently owns literal material. Export this mapping explicitly,
    // rather than claiming changing a token already changes every component.
    adapters.push('box-shadow: var(--ch-elevation-reading);');
  }
  return [
    declarations.length ? `[data-ui="clubhouse"] {\n  ${declarations.join('\n  ')}\n}` : '',
    adapters.length ? `[data-ui="clubhouse"] .ch-surface:not(.ch-surface--flat) {\n  ${adapters.join('\n  ')}\n}` : '',
  ].filter(Boolean).join('\n\n');
}
export function exportCSS(draft: Draft) {
  return `/* Clubhouse design proposal — review before applying.\n   Scoped token overrides and explicit Surface mappings; no production changes. */\n\n${draftCSS(draft) || '/* No overrides selected. */'}\n`;
}
