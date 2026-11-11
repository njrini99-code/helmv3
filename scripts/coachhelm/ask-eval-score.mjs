/**
 * The pure half of scripts/coachhelm/ask-eval.mjs: reading the answer stream (the chat's wire protocol), scoring an answer
 * against the facts a question expects, and the golf-sense and writing columns. No network, no database. Tested in scripts/coachhelm/__tests__/ask-eval-score.test.ts.
 */

export const dateRe = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const mon = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][m - 1];
  const full = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'][m - 1];
  return new RegExp(`\\b(?:${mon}[a-z]*\\.?\\s+0?${d}\\b|0?${m}/0?${d}\\b|${y}-0?${m}-0?${d}\\b|0?${d}\\s+${full}|0?${d}\\s+${mon}\\b)`, 'i');
};

const NUM = /[-\u2212\u2013]?\d+(?:,\d{3})*(?:\.\d+)?/g;
const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
export function numbersIn(text) {
  const clean = text.replace(/[*_`]/g, '');
  const out = [];
  for (const m of clean.matchAll(NUM)) {
    const raw = m[0].replace(/[\u2212\u2013]/g, '-').replace(/,/g, '');
    out.push({ value: Number(raw), decimals: (raw.split('.')[1] ?? '').length });
  }
  for (const m of clean.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi)) out.push({ value: words[m[1].toLowerCase()], decimals: 0 });
  return out;
}
export const close = (a, v, tol, decimals) => {
  for (const x of [a, -a]) {
    if (Math.abs(x - v) <= tol) return true;
    if (Number.isInteger(decimals) && Math.abs(Math.round(v * 10 ** decimals) / 10 ** decimals - x) < 1e-9) return true;
  }
  return false;
};

export function score(question, text) {
  const nums = numbersIn(text);
  const lower = text.toLowerCase();
  const results = [];
  for (const f of question.facts) {
    const targets = f.anyOf ?? [f.value ?? f.iso];
    let status = 'missing';
    let detail = '';
    if (f.kind === 'number') {
      const tol = f.tol ?? 0.005;
      const hit = nums.some((n) => targets.some((v) => close(n.value, v, tol, n.decimals)));
      status = hit ? 'correct' : 'missing';
      if (f.claim) {
        const m = f.claim.exec(text.replace(/[*_`]/g, ''));
        if (m?.[1] != null) {
          const stated = Number(String(m[1]).replace(/,/g, '')) || words[String(m[1]).toLowerCase()];
          if (Number.isFinite(stated) && !targets.some((v) => close(stated, v, tol, (String(m[1]).split('.')[1] ?? '').length))) {
            status = 'wrong';
            detail = `says ${m[1]}`;
          }
        }
      }
    } else if (f.kind === 'text') {
      status = targets.some((t) => lower.includes(String(t).toLowerCase())) ? 'correct' : 'missing';
    } else if (f.kind === 'date') {
      status = dateRe(f.iso).test(text) ? 'correct' : 'missing';
    } else if (f.kind === 'phrase') {
      status = f.re.test(text) ? 'correct' : 'missing';
    }
    results.push({ label: f.label, optional: Boolean(f.optional), status, detail });
  }
  for (const f of question.forbid ?? []) {
    if (f.re.test(text)) results.push({ label: f.label, optional: false, status: 'wrong', detail: 'forbidden statement present' });
  }
  const required = results.filter((r) => !r.optional);
  return {
    results,
    correct: results.filter((r) => r.status === 'correct').length,
    wrong: results.filter((r) => r.status === 'wrong').length,
    missing: required.filter((r) => r.status === 'missing').length,
    allRight: required.every((r) => r.status === 'correct') && !results.some((r) => r.status === 'wrong'),
  };
}


/**
 * What one turn's answer stream has said so far. The stream is the chat's wire protocol (`ChatEvent` in
 * src/lib/coachhelm/v3/chat/engine/protocol.ts): server-sent events, one JSON object per `data:` frame.
 * `tools` is every read the turn ran, by name, once each: the ones the model asked for itself and the ones its code called
 * (`code_execution` is the code step itself). The protocol does not carry a read's input, so `toolCalls[].input` is null.
 */
export const newTurnState = () => ({ texts: [], dropped: [], tokens: null, open: false, conversationId: null, status: null, durationMs: null, declined: false, error: null, errorKind: null, evidence: 0, tools: [], evidenceParts: [], toolCalls: [], failedReads: [], cards: 0 });

/** The words of the answer, without the read markers the engine appends to a sentence (" [e3]"): a marker's digit is not a figure. */
export const answerText = (state) => state.texts.join('').replace(/[ \t]?\[e\d+\]/g, '');

/** Feed it the response body as it arrives; it returns the events each chunk completes. A torn last frame is never returned. */
export function eventReader() {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    const events = [];
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end === -1) return events;
      const data = buffer.slice(0, end).split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
      buffer = buffer.slice(end + 2);
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed.type === 'string') events.push(parsed);
      } catch {
        /* not one of ours (a proxy's comment line) */
      }
    }
  };
}

/** Fold one event into the state, the way the app's own reducer does (`applyChatEvent`): a discard drops the text since the last non-text part. */
export function applyEvent(state, ev) {
  const sawTool = (name) => {
    if (!name) return;
    if (!state.tools.includes(name)) state.tools.push(name);
  };
  if (ev.type === 'text_delta') {
    if (!ev.delta) return state;
    if (state.open) state.texts[state.texts.length - 1] += ev.delta;
    else state.texts.push(ev.delta);
    state.open = true;
    return state;
  }
  if (ev.type === 'text_discard') {
    if (state.open) state.texts.pop();
    state.open = false;
    return state;
  }
  if (ev.type === 'message_start') state.conversationId = ev.conversation_id ?? state.conversationId;
  else if (ev.type === 'usage') {
    // The request features the turn gave up because the API rejected them (`features_dropped`); nothing on a turn that ran as configured.
    if (Array.isArray(ev.features_dropped)) state.dropped = ev.features_dropped.filter((g) => typeof g === 'string');
    // The turn's tokens as the server counted them: every prompt token of its calls, and the parts read from and written to the cache.
    state.tokens = { prompt: Number(ev.input_tokens ?? 0), cacheRead: Number(ev.cache_read_input_tokens ?? 0), cacheWrite: Number(ev.cache_creation_input_tokens ?? 0), output: Number(ev.output_tokens ?? 0) };
    return state;
  } else if (ev.type === 'phase') return state;
  else if (ev.type === 'done') {
    state.status = ev.status ?? null;
    state.durationMs = ev.duration_ms ?? null;
  } else if (ev.type === 'error') {
    state.error = ev.message ?? 'stream error';
    state.errorKind = ev.kind ?? null;
  } else {
    // Everything else adds a part beside the text, so the next words start a new text part.
    state.open = false;
    if (ev.type === 'read_started') {
      sawTool(ev.tool);
      state.toolCalls.push({ name: ev.tool, input: null });
    } else if (ev.type === 'read_finished' && ev.state === 'failed') state.failedReads.push(ev.tool);
    else if (ev.type === 'evidence') {
      state.evidence += 1;
      const data = ev.part?.data ?? {};
      sawTool(data.tool);
      if (data.envelope) state.evidenceParts.push({ tool: data.tool ?? null, ref: data.ref ?? null, envelope: data.envelope, ...(data.via ? { via: data.via } : {}) });
    } else if (ev.type === 'decision_needed') {
      sawTool(ev.tool);
      state.cards += 1;
    } else if (ev.type === 'part' && ev.part?.type === 'data-turn-meta') state.declined = ev.part.data?.declined === true;
  }
  return state;
}

/**
 * How the turn ended, in the engine's own words. Nothing is withheld any more, so there is no "rejected": an answer whose
 * figures did not all match its reads is still `complete`, and the ledger's `verified` says so beside it.
 *   complete   the turn finished                      card       it stopped at a card waiting for Confirm
 *   declined   the model would not answer (a complete turn whose words are the app's sentence; its `data-turn-meta` says so)
 *   failed     the turn failed and said so            stopped    it was cancelled
 *   incomplete the stream ended without saying how
 *   degraded   it answered (or reached a card), but only after the API rejected a request and a feature was given up
 *              (`features_dropped` on the `usage` event). It did not run as configured, so it is never counted as complete.
 */
export function verdictOf(state) {
  if (state.status === 'failed' || state.error) return 'failed';
  if (state.declined) return 'declined';
  if ((state.status === 'complete' || state.status === 'awaiting_decision') && state.dropped?.length > 0) return 'degraded';
  if (state.status === 'complete') return 'complete';
  if (state.status === 'awaiting_decision') return 'card';
  if (state.status === 'stopped') return 'stopped';
  return 'incomplete';
}

// ------------------------- the golf-sense questions (src/lib/coachhelm/v3/chat/knowledge/eval) -------------------------

const PLACEHOLDER = /\{(player|player2|new_player|no_shots_player|teammate)\}/g;
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** First names that are also everyday words: lower-case, they are not a name written wrongly. The same list as `knowledge/eval/index.ts`. */
export const EVERYDAY_WORDS = new Set(['will', 'grant', 'chase', 'hunter', 'mark', 'bill', 'drew', 'rich', 'may', 'rose', 'lane', 'reed', 'art', 'dean', 'miles', 'chance', 'ace', 'bo', 'sky', 'jay', 'pat', 'sandy', 'summer', 'hope', 'faith', 'grace', 'joy']);
// The same source as `knowledge/eval/index.ts`, which ships in app source and so writes "not after a letter" without a lookbehind.
const miscasedSource = (stored) =>
  `(?:^|[^A-Za-z])(?!${escapeRe(stored)}(?![A-Za-z]))${[...stored].map((ch) => (/[A-Za-z]/.test(ch) ? `[${ch.toLowerCase()}${ch.toUpperCase()}]` : escapeRe(ch))).join('')}(?![A-Za-z])`;
function properNounSource(names, everyday) {
  const whole = [...(names.people ?? []), ...(names.places ?? [])].map((n) => n.trim()).filter((n) => /[A-Za-z]{2}/.test(n));
  const parts = (names.people ?? []).flatMap((n) => n.trim().split(/\s+/)).filter((w) => w.length >= 3 && /^[A-Z]/.test(w) && !everyday.has(w.toLowerCase()));
  const all = [...new Set([...whole, ...parts])];
  return all.length ? all.map(miscasedSource).join('|') : null;
}

/** Sentences in an answer, counted the way `style.max_sentences` means it: a list line counts as one. */
export const sentenceCount = (answer) =>
  answer
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z"“])/))
    .filter((part) => /[A-Za-z]/.test(part)).length;

/**
 * The questions of `golf-sense.json`, compiled into this harness's shape. `data` is the parsed file. `names` fills the placeholders
 * (a question whose placeholder has no name comes back with `unfilled`, and is not asked); `stored` is the team's own proper names
 * (`people`: the roster; `places`: courses and events), which join the proper-noun rule. A plain-JavaScript copy of
 * `golfSenseQuestions` in `knowledge/eval/index.ts`, which a .mjs script cannot import; scripts/coachhelm/__tests__ holds the two
 * to the same output. Each question's own guards are `forbid`; the writing rules every answer is held to are `writing`.
 */
export function golfSenseQuestions(data, names = {}, stored = {}, everyday = EVERYDAY_WORDS) {
  const proper = properNounSource(stored, everyday);
  const fill = (text) => text.replace(PLACEHOLDER, (whole, key) => names[key] ?? whole);
  const compile = (label, pattern, id) => {
    const p = data.patterns[pattern];
    if (!p) throw new Error(`eval question ${id} names an unknown pattern: ${pattern}`);
    const source = p.re.replace(PLACEHOLDER, (whole, key) => (names[key] ? escapeRe(names[key]) : whole));
    return { label, pattern, re: new RegExp(pattern === 'proper_noun_case' && proper ? `${source}|${proper}` : source, p.flags) };
  };
  return data.questions.map((q) => ({
    id: q.id,
    category: `golf sense: ${q.area}`,
    viewer: q.viewer,
    ask: fill(q.ask),
    unfilled: [...new Set([...q.ask.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((key) => !names[key]))],
    readers: [...q.readers],
    facts: q.facts.map((f) => ({ label: f.label, kind: 'phrase', re: new RegExp(f.re, f.flags) })),
    forbid: q.forbid.map((f) => compile(f.label, f.pattern, q.id)),
    writing: data.global_forbid.filter((name) => !q.forbid.some((f) => f.pattern === name)).map((name) => compile(data.patterns[name]?.why ?? name, name, q.id)),
    note: q.note,
    ...(q.style ? { style: q.style } : {}),
    golfSense: true,
  }));
}

/** The writing rules alone, for a question that is not from the file (the data questions): every answer is held to them. */
export const writingRules = (data, stored = {}) => golfSenseQuestions({ ...data, questions: [{ id: 'writing', area: '', viewer: 'coach', ask: '', readers: [], facts: [], forbid: [], note: '' }] }, {}, stored)[0].writing;

/**
 * The two columns a golf-sense answer is scored on, and the reads it used against the reads it should have.
 *   golf sense  every fact matches and none of the question's own guards does. A Tour figure is not "from memory" when the turn
 *               read the reference (`get_reference`), so that guard is skipped then.
 *   writing     none of the writing rules matches, and the answer is no longer than `style.max_sentences` where the question has one.
 *   reads       any one of `readers` was used; an empty list means no read of team data is needed.
 */
export function scoreSense(question, text, tools, rules = question.writing ?? []) {
  const missing = (question.facts ?? []).filter((f) => f.kind === 'phrase' && !f.re.test(text)).map((f) => f.label);
  const said = (question.forbid ?? []).filter((f) => f.re.test(text) && !(f.pattern === 'tour_figure_from_memory' && tools.includes('get_reference'))).map((f) => f.label);
  const broken = rules.filter((f) => f.re.test(text)).map((f) => f.pattern);
  const sentences = sentenceCount(text);
  if (question.style?.max_sentences && sentences > question.style.max_sentences) broken.push(`longer than ${question.style.max_sentences} sentences (${sentences})`);
  const expected = question.readers ?? [];
  return {
    sense: { pass: missing.length === 0 && said.length === 0, missing, said },
    writing: { pass: broken.length === 0, broken },
    reads: { pass: expected.length === 0 || expected.some((name) => tools.includes(name)), expected, used: tools.filter((name) => name !== 'code_execution') },
  };
}

/**
 * A finished turn in the replay suite's fixture shape (src/lib/coachhelm/v3/chat/__tests__/fixtures), so a captured turn, a player's above all
 * (player answers are not stored until HM3), can be committed as a fixture. `surface: 'player'` replays through the player's audit.
 * The model's cites block is withheld from the stream, so a captured turn has none.
 */
export function captureFixture({ id, surface, team, timezone, roster, ask, askedAt, answeredAt, text, state, verdict, flagged, cost, base, cites }) {
  return {
    id,
    messageId: `captured-${id}`,
    ...(surface === 'player' ? { surface: 'player' } : {}),
    source: { project: 'staging', team, exportedBy: 'scripts/coachhelm/ask-eval.mjs --capture-dir', server: base },
    timezone,
    roster,
    userMessage: { content: ask, createdAt: askedAt },
    priorMessages: [],
    turn: {
      createdAt: answeredAt,
      status: verdict === 'accepted' ? 'complete' : 'failed',
      costUsd: cost ?? null,
      content: text,
      tools: state.toolCalls,
      evidence: state.evidenceParts,
      ...(cites ? { cites } : {}),
      recorded: verdict === 'accepted' ? { outcome: 'accepted' } : { outcome: 'rejected', reason: verdict === 'incomplete' ? 'stream_incomplete' : 'ungrounded_claims', unmatchedTokens: flagged ?? [], misattributedTokens: [] },
    },
  };
}

const collapse = (t) => String(t).replace(/\s+/g, ' ').trim();

/**
 * The cites of one answer, from the dev server's `[ask:cites]` line (cites.ts prints every cite in development):
 * `[ask:cites] {"surface":"coach","turn":"<conversation id>","says":"<first 60 chars of the answer>","cites":[["-4.16","e3","sg_approach","8091da4b"],["lost","e3","k","8091da4b","c"]]}`.
 * The line is matched to the answer by `says`, the first 60 characters of the stored text with whitespace collapsed, and, when `turnId`
 * is given, by `turn` too (only that turn's line counts; without a `turnId`, the newest `says` match does).
 * The subject is an 8-character id prefix (the verifier accepts six or more). Null when no line matches.
 */
export function citesFromLog(logText, answerText, surface, turnId) {
  if (!logText || !answerText) return null;
  const says = collapse(answerText).slice(0, 60);
  const parsedLines = [];
  for (const line of logText.split('\n').reverse()) {
    if (!line.includes('[ask:cites] ')) continue;
    try {
      const parsed = JSON.parse(line.slice(line.indexOf('{')));
      if (Array.isArray(parsed.cites) && collapse(parsed.says ?? '') === says && (!surface || !parsed.surface || parsed.surface === surface)) parsedLines.push(parsed);
    } catch {
      /* not a cites line */
    }
  }
  // With a turn id only that turn's line counts: two turns can open with the same 60 characters and cite different reads.
  const hit = turnId ? parsedLines.find((p) => p.turn === turnId) : parsedLines[0];
  return hit ? hit.cites.filter(Array.isArray).map(([v, ref, key, subject, flag]) => ({ v: String(v), ref, key, subject, ...(flag === 'c' ? { c: 1 } : {}) })) : null;
}

/**
 * Why the API rejected a request, from the dev server's log: the engine logs one line per rejection,
 * "chat/stream: the API rejected a request (400 invalid_request_error) and it was sent again without <group>: <the API's message>".
 * `logText` is the part of the log written while one question was being answered. Each reason is cut to 400 characters.
 */
export function rejectionsFromLog(logText) {
  const reasons = [];
  for (const line of String(logText ?? '').split('\n')) {
    const at = line.indexOf('the API rejected a request');
    if (at === -1) continue;
    // The logger prints the message as a quoted field of an object; what follows the message's own text is not part of it.
    const reason = line.slice(at).replace(/['"`],?\s*(action|severity)\b.*$/, '').replace(/['"`]\s*[,}]?\s*$/, '').trim().slice(0, 400);
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  return reasons;
}

// ------------------------- the report -------------------------

/**
 * The markdown report, as lines. One row of `report` per question asked: `{ question, verdict, text, seconds, cost, scored, sense,
 * note, tools, failedReads, grounded, unmatched, model }`, where `scored` is `score()`'s result for a data question and null for a
 * golf-sense one, `sense` is `scoreSense()`'s (null when there was no answer), and `grounded` is the ledger's `verified` (null when
 * no ledger row was found).
 */
export function reportLines({ report, asked, skipped, base, ref, team, maxUsd, stoppedBecause, at }) {
  const count = (fn) => report.filter(fn).length;
  const data = report.filter((r) => !r.question.golfSense);
  const golf = report.filter((r) => r.question.golfSense);
  // A degraded turn is never right, whatever it said: it did not run as configured.
  const right = (r) => r.verdict !== 'degraded' && (r.question.golfSense ? Boolean(r.sense?.sense.pass) : Boolean(r.scored?.allRight));
  const notRight = report.filter((r) => r.verdict === 'complete' && !right(r));
  const times = report.filter((r) => r.verdict === 'complete').map((r) => r.seconds).sort((a, b) => a - b);
  const ruleCounts = {};
  for (const r of report) for (const rule of r.sense?.writing.broken ?? []) ruleCounts[rule.replace(/ \(\d+\)$/, '')] = (ruleCounts[rule.replace(/ \(\d+\)$/, '')] ?? 0) + 1;
  const models = {};
  for (const r of report) if (r.model) models[r.model] = (models[r.model] ?? 0) + 1;
  const yn = (v) => (v == null ? 'n/a' : v ? 'pass' : 'FAIL');
  const lines = [];
  lines.push(`# CoachHelm chat evaluation, ${at}`, '');
  lines.push(`Server ${base}, staging ${ref}, team ${team}. ${report.length} of ${asked} questions asked, total cost $${report.reduce((a, r) => a + r.cost, 0).toFixed(2)} (cap $${maxUsd.toFixed(2)}), total time ${report.reduce((a, r) => a + r.seconds, 0).toFixed(0)}s${times.length ? `, median ${times[Math.floor(times.length / 2)].toFixed(1)}s per complete answer` : ''}.`, '');
  if (stoppedBecause) lines.push(`**${stoppedBecause}**`, '');
  if (skipped.length) lines.push(`Not asked (nobody on the roster fits the placeholder): ${skipped.join(', ')}.`, '');
  lines.push(`Verdicts: ${['complete', 'card', 'declined', 'degraded', 'failed', 'stopped', 'incomplete', 'error'].map((v) => `${v} ${count((r) => r.verdict === v)}`).join(', ')}.`);
  // A turn the API only accepted after a request feature was given up did not run as configured: its score says nothing about the configuration.
  const gaveUp = report.filter((r) => r.dropped?.length);
  if (gaveUp.length) lines.push(`**Ran without part of their configuration (the API rejected a request feature): ${gaveUp.length} of ${report.length}: ${[...new Set(gaveUp.flatMap((r) => r.dropped))].join(', ')}.** See each question's run note.`);
  lines.push(`Models, from the ledger: ${Object.entries(models).map(([m, n]) => `${m} ${n}`).join(', ') || 'none recorded'}.`);
  if (data.length) lines.push(`Data questions fully right: ${data.filter(right).length} of ${data.length}.`);
  if (golf.length) lines.push(`Golf sense: ${golf.filter(right).length} of ${golf.length} pass. Used a read they should: ${golf.filter((r) => r.sense?.reads.pass).length} of ${golf.length}.`);
  lines.push(`Writing rules: ${count((r) => r.sense?.writing.pass)} of ${count((r) => r.sense)} answers break none.${Object.keys(ruleCounts).length ? ` Broken: ${Object.entries(ruleCounts).sort((a, b) => b[1] - a[1]).map(([rule, n]) => `${rule} ${n}`).join(', ')}.` : ''}`);
  lines.push(`Figures matched the turn's reads (the logged check; it withholds nothing): ${count((r) => r.grounded === true)} of ${count((r) => r.grounded != null)}.`, '');
  lines.push('| Question | Category | Viewer | Verdict | Correct | Wrong | Missing | Golf sense | Reads | Writing | Figures matched | Model | Time | Cost |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of report) lines.push(`| ${r.question.id} | ${r.question.category} | ${r.question.viewer} | ${r.verdict} | ${r.scored?.correct ?? '-'} | ${r.scored?.wrong ?? '-'} | ${r.scored?.missing ?? '-'} | ${r.question.golfSense ? yn(r.sense?.sense.pass) : '-'} | ${r.question.golfSense ? yn(r.sense?.reads.pass) : '-'} | ${yn(r.sense?.writing.pass)} | ${r.grounded == null ? 'n/a' : r.grounded ? 'yes' : 'no'} | ${r.model ?? 'n/a'} | ${r.seconds.toFixed(1)}s | $${r.cost.toFixed(3)} |`);
  if (notRight.length) {
    lines.push('', '## Complete but not right', '');
    for (const r of notRight) {
      const why = r.question.golfSense
        ? [...r.sense.sense.missing.map((x) => `does not say: ${x}`), ...r.sense.sense.said.map((x) => `says: ${x}`)]
        : r.scored.results.filter((x) => x.status !== 'correct' && !x.optional).map((x) => `${x.status} ${x.label}${x.detail ? ` (${x.detail})` : ''}`);
      lines.push(`- ${r.question.id}: ${why.join('; ')}`);
    }
  }
  lines.push('', '## Per question', '');
  for (const r of report) {
    lines.push(`### ${r.question.id} (${r.verdict})`, '', `Q: ${r.question.ask}`, '');
    if (r.question.note) lines.push(`Note: ${r.question.note}`, '');
    if (r.note) lines.push(`Run note: ${r.note}`, '');
    // Where the cost went: a first turn writes the prompt to the cache (dearer than plain input), later ones read it (a tenth).
    if (r.tokens) lines.push(`Tokens: prompt ${r.tokens.prompt} (cache read ${r.tokens.cacheRead}, cache written ${r.tokens.cacheWrite}), output ${r.tokens.output}.`, '');
    if (r.grounded === false) lines.push(`Figures in none of the turn's reads: ${JSON.stringify(r.unmatched ?? [])}`, '');
    if (r.tools.length) lines.push(`Reads: ${r.tools.join(', ')}${r.failedReads?.length ? ` (failed: ${r.failedReads.join(', ')})` : ''}`, '');
    if (r.question.golfSense && r.sense) lines.push(`Reads expected: ${r.sense.reads.expected.length ? r.sense.reads.expected.join(' or ') : 'none needed'} (${yn(r.sense.reads.pass)})`, '');
    for (const x of r.scored?.results ?? []) lines.push(`- ${x.status}${x.optional ? ' (optional)' : ''}: ${x.label}${x.detail ? ` [${x.detail}]` : ''}`);
    for (const x of (r.question.golfSense && r.sense?.sense.missing) || []) lines.push(`- golf sense, does not say: ${x}`);
    for (const x of (r.question.golfSense && r.sense?.sense.said) || []) lines.push(`- golf sense, says: ${x}`);
    for (const x of r.sense?.writing.broken ?? []) lines.push(`- writing: ${x}`);
    lines.push('', '> ' + (r.text.trim().replace(/\n/g, '\n> ') || '(no text)'), '');
  }
  return lines;
}
