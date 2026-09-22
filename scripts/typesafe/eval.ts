/**
 * TypeSafe (Jev) evaluation harness.
 *
 * Runs the six judgment modules in src/lib/typesafe/judgments/** against
 * PLANTED fixtures and prints Jev's answer beside what the current code
 * decides. It reads no database and sends no customer data anywhere — every
 * string below is invented. Nothing is written.
 *
 *   npm run typesafe:eval                 # all six
 *   npm run typesafe:eval -- messages     # one section: chat|recaps|messages|intents|insights|faults
 *
 * Needs TYPESAFE_API_KEY in .env.local.
 */

import { auditNumericClaims } from '@/lib/coachhelm/v3/chat/provenance';
import { classifyProviderFault } from '@/lib/admin/provider-fault';
import { verifyCitations } from '@/lib/coachhelm/v3/llm/citations';
import { buildRecapEvidence } from '@/lib/coachhelm/v3/llm/recap-evidence';
import { isTypeSafeConfigured, TYPESAFE_MODEL } from '@/lib/typesafe/client';
import { judgeFlaggedClaims } from '@/lib/typesafe/judgments/chat-claims';
import { judgeRecapSupport } from '@/lib/typesafe/judgments/recap-support';
import { triageMessage, summariseTriage } from '@/lib/typesafe/judgments/message-triage';
import { judgeChatIntent } from '@/lib/typesafe/judgments/chat-intent';
import { judgeInsight } from '@/lib/typesafe/judgments/insight-priority';
import { classifyProviderFaultSemantic } from '@/lib/typesafe/judgments/provider-fault-semantic';

const only = process.argv[2];
const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(4);
const clip = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1) + '…' : s).replace(/\s+/g, ' ');
const h = (title: string) => console.log(`\n${'═'.repeat(100)}\n${title}\n${'═'.repeat(100)}`);
const tally = { calls: 0, ms: 0, tokens: 0 };
const note = (r: { latencyMs: number; usage?: { input_tokens: number; output_tokens: number } } | null) => {
  if (!r) return;
  tally.calls += 1;
  tally.ms += r.latencyMs;
  if (r.usage) tally.tokens += r.usage.input_tokens + r.usage.output_tokens;
};

// ---------------------------------------------------------------------------
// 1. Chat grounding
// ---------------------------------------------------------------------------

async function chatClaims() {
  h('1. CHAT GROUNDING — regex flags every unsourced number; Jev says which are actually stat claims');
  const cases = [
    {
      question: 'how did Rivers do at the 18-hole qualifier',
      answer:
        'Rivers shot 74 at the 18-hole qualifier, two over on a par 72 layout. He hit 61% of fairways and needed 31 putts. Over his last 5 rounds his scoring average is 73.8.',
      // What the tools actually returned this turn. 74 and 31 are sourced; 61% and 73.8 are not.
      supported: [74, 31],
    },
    {
      question: 'is 150 yards a good number to work on for Bennett?',
      answer:
        'Yes. From 150 yards Bennett is averaging 38 feet to the pin, about 12 feet worse than the team. A 20-ball block twice a week for 3 weeks is a reasonable dose.',
      supported: [38, 50, 12],
    },
    {
      question: 'what should the lineup be',
      answer: 'Play Cole, Rivers and Bennett in the top 3 with Hale fourth. Cole has the lowest scoring average at 72.1 over 8 rounds.',
      supported: [],
    },
  ];
  for (const c of cases) {
    const flagged = auditNumericClaims(c.answer, [], [], c.supported);
    console.log(`\nQ: ${clip(c.question, 90)}`);
    console.log(`A: ${clip(c.answer, 170)}`);
    if (flagged.length === 0) {
      console.log('  regex: nothing flagged');
      continue;
    }
    const verdict = await judgeFlaggedClaims({ question: c.question, answer: c.answer, claims: flagged });
    note(verdict);
    if (!verdict) {
      console.log('  jev: (no answer)');
      continue;
    }
    console.log(`  regex flagged ${flagged.length} → turn would be marked UNGROUNDED. ${verdict.model} ${verdict.latencyMs}ms:`);
    for (const cl of verdict.claims) {
      const call = cl.statClaim >= 0.5 ? 'STAT CLAIM (real problem)' : 'not a stat (false positive)';
      const asked = cl.fromQuestion >= 0.5 ? ' — coach typed it' : '';
      console.log(`    ${cl.text.padStart(8)}  P(stat)=${pct(cl.statClaim)}  → ${call}${asked}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Round recap
// ---------------------------------------------------------------------------

async function recaps() {
  h('2. ROUND RECAP — regex citation check vs Jev semantic support');
  const facts = [
    'Holes played: 18',
    'Score: 75',
    'Score to par: +3',
    'Putts: 34',
    'Fairways hit: 43%',
    'Greens in regulation: 50%',
    'Front 9 / Back 9: 36 / 39',
  ];
  const cases = [
    {
      label: 'honest',
      recap:
        'Jordan posted 75, three over, with the back nine costing three more than the front. Half the greens in regulation is the thread to pull next round.',
    },
    {
      label: 'contradiction (under par on a +3 day)',
      recap: 'Jordan finished under par with 34 putts doing the heavy lifting. The 43% fairway rate is the number to move next time out.',
    },
    {
      label: 'invented detail (no hole data, no weather)',
      recap: 'Jordan birdied the last three holes to post 75 in heavy wind. Half the greens hit at 50% says the irons are close.',
    },
    {
      // Numbers all check out, but no fact mentions a specific 3-putt — Jev
      // is right to call it invented; the regex cannot see it at all.
      label: 'subtle invention (a specific "3-putt" no fact supports)',
      recap: 'Jordan turned in 75 with 34 putts, and one 3-putt on the back nine cost the round its shape. Greens at 50% are the next lever.',
    },
    {
      label: 'wrong player name',
      recap: 'Nick posted 75, three over. Fairways at 43% are where the strokes went, and that is where the work is.',
    },
  ];
  for (const c of cases) {
    const regex = verifyCitations(c.recap, buildRecapEvidence(facts));
    const v = await judgeRecapSupport({ facts, recap: c.recap, player_name: 'Jordan' });
    note(v);
    console.log(`\n[${c.label}] ${clip(c.recap, 150)}`);
    console.log(`  regex: verified=${regex.verified}${regex.unmatched_tokens.length ? ` unmatched=[${regex.unmatched_tokens.join(', ')}]` : ''}`);
    if (!v) {
      console.log('  jev: (no answer)');
      continue;
    }
    const a = v.answers;
    console.log(
      `  ${v.model} ${v.latencyMs}ms: contradicts=${pct(a.contradicts_facts.noul)} invents=${pct(a.invents_detail.noul)} editorial=${pct(a.reads_as_editorial.noul)} name_ok=${pct(a.names_correct_player.noul)}  → support=${pct(v.support)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Inbox triage
// ---------------------------------------------------------------------------

async function messages() {
  h('3. INBOX TRIAGE — labels + urgency per message');
  const cases = [
    { message: 'hey coach, tweaked my wrist on the range today, not sure I can play thursday', sender_role: 'player' },
    { message: 'Coach my dad said the flight for the invitational got cancelled, can we drive down Friday morning instead?', sender_role: 'player' },
    { message: 'honestly feel like I am wasting everyones time out there. not sure this is for me anymore', sender_role: 'player' },
    { message: 'gg today boys 🔥🔥', sender_role: 'player' },
    { message: 'Hi Coach, this is Mark\'s mom. His chem professor moved the exam to Tuesday 8am, same time as the van. What should he do?', sender_role: 'parent' },
    { message: 'thanks for the notes on the wedge stuff, felt way better today', sender_role: 'player' },
    { message: 'a coach from Furman messaged me on instagram asking about my summer schedule, am I allowed to reply?', sender_role: 'player' },
  ];
  for (const c of cases) {
    const v = await triageMessage(c);
    note(v);
    console.log(`\n[${c.sender_role}] ${clip(c.message, 120)}`);
    if (!v) {
      console.log('  jev: (no answer)');
      continue;
    }
    const s = summariseTriage(v.answers);
    const a = v.answers;
    console.log(
      `  ${v.model} ${v.latencyMs}ms: injury=${pct(a.injury.noul)} miss=${pct(a.may_miss_event.noul)} reply=${pct(a.needs_coach_reply.noul)} neg=${pct(a.negative_sentiment.noul)} urgency=${a.urgency.score.toFixed(2)}/3 topic=${s.topic}(${pct(s.topicConfidence)})`,
    );
    console.log(`  → flags=[${s.flags.join(', ')}] needsReply=${s.needsReply}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Chat intent
// ---------------------------------------------------------------------------

async function intents() {
  h('4. CHAT INTENT — what the coach is asking, before any LLM call');
  const cases = [
    { question: 'what is Carter averaging on the greens this month', previous_turns: [] as string[] },
    { question: 'what about him over the last 5?', previous_turns: ['user: how is Carter putting this month', 'assistant: Carter is averaging 31.2 putts over 4 rounds.'] },
    { question: 'why does Bennett keep blowing up on par 5s', previous_turns: [] },
    { question: 'give me a 45 minute wedge session for the top 5 guys', previous_turns: [] },
    { question: 'who should travel to the invitational', previous_turns: [] },
    { question: 'whats the weather in scottsdale', previous_turns: [] },
    { question: 'send the team a reminder that the van leaves at 6', previous_turns: [] },
    { question: 'how do I change my notification settings', previous_turns: [] },
    { question: 'ok', previous_turns: ['user: rank the roster by scoring average', 'assistant: 1. Cole 72.1 …'] },
  ];
  for (const c of cases) {
    const v = await judgeChatIntent(c);
    note(v);
    console.log(`\n"${clip(c.question, 120)}"`);
    if (!v) {
      console.log('  jev: (no answer)');
      continue;
    }
    const a = v.answers;
    const top = Object.entries(a.intent.probabilities)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 2)
      .map(([k, p]) => `${k} ${pct(p)}`)
      .join(', ');
    console.log(
      `  ${v.model} ${v.latencyMs}ms: intent=${a.intent.choice} (${top}) player=${pct(a.names_specific_player.noul)} follow_up=${pct(a.is_follow_up.noul)} fresh_data=${pct(a.needs_fresh_data.noul)} action=${pct(a.wants_action.noul)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Insight priority
// ---------------------------------------------------------------------------

async function insights() {
  h('5. INSIGHT PRIORITY — actionability / specificity beside the numeric rank inputs');
  const cases = [
    {
      id: '1',
      title: 'Scoring average 74.2 over the last 6 rounds',
      content: 'Rivers is averaging 74.2 across his last six competitive rounds.',
      category: 'scoring',
      insight_type: 'trend',
      evidence: { metric: 'scoring_average', value: 74.2, sample_n: 6 },
    },
    {
      id: '2',
      title: 'Putting is costing strokes',
      content: 'Putting is an area to look at for Rivers.',
      category: 'putting',
      insight_type: 'leak',
      evidence: { metric: 'putts_per_round', value: 33.1, benchmark: 30.4, sample_n: 6 },
    },
    {
      id: '3',
      title: '3-5 ft putts: 71% vs 88% team — costing 1.4 strokes/round',
      content:
        'Rivers has made 12 of 17 putts from 3-5 feet over six rounds (71%) against a team rate of 88%. A 30-ball gate drill at 4 feet, three sessions this week, targets the exact band.',
      category: 'putting',
      insight_type: 'leak',
      evidence: { metric: 'putt_make_3_5ft', value: 0.71, benchmark: 0.88, made: 12, attempts: 17, sample_n: 6, strokes_impact: -1.4 },
    },
    {
      id: '4',
      title: 'Driving has collapsed since the swing change',
      content: 'Rivers is hitting 38% of fairways in his last two rounds, down from 61%. The swing change is not working.',
      category: 'driving',
      insight_type: 'trend',
      evidence: { metric: 'fairways_pct', value: 0.38, prior: 0.61, sample_n: 2 },
    },
    {
      id: '5',
      title: 'Approach from 150-175 yards: 41 ft average proximity',
      content: 'From 150-175 yards Rivers averages 41 feet to the hole over 22 shots, 9 feet worse than team average. Mid-iron distance control with a launch monitor on Tuesday would isolate whether it is carry or start line.',
      category: 'approach',
      insight_type: 'leak',
      evidence: { metric: 'proximity_150_175', value: 41, benchmark: 32, shots: 22 },
    },
  ];
  for (const r of cases) {
    const v = await judgeInsight(r);
    note(v);
    console.log(`\n[${r.insight_type}] ${clip(r.title, 100)}`);
    if (r.content) console.log(`  ${clip(r.content, 140)}`);
    if (!v) {
      console.log('  jev: (no answer)');
      continue;
    }
    const a = v.answers;
    console.log(
      `  ${v.model} ${v.latencyMs}ms: actionability=${a.actionability.score.toFixed(2)}/2 specificity=${a.specificity.score.toFixed(2)}/2 player_safe=${pct(a.safe_for_player.noul)} overclaims=${pct(a.overclaims.noul)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 6. Provider faults
// ---------------------------------------------------------------------------

async function faults() {
  h('6. PROVIDER FAULTS — regex rules vs Jev on error text');
  const texts = [
    'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
    'Your organization has run out of prepaid usage. Add funds to continue.',
    'This API key has been disabled by the workspace administrator.',
    'The model claude-opus-5 is not available on your current plan tier.',
    'OpenAI: You exceeded your current quota, please check your plan and billing details.',
    'Inngest: function run throttled, concurrency limit reached, will retry',
    'AI Gateway: 529 overloaded, please retry shortly',
    "TypeError: Cannot read properties of undefined (reading 'measurements')",
    'Invalid input: expected number, received string at "holes[3].putts"',
  ];
  for (const text of texts) {
    const regex = classifyProviderFault(text);
    const v = await classifyProviderFaultSemantic(text);
    note(v);
    console.log(`\n${clip(text, 110)}`);
    console.log(`  regex: ${regex ? `${regex.kind} / ${regex.provider}` : 'null (no rule matched)'}`);
    if (!v) {
      console.log('  jev: (no answer)');
      continue;
    }
    console.log(`  ${v.model} ${v.latencyMs}ms: ${v.kind} (${pct(v.kindConfidence)}) / ${v.provider} (${pct(v.providerConfidence)})`);
  }
}

async function main() {
  if (!isTypeSafeConfigured()) {
    console.error('TYPESAFE_API_KEY is not set.');
    process.exit(1);
  }
  console.log(`TypeSafe eval — requested model ${TYPESAFE_MODEL}, ${new Date().toISOString()}`);
  const sections: Record<string, () => Promise<void>> = { chat: chatClaims, recaps, messages, intents, insights, faults };
  for (const [name, run] of Object.entries(sections)) {
    if (only && only !== name) continue;
    await run();
  }
  console.log(`\n${tally.calls} Jev calls, avg ${tally.calls ? Math.round(tally.ms / tally.calls) : 0}ms, ${tally.tokens} tokens total`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
