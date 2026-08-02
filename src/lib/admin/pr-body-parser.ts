/**
 * Deterministic parser for `.github/PULL_REQUEST_TEMPLATE.md` sections.
 * No LLM — summaries come from what the author already wrote in the PR.
 */

export type WorkArea =
  | 'golf'
  | 'baseball'
  | 'coachhelm'
  | 'bridge'
  | 'platform'
  | 'mobile'
  | 'shared'
  | 'unknown';

export interface ParsedPrBody {
  summary: string | null;
  partnerSummary: string | null;
  problem: string | null;
  fix: string | null;
  area: WorkArea;
  timelineNote: string | null;
  changeTypes: string[];
}

const AREA_ALIASES: Record<string, WorkArea> = {
  golf: 'golf',
  golfhelm: 'golf',
  baseball: 'baseball',
  baseballhelm: 'baseball',
  coachhelm: 'coachhelm',
  coach: 'coachhelm',
  bridge: 'bridge',
  admin: 'bridge',
  'mission-control': 'bridge',
  'helm bridge': 'bridge',
  platform: 'platform',
  ci: 'platform',
  tooling: 'platform',
  chore: 'platform',
  docs: 'platform',
  mobile: 'mobile',
  ios: 'mobile',
  capacitor: 'mobile',
  shared: 'shared',
  dashboard: 'shared',
  stats: 'shared',
  import: 'shared',
  auth: 'shared',
};

function stripHtmlComments(text: string): string {
  let result = text;
  let previous: string;
  // Loop until stable rather than a single pass: removing one comment pair
  // can expose a sequence that only becomes a matchable `<!--...-->` once
  // the markers around it are gone (the classic incomplete-multi-character-
  // sanitization failure mode for single-pass strips of nested/overlapping
  // comment-like input).
  do {
    previous = result;
    result = result.replace(/<!--[\s\S]*?-->/g, '');
  } while (result !== previous);
  // Defense-in-depth: an UNTERMINATED opener (`<!--` with no matching `-->`
  // anywhere after it in the input) is never matched by the pair-based regex
  // above and would otherwise survive verbatim into the parsed output —
  // strip any remaining bare markers outright so `<!--` can never survive.
  return result.replace(/<!--/g, '').replace(/-->/g, '');
}

function cleanSectionText(raw: string): string {
  return stripHtmlComments(raw)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('- [ ]') && !line.startsWith('- [x]'))
    .join('\n')
    .trim();
}

function extractSection(body: string, heading: string): string | null {
  const headingLine = `## ${heading}`;
  const lines = body.split('\n');
  const start = lines.findIndex((line) => line.trim() === headingLine);
  if (start === -1) return null;

  const content: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) break;
    content.push(line);
  }

  const cleaned = cleanSectionText(content.join('\n'));
  return cleaned.length > 0 ? cleaned : null;
}

function parseCheckedTypes(body: string): string[] {
  const headingLine = '## Type of change';
  const lines = body.split('\n');
  const start = lines.findIndex((line) => line.trim() === headingLine);
  if (start === -1) return [];

  const checked: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) break;
    const match = trimmed.match(/^- \[[xX]\]\s+(.+)$/);
    if (match?.[1]) checked.push(match[1].trim());
  }
  return checked;
}

function normalizeWorkAreaToken(raw: string | null | undefined): WorkArea {
  if (!raw) return 'unknown';
  const token = raw.toLowerCase().replace(/[`·]/g, ' ').trim();
  for (const part of token.split(/[\s,/]+/)) {
    const normalized = part.replace(/[^a-z-]/g, '');
    const hit = AREA_ALIASES[normalized as keyof typeof AREA_ALIASES];
    if (hit) return hit;
  }
  const dashed = token.replace(/\s+/g, '-');
  const dashedHit = AREA_ALIASES[dashed as keyof typeof AREA_ALIASES];
  if (dashedHit) return dashedHit;
  return 'unknown';
}

export function inferWorkAreaFromTitle(title: string): WorkArea {
  const lower = title.toLowerCase();
  if (/\b(baseball|pipeline|roster|box.?score)\b/.test(lower)) return 'baseball';
  if (/\b(golf|fairway|qualifier|round)\b/.test(lower)) return 'golf';
  if (/\b(coachhelm|insight|pattern)\b/.test(lower)) return 'coachhelm';
  if (/\b(admin|bridge|mission.?control|sentry|vercel)\b/.test(lower)) return 'bridge';
  if (/\b(ci|chore|deps|lint|tooling|docs)\b/.test(lower)) return 'platform';
  if (/\b(ios|capacitor|mobile)\b/.test(lower)) return 'mobile';
  return 'unknown';
}

function splitPartnerSummary(text: string): { problem: string | null; fix: string | null } {
  const splitters = [
    /what changed[?:]?\s*/i,
    /what was fixed[?:]?\s*/i,
    /the fix[?:]?\s*/i,
    /why it matters[?:]?\s*/i,
  ];

  for (const splitter of splitters) {
    const match = text.match(splitter);
    if (!match || match.index == null) continue;
    const problem = text.slice(0, match.index).replace(/what was broken[^?]*\??/i, '').trim();
    const fix = text.slice(match.index + match[0].length).trim();
    return {
      problem: problem || null,
      fix: fix || null,
    };
  }

  return { problem: text, fix: null };
}

export function parsePullRequestBody(body: string | null | undefined, title: string): ParsedPrBody {
  const normalizedBody = stripHtmlComments(body ?? '');
  const summary = extractSection(normalizedBody, 'Summary');
  const partnerSummary = extractSection(normalizedBody, 'Partner-readable summary');
  const areaRaw = extractSection(normalizedBody, 'Area');
  const timelineNote = extractSection(normalizedBody, 'Git Activity Timeline note');
  const changeTypes = parseCheckedTypes(normalizedBody);

  const areaFromBody = normalizeWorkAreaToken(areaRaw?.split(/\s+/)[0] ?? areaRaw);
  const area = areaFromBody === 'unknown' ? inferWorkAreaFromTitle(title) : areaFromBody;

  const partnerParts = partnerSummary ? splitPartnerSummary(partnerSummary) : { problem: null, fix: null };

  const problem = partnerParts.problem ?? summary ?? null;

  const fix =
    partnerParts.fix ??
    timelineNote ??
    (partnerParts.problem && summary ? summary : null);

  return {
    summary,
    partnerSummary,
    problem,
    fix,
    area,
    timelineNote,
    changeTypes,
  };
}
