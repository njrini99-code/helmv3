export const meta = {
  name: 'golfhelm-remediation-wave2-color',
  description: 'Consolidate the two greens: codemod legacy emerald-*/green-N onto the canonical primary-* brand scale, but ONLY where the green means "brand" — preserve deliberate data-viz accent greens. Classify-then-apply with adversarial verification.',
  phases: [
    { title: 'Survey', detail: 'enumerate every emerald-*/green-N occurrence by file' },
    { title: 'Apply', detail: 'per file-group: classify brand-vs-dataviz, swap brand greens only' },
    { title: 'Verify', detail: 'adversarially confirm no deliberate accent green was flattened' },
  ],
};

phase('Survey');
const survey = await agent(
  `In the GolfHelm web app (src/), find EVERY occurrence of legacy green Tailwind classes that should likely be the canonical brand scale: \`emerald-{50..900}\` and bare \`green-{50..900}\` (NOT \`primary-*\`, NOT \`accent-*\`, NOT semantic \`success/warning/destructive\`). Use grep. Group the results BY FILE. For each file note roughly how many occurrences and whether the file is a chart/data-visualization/sparkline file (where a distinct green may be intentional) vs ordinary UI chrome. Return a concise grouped inventory (file → count → chart? yes/no) and the total.`,
  { label: 'survey:greens', phase: 'Survey' },
);

// Partition files into batches for parallel, conflict-free editing. Ask the
// surveyor's inventory to drive batches, but cap fan-out; each agent owns a
// disjoint file list it derives by re-grepping its assigned directory subtree.
const BATCHES = [
  { key: 'ui-primitives', scope: 'src/components/ui/** and src/components/fairway/**' },
  { key: 'golf-coachhelm', scope: 'src/components/golf/coachhelm/**' },
  { key: 'golf-other', scope: 'src/components/golf/** EXCLUDING src/components/golf/coachhelm/**' },
  { key: 'baseball-and-app', scope: 'src/components/baseball/**, src/app/**, src/components/** not covered by the other batches' },
];

const CLASSIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['batch', 'swappedFiles', 'preservedDecisions', 'summary'],
  properties: {
    batch: { type: 'string' },
    swappedFiles: { type: 'array', items: { type: 'string' } },
    preservedDecisions: { type: 'array', items: { type: 'string' }, description: 'file:line where a green was KEPT (deliberate data-viz accent) + why' },
    summary: { type: 'string' },
  },
};

phase('Apply');
const results = await pipeline(
  BATCHES,
  (b) =>
    agent(
      `You are consolidating GolfHelm's two greens onto the canonical brand scale. SCOPE (your owned files): ${b.scope}.\n\n` +
      `Grep your scope for \`emerald-{N}\` and bare \`green-{N}\` Tailwind classes (text-/bg-/border-/ring-/from-/to-/via-/fill-/stroke- etc.). For EACH occurrence decide:\n` +
      `- BRAND green (page chrome, buttons, badges, icons, highlights, "positive/good" UI that should be the helm brand) → SWAP to the matching \`primary-{N}\` (emerald-500→primary-500, emerald-600→primary-600, green-600→primary-600, etc. Keep the same numeric step and the same utility prefix).\n` +
      `- DELIBERATE data-viz accent (a chart/sparkline/legend series color chosen to be DISTINCT from brand, or a multi-series palette where flattening would merge two series) → KEEP it, and record the decision.\n` +
      `When unsure on ordinary UI, prefer the SWAP (consistency is the goal). When unsure on a chart series, prefer to KEEP (don't merge series).\n` +
      `Apply the swaps by editing the files yourself. Do not run tsc/lint (global gate runs after). Stay strictly within your scope. Report swapped files + every preserved decision with file:line + reason.\n\n` +
      `SHARED SURVEY INVENTORY (for orientation):\n${survey}`,
      { label: `apply:${b.key}`, phase: 'Apply', agentType: 'general-purpose', schema: CLASSIFY_SCHEMA },
    ),
  (res, b) =>
    agent(
      `Adversarially verify this green-consolidation batch in GolfHelm (scope: ${b.scope}). Re-grep the scope: (1) confirm remaining emerald-*/green-N are ONLY the deliberately-preserved data-viz accents the implementer listed (no missed brand greens, no over-eager chart flattening), (2) confirm every swap kept the same numeric step + utility prefix and is valid, (3) confirm nothing outside scope was touched. Report ok + concrete issues with file:line.\n\nIMPLEMENTER REPORT:\n${JSON.stringify(res, null, 2)}`,
      { label: `verify:${b.key}`, phase: 'Verify', agentType: 'general-purpose', schema: { type: 'object', additionalProperties: false, required: ['batch', 'ok', 'issues'], properties: { batch: { type: 'string' }, ok: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' } } } } },
    ).then((v) => ({ batch: b.key, res, verify: v })),
);

return {
  swapped: results.flatMap((r) => r.res?.swappedFiles || []),
  preserved: results.flatMap((r) => r.res?.preservedDecisions || []),
  verify: results.map((r) => ({ batch: r.batch, ok: r.verify?.ok, issues: r.verify?.issues })),
};
