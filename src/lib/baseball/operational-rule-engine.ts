// =============================================================================
// src/lib/baseball/operational-rule-engine.ts
//
// Packet: signal-inbox DEEPENING — the DETERMINISTIC RULE ENGINE that V5 System
// 1 ("The Signal Layer") enumerates but which never existed in code.
//
// CONTROLLING SPEC: v5_competitive_system_blueprints.md §System 1 →
//   "Signals can be generated from: direct rule engine | import validation |
//    user action | AI output | scheduled evaluator."
//   "Signal rules should be data-driven later: condition / source types /
//    severity / owner role / action template / visibility."
//
// THE GAP THIS CLOSES
//   Before this file the ONLY signal generators were the 14 CoachHelm AI/
//   performance generators (composites/v10.ts → signal-from-insight.ts, all
//   source_kind:'ai') plus the academics class-conflict engine. The ~25
//   operational/roster/practice/stats/recruiting/AI-hygiene signal types the
//   spec lists — which are DETERMINISTIC rules, not AI insights — had no
//   generation path. This engine adds them as source_kind:'system' signals.
//
// DESIGN — DATA-DRIVEN RULE DEFINITIONS
//   Each rule is a {@link OperationalRule}: a typed object carrying exactly the
//   spec's schema fields (condition / sourceTypes / severity / ownerRole /
//   actionTemplate / visibility / category) plus a pure `evaluate(facts)` that
//   returns zero or more {@link RuleSignal}s. The action layer feeds the
//   evaluator a single {@link OperationalRuleFacts} snapshot loaded from the
//   relevant tables; the engine is PURE (no I/O, no Supabase, no React) so it
//   is unit-testable and safe on the server.
//
// HONESTY (binding — same floor as the AI path)
//   * These are DETERMINISTIC rules over concrete records (an event with no ack
//     row, a task past its due date, a document category absent). They are not
//     statistical, so confidence is 1.0 ONLY for facts that are literally true
//     of the data (e.g. "this task's due_date is in the past"); a rule that
//     INFERS something it cannot prove (duplicate-player by fuzzy name) carries
//     a sub-1.0 confidence and never a 'critical' severity.
//   * A rule never fabricates from missing data the way a false "high" would —
//     a "document missing" rule fires on a KNOWN required-document checklist,
//     not on a guess, and is 'info' severity (a reminder, not an alarm).
//   * Every signal carries source_refs pointing at the REAL table/row the rule
//     read, so the source drawer can walk signal → record.
//
// NO GOLF: no round/hole/tee/course vocabulary. Recalibrated for 12–25 player
// rosters (small counts are normal; a single overdue task is worth surfacing).
// =============================================================================

import type {
  BaseballSignalSeverity,
  BaseballSignalCategory,
  BaseballSignalVisibility,
  BaseballRecommendedActionType,
  BaseballSignalSourceRef,
} from '@/lib/types/baseball-signals';

// -----------------------------------------------------------------------------
// Rule identity — the 8 deterministic categories from V5 System 1 that the AI
// path does NOT cover. (Performance/hitting/pitching/etc. stay on the AI path;
// academics class-conflicts stay on class-conflict-engine.ts.)
// -----------------------------------------------------------------------------

/** Stable rule id (also the signal_type prefix + dedupe namespace). */
export type OperationalRuleId =
  // Team operations
  | 'event_ack_missing'
  | 'practice_unpublished'
  | 'task_overdue'
  | 'document_missing'
  | 'travel_missing_logistics'
  // Roster / player
  | 'player_status_changed'
  | 'duplicate_player_match'
  | 'missing_external_id'
  | 'inactive_player_in_import'
  // Practice
  | 'practice_block_no_owner'
  // Stats / postgame
  | 'official_stats_missing'
  | 'postgame_review_needed'
  // Recruiting / showcase
  | 'profile_incomplete'
  | 'missing_video'
  // AI hygiene
  | 'ai_output_stale';

// -----------------------------------------------------------------------------
// RuleSignal — the signal-shaped candidate a rule emits. The action layer maps
// this 1:1 to a BaseballSignalInsert (source_kind:'system'). Field names mirror
// the signal columns so the mapping is mechanical + total.
// -----------------------------------------------------------------------------

export interface RuleSignal {
  ruleId: OperationalRuleId;
  /** stable signal_type, e.g. 'task_overdue'. */
  signalType: string;
  category: BaseballSignalCategory;
  severity: BaseballSignalSeverity;
  /** subject player, when the rule is player-scoped (else null = team-level). */
  playerId: string | null;
  /** subject event, when the rule is event-scoped (else null). */
  eventId: string | null;
  title: string;
  whyItMatters: string;
  /** compact factual evidence line (counts/dates), never an uncited claim. */
  evidence: string | null;
  sourceRefs: BaseballSignalSourceRef[];
  /** [0,1] — 1.0 for literally-true deterministic facts; < 1 for inferred. */
  confidence: number;
  recommendedActionLabel: string;
  recommendedActionType: BaseballRecommendedActionType;
  recommendedOwnerRole: string;
  visibility: BaseballSignalVisibility;
  /** stable per (rule, subject) so a re-run UPSERTs the open signal, never clones. */
  dedupeKey: string;
}

// -----------------------------------------------------------------------------
// OperationalRule — the data-driven rule definition (the spec's schema). The
// engine is a registry of these; the action layer simply runs them all over a
// single facts snapshot. New rules are added as data, not new code paths.
// -----------------------------------------------------------------------------

export interface OperationalRule {
  id: OperationalRuleId;
  /** Human one-liner for the rule catalog UI (what condition fires it). */
  condition: string;
  /** Source tables this rule reads (drives the source badge + load plan). */
  sourceTypes: string[];
  /** Default severity (a rule may downgrade per-instance, never inflate). */
  severity: BaseballSignalSeverity;
  /** Who triages this rule's signals. */
  ownerRole: string;
  category: BaseballSignalCategory;
  /** Default conversion target (the action template). */
  actionTemplate: BaseballRecommendedActionType;
  /** Visibility ceiling for this rule's signals (strictest-wins downstream). */
  visibility: BaseballSignalVisibility;
  /** Pure evaluator: facts → zero or more signals. */
  evaluate(facts: OperationalRuleFacts, cfg: RuleEngineConfig): RuleSignal[];
}

// -----------------------------------------------------------------------------
// Facts snapshot — the normalized read model the action layer loads ONCE and
// hands to every rule. Source-agnostic (caller maps DB rows to these shapes),
// so the engine has no Supabase dependency and is fully unit-testable.
// -----------------------------------------------------------------------------

export interface FactEvent {
  id: string;
  title: string;
  eventType: string | null;
  startsAt: string; // ISO
  isMandatory: boolean;
  /** Distinct user ids that acknowledged this event. */
  ackUserIds: string[];
}

export interface FactPractice {
  id: string;
  title: string | null;
  status: 'draft' | 'published' | 'completed' | string;
  /** ISO date/time of the practice (for the "starts soon, still draft" rule). */
  scheduledAt: string | null;
  /** Blocks on this practice + whether each has a staff owner. */
  blocks: Array<{ id: string; activity: string; hasOwner: boolean }>;
}

export interface FactTask {
  id: string;
  title: string;
  dueDate: string | null; // ISO
  status: string;
}

export interface FactDocument {
  category: string;
}

export interface FactTravel {
  id: string;
  eventName: string;
  departureDate: string | null;
  transportation: string | null;
  accommodation: string | null;
}

export interface FactPlayer {
  id: string;
  fullName: string;
  /** team_member status (active / pending / inactive / …). */
  membershipStatus: string | null;
  /** True when the player has at least one external id (e.g. source roster id). */
  hasExternalId: boolean;
  /** True when a recruiting/showcase profile exists for the player. */
  hasProfile: boolean;
  /** Profile completeness fields present (for the 'profile_incomplete' rule). */
  profileFieldsPresent: number;
  profileFieldsTotal: number;
  /** True when the player has ≥1 linked video. */
  hasVideo: boolean;
  /** True when the player opted into recruiting (gates recruiting rules). */
  recruitingActive: boolean;
  /** Normalized name key for the duplicate-detection rule. */
  normalizedNameKey: string;
}

export interface FactGame {
  id: string;
  label: string;
  playedAt: string; // ISO (in the past)
  /** True when official box-score stats were imported for this game. */
  hasOfficialStats: boolean;
  /** True when a postgame review was filed for this game. */
  hasPostgameReview: boolean;
}

export interface FactImportRow {
  /** Display label of an inactive player that appeared in an import. */
  playerLabel: string;
  importRunId: string | null;
}

export interface FactAiOutput {
  /** the most-recent engine generation timestamp for the team (ISO), or null. */
  lastGeneratedAt: string | null;
}

export interface OperationalRuleFacts {
  /** Upcoming mandatory events to check for missing acks. */
  upcomingEvents: FactEvent[];
  /** Expected attendee count (active roster size) for ack-coverage math. */
  expectedAttendeeCount: number;
  practices: FactPractice[];
  tasks: FactTask[];
  documents: FactDocument[];
  travel: FactTravel[];
  players: FactPlayer[];
  recentGames: FactGame[];
  inactiveImportRows: FactImportRow[];
  /** team-required document categories (program checklist). */
  requiredDocumentCategories: string[];
  ai: FactAiOutput;
  /** "now" as ISO so the engine is deterministic in tests. */
  nowIso: string;
}

// -----------------------------------------------------------------------------
// Config (thresholds) — all overridable so a program can tune the engine later
// without touching rule code (the spec's "data-driven" intent).
// -----------------------------------------------------------------------------

export interface RuleEngineConfig {
  /** Fire 'practice_unpublished' when a draft practice is within this window. */
  practiceUnpublishedHours: number;
  /** Fire 'event_ack_missing' only when within this window of the event. */
  eventAckHorizonHours: number;
  /** Below this ack coverage ratio [0,1] the event-ack signal is a 'warning'. */
  eventAckWarningRatio: number;
  /** Fire 'official_stats_missing' only for games older than this many hours. */
  officialStatsGraceHours: number;
  /** Engine output older than this many hours is 'stale'. */
  aiStaleHours: number;
  /** Profile completeness below this ratio fires 'profile_incomplete'. */
  profileCompletenessFloor: number;
}

export const DEFAULT_RULE_ENGINE_CONFIG: RuleEngineConfig = {
  practiceUnpublishedHours: 48,
  eventAckHorizonHours: 72,
  eventAckWarningRatio: 0.6,
  officialStatsGraceHours: 24,
  aiStaleHours: 14 * 24, // two weeks
  profileCompletenessFloor: 0.7,
};

// -----------------------------------------------------------------------------
// Small pure helpers
// -----------------------------------------------------------------------------

function hoursBetween(aIso: string, bIso: string): number {
  return (Date.parse(bIso) - Date.parse(aIso)) / 3_600_000;
}

function ref(
  table: string,
  id: string | null,
  label: string,
  visibility: BaseballSignalVisibility = 'staff_only',
): BaseballSignalSourceRef {
  return { source_table: table, source_id: id, label, visibility };
}

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// =============================================================================
// THE RULE REGISTRY
// =============================================================================

export const OPERATIONAL_RULES: readonly OperationalRule[] = [
  // ---------------------------------------------------------------------------
  // TEAM OPERATIONS
  // ---------------------------------------------------------------------------
  {
    id: 'event_ack_missing',
    condition:
      'A mandatory event is within the ack horizon but some/all members have not acknowledged it.',
    sourceTypes: ['baseball_events', 'baseball_event_acknowledgements'],
    severity: 'warning',
    ownerRole: 'operations',
    category: 'operations',
    actionTemplate: 'message',
    visibility: 'staff_only',
    evaluate(facts, cfg) {
      const out: RuleSignal[] = [];
      const expected = Math.max(0, facts.expectedAttendeeCount);
      if (expected === 0) return out; // no roster → nothing to expect
      for (const ev of facts.upcomingEvents) {
        if (!ev.isMandatory) continue;
        const hoursOut = hoursBetween(facts.nowIso, ev.startsAt);
        // Only nag inside the horizon and only for FUTURE events.
        if (hoursOut < 0 || hoursOut > cfg.eventAckHorizonHours) continue;
        const acked = new Set(ev.ackUserIds).size;
        const missing = Math.max(0, expected - acked);
        if (missing === 0) continue;
        const ratio = expected > 0 ? acked / expected : 1;
        // Closer to the event with lower coverage → escalate (still never inflate
        // past 'warning' for a soft ops nudge unless it's imminent + zero acks).
        const imminent = hoursOut <= 12;
        const severity: BaseballSignalSeverity =
          imminent && ratio === 0 ? 'critical' : ratio < cfg.eventAckWarningRatio ? 'warning' : 'info';
        out.push({
          ruleId: 'event_ack_missing',
          signalType: 'event_ack_missing',
          category: 'operations',
          severity,
          playerId: null,
          eventId: ev.id,
          title: `${missing} unacknowledged for "${ev.title}"`,
          whyItMatters: `${acked} of ${expected} members acknowledged this mandatory event, which starts in ${Math.round(
            hoursOut,
          )}h. Confirm attendance before it begins.`,
          evidence: `${acked}/${expected} acknowledged · starts ${ev.startsAt}`,
          sourceRefs: [
            ref('baseball_events', ev.id, ev.title, 'team'),
            ref('baseball_event_acknowledgements', null, `${acked} acknowledgements`, 'staff_only'),
          ],
          confidence: 1, // literally counted from ack rows
          recommendedActionLabel: 'Message members who have not acknowledged',
          recommendedActionType: 'message',
          recommendedOwnerRole: 'operations',
          visibility: 'staff_only',
          dedupeKey: `event_ack_missing:${ev.id}`,
        });
      }
      return out;
    },
  },

  {
    id: 'practice_unpublished',
    condition: 'A practice is still in draft within the publish window.',
    sourceTypes: ['baseball_practices'],
    severity: 'warning',
    ownerRole: 'coaching',
    category: 'practice',
    actionTemplate: 'meeting_item',
    visibility: 'staff_only',
    evaluate(facts, cfg) {
      const out: RuleSignal[] = [];
      for (const p of facts.practices) {
        if (p.status !== 'draft' || !p.scheduledAt) continue;
        const hoursOut = hoursBetween(facts.nowIso, p.scheduledAt);
        if (hoursOut < 0 || hoursOut > cfg.practiceUnpublishedHours) continue;
        const severity: BaseballSignalSeverity = hoursOut <= 12 ? 'critical' : 'warning';
        out.push({
          ruleId: 'practice_unpublished',
          signalType: 'practice_unpublished',
          category: 'practice',
          severity,
          playerId: null,
          eventId: null,
          title: `Practice still in draft (${Math.round(hoursOut)}h out)`,
          whyItMatters: `"${
            p.title ?? 'Practice'
          }" is scheduled in ${Math.round(
            hoursOut,
          )}h but has not been published, so players cannot see the plan yet.`,
          evidence: `status=draft · scheduled ${p.scheduledAt}`,
          sourceRefs: [ref('baseball_practices', p.id, p.title ?? 'Practice', 'staff_only')],
          confidence: 1,
          recommendedActionLabel: 'Publish the practice plan',
          recommendedActionType: 'meeting_item',
          recommendedOwnerRole: 'coaching',
          visibility: 'staff_only',
          dedupeKey: `practice_unpublished:${p.id}`,
        });
      }
      return out;
    },
  },

  {
    id: 'task_overdue',
    condition: 'A team task is past its due date and not completed/cancelled.',
    sourceTypes: ['baseball_tasks'],
    severity: 'warning',
    ownerRole: 'operations',
    category: 'operations',
    actionTemplate: 'player_task',
    visibility: 'staff_only',
    evaluate(facts) {
      const out: RuleSignal[] = [];
      for (const t of facts.tasks) {
        if (!t.dueDate) continue;
        if (t.status === 'completed' || t.status === 'cancelled') continue;
        const overdueHours = hoursBetween(t.dueDate, facts.nowIso);
        if (overdueHours <= 0) continue;
        const overdueDays = Math.floor(overdueHours / 24);
        const severity: BaseballSignalSeverity = overdueDays >= 3 ? 'critical' : 'warning';
        out.push({
          ruleId: 'task_overdue',
          signalType: 'task_overdue',
          category: 'operations',
          severity,
          playerId: null,
          eventId: null,
          title: `Task overdue: ${t.title}`,
          whyItMatters: `This task was due ${
            overdueDays >= 1 ? `${overdueDays} day${overdueDays === 1 ? '' : 's'}` : `${Math.round(overdueHours)}h`
          } ago and is still ${t.status}.`,
          evidence: `due ${t.dueDate} · status ${t.status}`,
          sourceRefs: [ref('baseball_tasks', t.id, t.title, 'staff_only')],
          confidence: 1,
          recommendedActionLabel: 'Reassign or complete the task',
          recommendedActionType: 'player_task',
          recommendedOwnerRole: 'operations',
          visibility: 'staff_only',
          dedupeKey: `task_overdue:${t.id}`,
        });
      }
      return out;
    },
  },

  {
    id: 'document_missing',
    condition: 'A program-required document category has no uploaded document.',
    sourceTypes: ['baseball_documents'],
    severity: 'info',
    ownerRole: 'operations',
    category: 'operations',
    actionTemplate: 'meeting_item',
    visibility: 'staff_only',
    evaluate(facts) {
      const out: RuleSignal[] = [];
      const present = new Set(facts.documents.map((d) => d.category));
      for (const required of facts.requiredDocumentCategories) {
        if (present.has(required)) continue;
        out.push({
          ruleId: 'document_missing',
          signalType: 'document_missing',
          category: 'operations',
          severity: 'info',
          playerId: null,
          eventId: null,
          title: `Missing required document: ${required}`,
          whyItMatters: `Your program checklist expects a "${required}" document, but none has been uploaded.`,
          evidence: `category "${required}" not present`,
          sourceRefs: [ref('baseball_documents', null, `category: ${required}`, 'staff_only')],
          confidence: 1,
          recommendedActionLabel: 'Upload the required document',
          recommendedActionType: 'meeting_item',
          recommendedOwnerRole: 'operations',
          visibility: 'staff_only',
          dedupeKey: `document_missing:${required}`,
        });
      }
      return out;
    },
  },

  {
    id: 'travel_missing_logistics',
    condition: 'A travel itinerary with an upcoming departure has no transportation or accommodation.',
    sourceTypes: ['baseball_travel_itineraries'],
    severity: 'warning',
    ownerRole: 'operations',
    category: 'operations',
    actionTemplate: 'meeting_item',
    visibility: 'staff_only',
    evaluate(facts) {
      const out: RuleSignal[] = [];
      for (const tr of facts.travel) {
        if (!tr.departureDate) continue;
        // Only future / current trips.
        const hoursOut = hoursBetween(facts.nowIso, `${tr.departureDate}T00:00:00.000Z`);
        if (hoursOut < -24) continue; // already departed > a day ago
        const missing: string[] = [];
        if (!tr.transportation?.trim()) missing.push('transportation');
        if (!tr.accommodation?.trim()) missing.push('accommodation');
        if (missing.length === 0) continue;
        out.push({
          ruleId: 'travel_missing_logistics',
          signalType: 'travel_missing_logistics',
          category: 'operations',
          severity: 'warning',
          playerId: null,
          eventId: null,
          title: `Travel logistics incomplete: ${tr.eventName}`,
          whyItMatters: `The "${tr.eventName}" itinerary departs ${tr.departureDate} but is missing ${missing.join(
            ' and ',
          )}.`,
          evidence: `departs ${tr.departureDate} · missing ${missing.join(', ')}`,
          sourceRefs: [ref('baseball_travel_itineraries', tr.id, tr.eventName, 'staff_only')],
          confidence: 1,
          recommendedActionLabel: `Add ${missing.join(' and ')} to the itinerary`,
          recommendedActionType: 'meeting_item',
          recommendedOwnerRole: 'operations',
          visibility: 'staff_only',
          dedupeKey: `travel_missing_logistics:${tr.id}`,
        });
      }
      return out;
    },
  },

  // ---------------------------------------------------------------------------
  // ROSTER / PLAYER
  // ---------------------------------------------------------------------------
  {
    id: 'duplicate_player_match',
    condition: 'Two roster players share a normalized name (possible duplicate).',
    sourceTypes: ['baseball_players', 'baseball_team_members'],
    severity: 'warning',
    ownerRole: 'operations',
    category: 'roster',
    actionTemplate: 'meeting_item',
    visibility: 'staff_only',
    evaluate(facts) {
      const out: RuleSignal[] = [];
      const byKey = new Map<string, FactPlayer[]>();
      for (const p of facts.players) {
        if (!p.normalizedNameKey) continue;
        const arr = byKey.get(p.normalizedNameKey) ?? [];
        arr.push(p);
        byKey.set(p.normalizedNameKey, arr);
      }
      for (const [, group] of byKey) {
        if (group.length < 2) continue;
        const names = group.map((g) => g.fullName).join(', ');
        out.push({
          ruleId: 'duplicate_player_match',
          signalType: 'duplicate_player_match',
          category: 'roster',
          severity: 'warning',
          playerId: group[0]!.id,
          eventId: null,
          title: `Possible duplicate player: ${group[0]!.fullName}`,
          whyItMatters: `${group.length} roster entries normalize to the same name (${names}). Merge or rename if they are the same person, so stats and imports do not split across records.`,
          evidence: `${group.length} entries · key "${group[0]!.normalizedNameKey}"`,
          sourceRefs: group.map((g) => ref('baseball_players', g.id, g.fullName, 'staff_only')),
          // INFERRED (fuzzy name match) — never a literal fact, so < 1.0 and
          // capped severity at 'warning' (the spec's honesty floor).
          confidence: 0.6,
          recommendedActionLabel: 'Review possible duplicate records',
          recommendedActionType: 'meeting_item',
          recommendedOwnerRole: 'operations',
          visibility: 'staff_only',
          dedupeKey: `duplicate_player_match:${group
            .map((g) => g.id)
            .sort()
            .join('+')}`,
        });
      }
      return out;
    },
  },

  {
    id: 'missing_external_id',
    condition: 'An active player has no external id (breaks stat-import matching).',
    sourceTypes: ['baseball_players', 'baseball_player_external_ids'],
    severity: 'info',
    ownerRole: 'operations',
    category: 'roster',
    actionTemplate: 'meeting_item',
    visibility: 'staff_only',
    evaluate(facts) {
      const out: RuleSignal[] = [];
      for (const p of facts.players) {
        if (p.membershipStatus && p.membershipStatus !== 'active') continue;
        if (p.hasExternalId) continue;
        out.push({
          ruleId: 'missing_external_id',
          signalType: 'missing_external_id',
          category: 'roster',
          severity: 'info',
          playerId: p.id,
          eventId: null,
          title: `No external ID for ${p.fullName}`,
          whyItMatters: `${p.fullName} has no external roster id, so stat imports must match this player by name (less reliable). Add an external id from your stat source.`,
          evidence: 'no baseball_player_external_ids row',
          sourceRefs: [ref('baseball_players', p.id, p.fullName, 'staff_only')],
          confidence: 1,
          recommendedActionLabel: 'Add an external ID for this player',
          recommendedActionType: 'meeting_item',
          recommendedOwnerRole: 'operations',
          visibility: 'staff_only',
          dedupeKey: `missing_external_id:${p.id}`,
        });
      }
      return out;
    },
  },

  {
    id: 'inactive_player_in_import',
    condition: 'An inactive/unrostered player label appeared in a committed import.',
    sourceTypes: ['baseball_import_runs', 'baseball_team_members'],
    severity: 'warning',
    ownerRole: 'operations',
    category: 'import_quality',
    actionTemplate: 'import_review',
    visibility: 'staff_only',
    evaluate(facts) {
      const out: RuleSignal[] = [];
      for (const row of facts.inactiveImportRows) {
        out.push({
          ruleId: 'inactive_player_in_import',
          signalType: 'inactive_player_in_import',
          category: 'import_quality',
          severity: 'warning',
          playerId: null,
          eventId: null,
          title: `Inactive player in import: ${row.playerLabel}`,
          whyItMatters: `"${row.playerLabel}" appeared in an import but is not an active roster member. Confirm whether they should be reactivated or the row excluded.`,
          evidence: `import row · "${row.playerLabel}"`,
          sourceRefs: [
            ref('baseball_import_runs', row.importRunId, `Import row: ${row.playerLabel}`, 'staff_only'),
          ],
          confidence: 1,
          recommendedActionLabel: 'Review the import row',
          recommendedActionType: 'import_review',
          recommendedOwnerRole: 'operations',
          visibility: 'staff_only',
          dedupeKey: `inactive_player_in_import:${row.importRunId ?? 'na'}:${row.playerLabel}`,
        });
      }
      return out;
    },
  },

  // ---------------------------------------------------------------------------
  // PRACTICE
  // ---------------------------------------------------------------------------
  {
    id: 'practice_block_no_owner',
    condition: 'A practice block has no staff owner assigned.',
    sourceTypes: ['baseball_practice_blocks'],
    severity: 'info',
    ownerRole: 'coaching',
    category: 'practice',
    actionTemplate: 'meeting_item',
    visibility: 'staff_only',
    evaluate(facts) {
      const out: RuleSignal[] = [];
      for (const p of facts.practices) {
        // Only nag for practices that are published or imminent (don't bother on
        // a far-off draft — those are still being built).
        const unowned = p.blocks.filter((b) => !b.hasOwner);
        if (unowned.length === 0) continue;
        if (p.status === 'completed') continue;
        out.push({
          ruleId: 'practice_block_no_owner',
          signalType: 'practice_block_no_owner',
          category: 'practice',
          severity: 'info',
          playerId: null,
          eventId: null,
          title: `${unowned.length} practice block${
            unowned.length === 1 ? '' : 's'
          } without a staff owner`,
          whyItMatters: `"${
            p.title ?? 'Practice'
          }" has ${unowned.length} block${
            unowned.length === 1 ? '' : 's'
          } with no coach assigned (${unowned
            .slice(0, 3)
            .map((b) => b.activity)
            .join(', ')}). Assign an owner so each station is run.`,
          evidence: `${unowned.length} unowned block${unowned.length === 1 ? '' : 's'}`,
          sourceRefs: [
            ref('baseball_practices', p.id, p.title ?? 'Practice', 'staff_only'),
            ...unowned
              .slice(0, 3)
              .map((b) => ref('baseball_practice_blocks', b.id, b.activity, 'staff_only')),
          ],
          confidence: 1,
          recommendedActionLabel: 'Assign a staff owner to each block',
          recommendedActionType: 'meeting_item',
          recommendedOwnerRole: 'coaching',
          visibility: 'staff_only',
          dedupeKey: `practice_block_no_owner:${p.id}`,
        });
      }
      return out;
    },
  },

  // ---------------------------------------------------------------------------
  // STATS / POSTGAME
  // ---------------------------------------------------------------------------
  {
    id: 'official_stats_missing',
    condition: 'A completed game older than the grace window has no official stats imported.',
    sourceTypes: ['baseball_games', 'baseball_import_runs'],
    severity: 'warning',
    ownerRole: 'operations',
    category: 'import_quality',
    actionTemplate: 'import_review',
    visibility: 'staff_only',
    evaluate(facts, cfg) {
      const out: RuleSignal[] = [];
      for (const g of facts.recentGames) {
        if (g.hasOfficialStats) continue;
        const ageHours = hoursBetween(g.playedAt, facts.nowIso);
        if (ageHours < cfg.officialStatsGraceHours) continue; // still in grace window
        out.push({
          ruleId: 'official_stats_missing',
          signalType: 'official_stats_missing',
          category: 'import_quality',
          severity: 'warning',
          playerId: null,
          eventId: g.id,
          title: `Official stats missing: ${g.label}`,
          whyItMatters: `"${g.label}" was played ${Math.floor(
            ageHours / 24,
          )} day(s) ago but no official box score has been imported. Player trends will be stale until it lands.`,
          evidence: `played ${g.playedAt} · no official import`,
          sourceRefs: [ref('baseball_games', g.id, g.label, 'team')],
          confidence: 1,
          recommendedActionLabel: 'Import the official box score',
          recommendedActionType: 'import_review',
          recommendedOwnerRole: 'operations',
          visibility: 'staff_only',
          dedupeKey: `official_stats_missing:${g.id}`,
        });
      }
      return out;
    },
  },

  {
    id: 'postgame_review_needed',
    condition: 'A game with imported stats has no postgame review filed.',
    sourceTypes: ['baseball_games', 'baseball_postgame_reviews'],
    severity: 'info',
    ownerRole: 'coaching',
    category: 'practice',
    actionTemplate: 'meeting_item',
    visibility: 'staff_only',
    evaluate(facts) {
      const out: RuleSignal[] = [];
      for (const g of facts.recentGames) {
        // A review only makes sense once the stats exist to review.
        if (!g.hasOfficialStats || g.hasPostgameReview) continue;
        out.push({
          ruleId: 'postgame_review_needed',
          signalType: 'postgame_review_needed',
          category: 'practice',
          severity: 'info',
          playerId: null,
          eventId: g.id,
          title: `Postgame review needed: ${g.label}`,
          whyItMatters: `"${g.label}" has official stats but no postgame review. Capture takeaways while they are fresh.`,
          evidence: `stats present · no review`,
          sourceRefs: [ref('baseball_games', g.id, g.label, 'team')],
          confidence: 1,
          recommendedActionLabel: 'Write the postgame review',
          recommendedActionType: 'meeting_item',
          recommendedOwnerRole: 'coaching',
          visibility: 'staff_only',
          dedupeKey: `postgame_review_needed:${g.id}`,
        });
      }
      return out;
    },
  },

  // ---------------------------------------------------------------------------
  // RECRUITING / SHOWCASE  (gated on recruiting opt-in — never nag a college
  // player or an un-activated player about a recruiting profile)
  // ---------------------------------------------------------------------------
  {
    id: 'profile_incomplete',
    condition: 'A recruiting-active player has an incomplete showcase profile.',
    sourceTypes: ['baseball_players', 'baseball_showcase_profiles'],
    severity: 'info',
    ownerRole: 'recruiting',
    category: 'recruiting',
    actionTemplate: 'player_task',
    visibility: 'player_only',
    evaluate(facts, cfg) {
      const out: RuleSignal[] = [];
      for (const p of facts.players) {
        if (!p.recruitingActive) continue; // opt-in gate (CLAUDE.md model)
        if (p.profileFieldsTotal <= 0) continue;
        const ratio = p.profileFieldsPresent / p.profileFieldsTotal;
        if (ratio >= cfg.profileCompletenessFloor) continue;
        out.push({
          ruleId: 'profile_incomplete',
          signalType: 'profile_incomplete',
          category: 'recruiting',
          severity: 'info',
          playerId: p.id,
          eventId: null,
          title: `Profile ${Math.round(ratio * 100)}% complete: ${p.fullName}`,
          whyItMatters: `${p.fullName}'s showcase profile is ${Math.round(
            ratio * 100,
          )}% complete (${p.profileFieldsPresent}/${p.profileFieldsTotal} fields). Incomplete profiles surface lower to recruiters.`,
          evidence: `${p.profileFieldsPresent}/${p.profileFieldsTotal} profile fields`,
          sourceRefs: [ref('baseball_players', p.id, p.fullName, 'player_only')],
          confidence: 1,
          recommendedActionLabel: 'Complete the recruiting profile',
          recommendedActionType: 'player_task',
          recommendedOwnerRole: 'recruiting',
          // Player-actionable → player_only (the player owns finishing it).
          visibility: 'player_only',
          dedupeKey: `profile_incomplete:${p.id}`,
        });
      }
      return out;
    },
  },

  {
    id: 'missing_video',
    condition: 'A recruiting-active player has no linked video.',
    sourceTypes: ['baseball_players', 'baseball_video_links'],
    severity: 'info',
    ownerRole: 'recruiting',
    category: 'video_evidence',
    actionTemplate: 'video_request',
    visibility: 'player_only',
    evaluate(facts) {
      const out: RuleSignal[] = [];
      for (const p of facts.players) {
        if (!p.recruitingActive) continue;
        if (p.hasVideo) continue;
        out.push({
          ruleId: 'missing_video',
          signalType: 'missing_video',
          category: 'video_evidence',
          severity: 'info',
          playerId: p.id,
          eventId: null,
          title: `No video on file: ${p.fullName}`,
          whyItMatters: `${p.fullName} is recruiting-active but has no linked video. Recruiters expect at least a swing/bullpen clip.`,
          evidence: 'no linked video',
          sourceRefs: [ref('baseball_players', p.id, p.fullName, 'player_only')],
          confidence: 1,
          recommendedActionLabel: 'Request or attach a video clip',
          recommendedActionType: 'video_request',
          recommendedOwnerRole: 'recruiting',
          visibility: 'player_only',
          dedupeKey: `missing_video:${p.id}`,
        });
      }
      return out;
    },
  },

  // ---------------------------------------------------------------------------
  // AI HYGIENE
  // ---------------------------------------------------------------------------
  {
    id: 'ai_output_stale',
    condition: 'The CoachHelm engine has not generated for the team in a long time.',
    sourceTypes: ['baseball_coach_insights'],
    severity: 'info',
    ownerRole: 'coaching',
    category: 'operations',
    actionTemplate: 'meeting_item',
    visibility: 'staff_only',
    evaluate(facts, cfg) {
      const last = facts.ai.lastGeneratedAt;
      // Never generated is NOT "stale" (it's "never run") — surfaced elsewhere
      // (empty-state on the engine surface), so we only fire when there IS a
      // prior run that has since aged out.
      if (!last) return [];
      const ageHours = hoursBetween(last, facts.nowIso);
      if (ageHours < cfg.aiStaleHours) return [];
      const ageDays = Math.floor(ageHours / 24);
      return [
        {
          ruleId: 'ai_output_stale',
          signalType: 'ai_output_stale',
          category: 'operations',
          severity: 'info',
          playerId: null,
          eventId: null,
          title: `CoachHelm insights are ${ageDays} days old`,
          whyItMatters: `The engine last generated ${ageDays} days ago. Re-run it so the Daily Brief and Signal Inbox reflect recent games.`,
          evidence: `last generated ${last}`,
          sourceRefs: [ref('baseball_coach_insights', null, 'Last engine run', 'staff_only')],
          confidence: 1,
          recommendedActionLabel: 'Re-run the CoachHelm engine',
          recommendedActionType: 'meeting_item',
          recommendedOwnerRole: 'coaching',
          visibility: 'staff_only',
          dedupeKey: `ai_output_stale:team`,
        },
      ];
    },
  },
];

// =============================================================================
// THE EVALUATOR — run every rule over one facts snapshot.
// =============================================================================

export interface RuleEngineResult {
  signals: RuleSignal[];
  /** Distinct dedupe keys emitted (so the action layer can reconcile stale rows). */
  emittedKeys: Set<string>;
  /** Count per rule id (telemetry for the run summary). */
  byRule: Record<string, number>;
}

/**
 * Run the operational rule engine. Pure + deterministic given the facts +
 * config (nowIso is part of facts, so tests pin time). A rule that throws is
 * isolated so one bad rule never poisons the whole run.
 */
export function runOperationalRuleEngine(
  facts: OperationalRuleFacts,
  config: Partial<RuleEngineConfig> = {},
  rules: readonly OperationalRule[] = OPERATIONAL_RULES,
): RuleEngineResult {
  const cfg: RuleEngineConfig = { ...DEFAULT_RULE_ENGINE_CONFIG, ...config };
  const signals: RuleSignal[] = [];
  const byRule: Record<string, number> = {};

  for (const rule of rules) {
    let emitted: RuleSignal[] = [];
    try {
      emitted = rule.evaluate(facts, cfg);
    } catch {
      emitted = []; // isolate a misbehaving rule; never crash the sweep
    }
    for (const s of emitted) {
      // Normalize confidence defensively (a rule could miscompute).
      s.confidence = clampConfidence(s.confidence);
      signals.push(s);
    }
    byRule[rule.id] = emitted.length;
  }

  // Stable order: critical → warning → info, then by title (deterministic UI).
  const sevRank: Record<BaseballSignalSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  signals.sort((a, b) => {
    const s = sevRank[a.severity] - sevRank[b.severity];
    if (s !== 0) return s;
    return a.title.localeCompare(b.title);
  });

  const emittedKeys = new Set(signals.map((s) => s.dedupeKey));
  return { signals, emittedKeys, byRule };
}

/**
 * Normalize a display name to a comparison key for duplicate detection. Mirrors
 * the import matcher's normalization (lowercase, strip punctuation + suffixes)
 * so a duplicate flagged here is the same equivalence the importer would hit.
 */
export function normalizedNameKey(first: string | null, last: string | null): string {
  const raw = `${first ?? ''} ${last ?? ''}`.trim().toLowerCase();
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[.,'-]/g, '')
    .replace(/\b(jr|sr|iii|ii|iv)\b/g, '')
    .trim();
}
