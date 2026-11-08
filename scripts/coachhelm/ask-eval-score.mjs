/**
 * The pure half of scripts/coachhelm/ask-eval.mjs: reading the answer stream and scoring an answer against the facts a
 * question expects. No network, no database. Tested in scripts/coachhelm/__tests__/ask-eval-score.test.ts.
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


/** What the answer stream has said so far: the text, and whether the route flagged or broke the turn. */
export const newStreamState = () => ({ text: '', flag: null, incomplete: false, error: null, evidence: 0, tools: [], evidenceParts: [], toolCalls: [] });

/** Fold one server-sent-event line of the UI message stream into the state. Lines that are not `data:` JSON are ignored. */
export function applyStreamLine(state, rawLine) {
  const line = rawLine.trim();
  if (!line.startsWith('data:')) return state;
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') return state;
  let ev;
  try {
    ev = JSON.parse(payload);
  } catch {
    return state;
  }
  if (ev.type === 'text-delta') state.text += ev.delta ?? '';
  else if (ev.type === 'data-grounding-flag') state.flag = ev.data ?? {};
  else if (ev.type === 'data-turn-incomplete') state.incomplete = true;
  else if (ev.type === 'data-evidence') {
    state.evidence += 1;
    if (ev.data?.envelope) state.evidenceParts.push({ tool: ev.data.tool ?? null, ref: ev.data.ref ?? null, envelope: ev.data.envelope });
  } else if (ev.type === 'tool-input-available' || ev.type === 'tool-input-start') {
    if (ev.toolName && !state.tools.includes(ev.toolName)) state.tools.push(ev.toolName);
    if (ev.type === 'tool-input-available' && ev.toolName) state.toolCalls.push({ name: ev.toolName, input: ev.input ?? null });
  }
  else if (ev.type === 'error') state.error = ev.errorText ?? 'stream error';
  return state;
}

/** The counts the route's citation audit keeps for a turn (`CitationStats` in cites.ts). */
export const CITATION_KEYS = ['figures', 'cited', 'fallback_passed', 'cites', 'verified', 'unresolved', 'mismatched', 'blocks', 'invalid'];

/** Read the counts from a ledger row's `citations.citation_stats` (written with a rejection), or null. */
export function citationsFromLedger(row) {
  const stats = row?.citations?.citation_stats;
  return stats && typeof stats === 'object' ? Object.fromEntries(CITATION_KEYS.map((k) => [k, Number(stats[k] ?? 0)])) : null;
}

/**
 * Read the counts of one conversation from the dev server's log text: the line of the `v3.chat.stream.citations` event that
 * names the conversation. An accepted turn's counts exist only there (the ledger keeps them for a rejection). The line may be
 * JSON or key=value text; each key is read wherever it appears on the line. Null when no such line.
 */
export function citationsFromLog(logText, conversationId) {
  if (!logText || !conversationId) return null;
  const line = logText.split('\n').find((l) => l.includes('v3.chat.stream.citations') && l.includes(conversationId));
  if (!line) return null;
  const out = {};
  for (const key of CITATION_KEYS) {
    const m = new RegExp(`["']?\\b${key}\\b["']?\\s*[:=]\\s*(\\d+)`).exec(line);
    out[key] = m ? Number(m[1]) : 0;
  }
  return out;
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
 * `[ask:cites] {"surface":"coach","says":"<first 60 chars of the answer>","cites":[["-4.16","e3","sg_approach","8091da4b"],["lost","e3","k","8091da4b","c"]]}`.
 * The line is matched to the answer by `says`, the first 60 characters of the stored text with whitespace collapsed.
 * The subject is an 8-character id prefix (the verifier accepts six or more). Null when no line matches.
 */
export function citesFromLog(logText, answerText, surface) {
  if (!logText || !answerText) return null;
  const says = collapse(answerText).slice(0, 60);
  const lines = logText.split('\n').filter((l) => l.includes('[ask:cites]'));
  for (const line of lines.reverse()) {
    const json = line.slice(line.indexOf('{'));
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      continue;
    }
    if (surface && parsed.surface && parsed.surface !== surface) continue;
    if (collapse(parsed.says ?? '') !== says || !Array.isArray(parsed.cites)) continue;
    return parsed.cites.filter(Array.isArray).map(([v, ref, key, subject, flag]) => ({ v: String(v), ref, key, subject, ...(flag === 'c' ? { c: 1 } : {}) }));
  }
  return null;
}
