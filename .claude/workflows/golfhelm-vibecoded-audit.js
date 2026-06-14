export const meta = {
  name: 'golfhelm-vibecoded-audit',
  description: 'Audit GolfHelm for vibe-coded inconsistencies across 16 craft dimensions (grounded in the user-supplied research), verify findings adversarially, synthesize a prioritized remediation report.',
  phases: [
    { title: 'Survey', detail: 'map tokens, components, surfaces, a11y/perf config' },
    { title: 'Audit', detail: 'one agent per craft dimension finds real violations' },
    { title: 'Verify', detail: 'adversarially confirm high/critical findings with file:line' },
    { title: 'Synthesize', detail: 'prioritized report + per-dimension scorecard' },
  ],
};

// ── Rubric (synthesized verbatim from the two research PDFs) ──────────────────
// Each dimension carries: pass criteria, the vibe-coded "signature", the typical
// fix, and where to look. Severities follow the PDFs' remediation priority.
const DIMENSIONS = [
  {
    key: 'tokens', title: 'Visual system coherence / design tokens', sev: 'medium',
    pass: '>90% of color, type, spacing, radius, elevation come from tokens; ≤3-4 radius tiers; a tightly bounded neutral palette; one recognizable visual grammar across screens.',
    smell: 'One-off hex/oklch codes, random shadows, inconsistent radii, per-screen styling, arbitrary Tailwind values like bg-[#...], rounded-[...], shadow-[...], text-[NNpx].',
    fix: 'Replace hardcoded values with token aliases; collapse radius/shadow tiers; add a lint/design-review gate.',
    where: 'src/app/globals.css, src/styles/tokens.css, src/styles/design-tokens.css, tailwind.config.ts, then arbitrary-value usage across src/components/**.',
  },
  {
    key: 'hierarchy', title: 'Layout & visual hierarchy', sev: 'high',
    pass: 'Users can tell what matters first; 2-3 dominant hierarchy levels per screen; ≤3 headline/body scale tiers in one view.',
    smell: 'Everything looks equally loud; "card soup"; hero areas compete with utility controls; no clear primary action.',
    fix: 'Establish clear scale/balance; demote utility chrome; one primary action per screen.',
    where: 'Main player + coach surfaces in src/components/fairway/pages/** and src/app/golf/(dashboard)/**.',
  },
  {
    key: 'cards', title: 'Card styles & containment', sev: 'critical',
    pass: '≤3 card archetypes per product area; 100% of cards map to a named role (summary, content, setting, selection, alert); distinct surface roles (background, grouped list, raised card, modal, sheet).',
    smell: 'Every block is a rounded card with soft shadow+gradient and no elevation logic; "Pinterest board" dashboards; ad hoc padding/border/action placement per card.',
    fix: 'Reduce surface types to a small documented set; create card subcomponents + usage docs; remove decorative wrappers.',
    where: 'Card/Surface/Panel components in src/components/**; dashboards in src/components/fairway/pages/**.',
  },
  {
    key: 'typography', title: 'Typography', sev: 'high',
    pass: 'Small, reused type ramp (≤ a compact scale); strong title/body/meta contrast; no text below ~11px on mobile; legible under zoom / larger text.',
    smell: 'Too many font sizes/weights, thin weights at small sizes, weak hierarchy, decorative body text, custom fonts that break scaling.',
    fix: 'Reduce role count; thicken low-contrast weights; align to a documented scale; support text resizing.',
    where: 'Type tokens in styles/*.css + tailwind.config.ts; text-[..] arbitrary sizes and font-weight usage across components.',
  },
  {
    key: 'color', title: 'Color & semantic roles', sev: 'high',
    pass: 'Color encodes semantics/brand not randomness; 4.5:1 text contrast, 3:1 non-text/UI contrast; semantic roles (action, caution, success, text, surface, border); dark-mode parity.',
    smell: 'Saturated accent colors everywhere; gradients used as hierarchy; "success" green that changes by screen; dark-mode = simple inversion; illegible overlays.',
    fix: 'Map every color to a semantic role; delete colors that do not correspond to meaning/brand; rebuild contrast-failing states.',
    where: 'Color tokens in styles/*.css; gradient + text-white/X opacity usage; status/severity colors across coachhelm + stats components.',
  },
  {
    key: 'loading', title: 'Loading states', sev: 'critical',
    pass: 'Every async surface has initial/in-flight/slow/success/empty/error; skeletons match final layout; determinate progress for ≥3s waits; no blank panels; no "No records" during load; no post-load content jump.',
    smell: 'Blank canvas + centered spinner for everything; "No records" shown while loading; content jumps post-load.',
    fix: 'Introduce a state machine; match skeleton geometry to final layout; reserve layout to prevent shift.',
    where: 'loading.tsx files, Suspense/skeleton components, useEffect data fetches, isLoading branches across src/app/golf/** + src/components/**.',
  },
  {
    key: 'microinteractions', title: 'Microinteractions & interactive states', sev: 'high',
    pass: 'Visible response within ~100ms; pressed/hover/focus/selected/disabled/loading states defined for Button/Card/Input/Row/Tab/Sheet/Toast/Dialog; duplicate submits debounced/disabled.',
    smell: 'Tap feels dead; missing or inconsistent states; hover-only affordances on touch UIs; double-submit confusion.',
    fix: 'Add optimistic UI for safe actions; debounce/disable duplicates; standardize pressed/selected states; build a state matrix per primitive.',
    where: 'Button/Input/Tab/Toast/Dialog primitives; onClick handlers lacking disabled/pending; forms.',
  },
  {
    key: 'motion', title: 'Motion', sev: 'high',
    pass: 'A small reusable motion-token set; ~80%+ of transitions use it; motion explains continuity/status/affordance; reduced-motion respected everywhere.',
    smell: 'Every action scales/fades/bounces/springs; decorative floating objects; long easing chains; differing motion language per screen; no reduced-motion fallback.',
    fix: 'Replace bespoke animation chains with motion tokens; reduce amplitude/duration; disable large transforms in reduced-motion.',
    where: 'framer-motion usage, transition-/animate- classes, motion tokens (--fw-dur-*, --motion-*), prefers-reduced-motion handling.',
  },
  {
    key: 'empty', title: 'Empty states', sev: 'high',
    pass: '100% of first-use/no-result states include status + what belongs here + one primary next action.',
    smell: 'Blank tables, "No records" ambiguity, cutesy illustration with no action.',
    fix: 'For each empty state give one primary next step + one sentence explaining what appears here later.',
    where: 'Empty/no-data branches across lists (roster, rounds, messages, tasks, qualifiers, insights).',
  },
  {
    key: 'errors', title: 'Error states', sev: 'critical',
    pass: '100% of detectable errors identify the item + describe the issue in text; faults are visible, specific, proximal, recoverable; critical failures persist until noticed.',
    smell: 'Generic "something went wrong"; disappearing toasts for important failures; blameful copy; error codes.',
    fix: 'Replace generic banners/toasts with inline/persistent treatment anchored to the field; add retry/learn-more/support paths.',
    where: 'catch blocks, toast.error / showToast usage, form validation, error.tsx boundaries.',
  },
  {
    key: 'tone', title: 'Content tone & microcopy', sev: 'medium',
    pass: 'One product voice tuned to task; CTAs = one verb + object; key strings consistent across screens.',
    smell: 'GPT-generic phrasing; tone shifts by screen; robotic labels; over-explained CTAs; inconsistent terminology.',
    fix: 'Establish voice principles; refactor every CTA to one verb + one object; align terminology.',
    where: 'Button labels, headings, toast/empty/error copy, onboarding strings across components.',
  },
  {
    key: 'accessibility', title: 'Accessibility', sev: 'critical',
    pass: 'Targets ≥44px touch / WCAG 2.2 24px min; visible focus never obscured by sticky bars; icons labeled (no mystery-meat); aria-live for async updates; text scaling no clipping; RTL correct; reduced-motion honored.',
    smell: 'Tiny icon buttons, hidden focus behind sticky headers, unlabeled icon-only controls, inaccessible toasts, no live regions.',
    fix: 'Add labels/semantics; fix focus traps/obscured focus; add status/alert regions; ensure target sizes.',
    where: 'icon-only buttons (aria-label missing), focus-visible styles, role=status/alert, sticky/fixed headers, jsx-a11y patterns.',
  },
  {
    key: 'performance', title: 'Performance & responsiveness', sev: 'high',
    pass: 'LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 (p75); lazy loading; image/icon dimension reservation; no jank; tiered/code-split heavy routes.',
    smell: 'Janky scroll, layout shift, late icon pop-in, blank startup; unbounded client fetches; missing width/height on media; huge client bundles.',
    fix: 'Add budgets, lazy loading, code splitting, dimension reservation; pre-render above the fold.',
    where: 'next/image usage + sizes, dynamic import usage, large client components, unpaginated fetches (PostgREST 1000-row cap), image dimensions.',
  },
  {
    key: 'craftsmanship', title: 'State completeness / craftsmanship (edge branches)', sev: 'high',
    pass: 'Scenario coverage for all core journeys; state completeness for 100% of recoverable branches (offline, retry, undo, conflict, permission-denied, interrupted onboarding); no unfinished edges.',
    smell: 'Polished happy path, neglected edge cases; missing offline/retry; placeholder-feeling branches.',
    fix: 'Create a scenario map; add acceptance criteria per state branch before release.',
    where: 'offline/retry handling, permission gates, conflict handling in save/submit/sync paths, interrupted flows.',
  },
  {
    key: 'onboarding', title: 'Onboarding & first-run', sev: 'medium',
    pass: 'First-use gets users to value quickly; contextual help + progressive disclosure; permissions asked at point of need.',
    smell: 'Tutorial carousel before value; three generic value-prop screens then empty product; permissions front-loaded.',
    fix: 'Remove nonessential intro screens; move explanations into context; ask permissions at point of need.',
    where: 'src/app/golf/(onboarding)/**, first-run/empty-first states, permission prompts.',
  },
  {
    key: 'platform', title: 'Platform fidelity (web/iOS via Capacitor)', sev: 'medium',
    pass: 'Navigation, typography, icons, touch targets, and affordances are appropriate per platform; does not feel like generic stretched-mobile web.',
    smell: 'Same nav pattern everywhere; too many top-level destinations; mystery-meat icons; desktop = stretched mobile.',
    fix: 'Review each top-level flow per device class; remove nav patterns that exist only because they were easy.',
    where: 'navigation/tab-bar components, responsive breakpoints, Capacitor-specific handling, top-level route count.',
  },
  {
    key: 'repo', title: 'Repo hygiene & AI-generation artifacts', sev: 'high',
    pass: 'No near-duplicate components, dead files/unused exports, unused deps, inconsistent naming, generic stub comments/TODOs; AI instruction files (.claude, AGENTS.md, copilot) deliberately scoped; no hardcoded secrets/test keys; no giant unverified UI diffs.',
    smell: 'Add-copy-tweak near-duplicate components; "just in case" helpers; orphaned files; "implement later" stubs; leaked instruction files; hardcoded tokens.',
    fix: 'Fold duplicates into shared primitives; delete dead code aggressively; remove unused deps; scope instruction files; rotate any secret found.',
    where: 'Duplicated component logic (similar Card/Stat/Header variants), TODO/FIXME/HACK comments, console.log, hardcoded keys/tokens, *.bak / unused files, .claude/AGENTS.md exposure.',
  },
];

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dimension', 'pass', 'findings'],
  properties: {
    dimension: { type: 'string' },
    pass: { type: 'boolean', description: 'true if the codebase broadly meets this dimension\'s pass criterion' },
    summary: { type: 'string', description: 'one-paragraph verdict for this dimension' },
    findings: {
      type: 'array',
      maxItems: 14,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'severity', 'evidence', 'fix'],
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          locations: { type: 'array', items: { type: 'string' }, description: 'file:line citations' },
          evidence: { type: 'string', description: 'concrete observed code/pattern proving the finding' },
          fix: { type: 'string', description: 'specific remediation' },
        },
      },
    },
  },
};

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dimension', 'verified'],
  properties: {
    dimension: { type: 'string' },
    verified: {
      type: 'array',
      description: 'only findings confirmed real after re-checking the cited code',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'severity', 'real', 'locations', 'note'],
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          real: { type: 'boolean' },
          locations: { type: 'array', items: { type: 'string' } },
          note: { type: 'string', description: 'why confirmed/rejected; correct the severity if the auditor over/under-rated it' },
          fix: { type: 'string' },
        },
      },
    },
  },
};

// ── Phase 1: Survey (barrier — every dimension agent needs the token map) ─────
phase('Survey');
const SURVEYS = [
  ['tokens', 'Inventory the design-token system. Read src/app/globals.css, src/styles/tokens.css, src/styles/design-tokens.css, and tailwind.config.ts. List the canonical color tokens (incl. the helm-green/primary scale), radius tiers, shadow tiers, spacing scale, and motion tokens. Then COUNT arbitrary Tailwind values in src/components/** (grep for bg-[, text-[, rounded-[, shadow-[, and raw hex/oklch). Report the token vocabulary + a drift estimate (how many arbitrary/one-off values exist and example file:line).'],
  ['components', 'Inventory UI primitives & card archetypes. Find all Card/Surface/Panel/Stat/Tile/Badge/Chip/Button/Input components under src/components/**. List the distinct card-like components and whether near-duplicates exist. Identify how many "card archetypes" are actually in use.'],
  ['surfaces', 'List the main PLAYER and COACH surfaces (pages) under src/app/golf/(dashboard)/** and src/components/fairway/pages/**. For the top ~12 surfaces note whether a loading.tsx / skeleton, empty state, and error boundary exist nearby.'],
  ['a11yperf', 'Survey a11y + perf signals: count icon-only buttons missing aria-label, presence of focus-visible styles, role="status"/role="alert"/aria-live usage, prefers-reduced-motion handling, next/image usage vs raw <img>, and dynamic import / code-splitting usage. Give counts + representative file:line.'],
];
const survey = await parallel(
  SURVEYS.map(([k, p]) => () =>
    agent(`You are surveying the GolfHelm web app codebase (Next.js App Router + Tailwind, source under src/). ${p}\n\nUse Grep/Glob/Read. Be concrete with file:line. Return a tight structured text summary (<= 400 words).`,
      { label: `survey:${k}`, phase: 'Survey' })),
);
const surveyContext = SURVEYS.map(([k], i) => `### ${k}\n${survey[i] || '(no result)'}`).join('\n\n');

// ── Phase 2+3: Audit each dimension, then adversarially verify (pipeline) ─────
const results = await pipeline(
  DIMENSIONS,
  (d) =>
    agent(
      `You are a senior product engineer + design-systems auditor reviewing the GolfHelm web app (Next.js + Tailwind, source under src/) for "vibe-coded" inconsistencies.\n\n` +
      `AUDIT DIMENSION: ${d.title}\n` +
      `PASS CRITERION: ${d.pass}\n` +
      `VIBE-CODED SIGNATURE (what to hunt for): ${d.smell}\n` +
      `TYPICAL FIX: ${d.fix}\n` +
      `WHERE TO LOOK: ${d.where}\n\n` +
      `SHARED SURVEY CONTEXT (from the survey phase):\n${surveyContext}\n\n` +
      `Use Grep/Glob/Read to find REAL, specific violations in the actual code. Cite file:line for each. Do NOT invent or speculate — every finding must be backed by observed code. Rank by severity. Decide pass/fail for the dimension against the pass criterion. Return up to 14 findings, highest severity first.`,
      { label: `audit:${d.key}`, phase: 'Audit', schema: FINDINGS_SCHEMA },
    ),
  (audit, d) => {
    if (!audit || !audit.findings || audit.findings.length === 0) {
      return { dimension: d.title, key: d.key, pass: audit ? audit.pass : true, summary: audit ? audit.summary : '', verified: [] };
    }
    const top = audit.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').slice(0, 10);
    if (top.length === 0) {
      return { dimension: d.title, key: d.key, pass: audit.pass, summary: audit.summary, verified: audit.findings };
    }
    return agent(
      `You are an adversarial verifier. Another auditor flagged these ${d.title} findings in the GolfHelm codebase (src/). Re-open the cited files and CONFIRM or REJECT each one. Default to rejecting anything you cannot reproduce from the actual code. Correct any mis-rated severity. Only return findings you can stand behind with file:line evidence.\n\nFINDINGS TO VERIFY:\n${JSON.stringify(top, null, 2)}`,
      { label: `verify:${d.key}`, phase: 'Verify', schema: VERIFY_SCHEMA },
    ).then((v) => ({
      dimension: d.title, key: d.key, pass: audit.pass, summary: audit.summary,
      verified: ((v && v.verified) || []).filter((x) => x.real),
      // keep medium/low audit findings (not verified, but recorded) for the report
      unverified_minor: audit.findings.filter((f) => f.severity === 'medium' || f.severity === 'low'),
    }));
  },
);

// ── Phase 4: Synthesize prioritized report ────────────────────────────────────
phase('Synthesize');
const clean = results.filter(Boolean);
const report = await agent(
  `You are the lead author of a product-craft audit report for the GolfHelm web app (Next.js + Tailwind). ` +
  `Below is per-dimension audit data: a pass/fail verdict, a summary, VERIFIED critical/high findings (adversarially confirmed, with file:line), and minor (medium/low) findings.\n\n` +
  `Write a comprehensive, skimmable Markdown report titled "GolfHelm Vibe-Coded Craft Audit". Include:\n` +
  `1. An executive summary with an overall read and the top 8 highest-leverage fixes.\n` +
  `2. A scorecard table: one row per dimension with PASS/FAIL and the count of verified critical/high findings.\n` +
  `3. Findings grouped and ORDERED by the research's remediation priority: (1) Accessibility & correctness, (2) State coverage (loading/empty/error/edge), (3) Performance, (4) Tokens/visual-system & component consolidation, (5) Typography/color/cards/hierarchy, (6) Content tone, (7) Motion/microinteractions/platform, (8) Repo hygiene & AI artifacts. ` +
  `Under each, list the verified findings as: **[SEVERITY] Title** — evidence — file:line — Fix. Preserve file:line citations exactly.\n` +
  `4. A "Quick wins" section (low-effort/high-impact) and a phased 90-day-style remediation roadmap.\n` +
  `Be precise and honest; do not inflate. If a dimension passed, say so briefly. Output ONLY the Markdown (no preamble).\n\n` +
  `PER-DIMENSION DATA:\n${JSON.stringify(clean, null, 2)}`,
  { label: 'synthesize:report', phase: 'Synthesize' },
);

return {
  report,
  scorecard: clean.map((r) => ({
    dimension: r.dimension,
    pass: r.pass,
    verified_high_critical: (r.verified || []).length,
    minor: (r.unverified_minor || []).length,
  })),
};
