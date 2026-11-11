/**
 * CoachHelm chat: the one list of what the assistant can put on screen (the studio's component set).
 *
 * The assistant never invents interface. It fills a typed schema, the server fills every figure from the reads, and a
 * fixed set of components draws the result. This file is the list both sides are held to:
 *
 *   the schema side (this folder, the tools, the engine)   every kind of thing a tool or the engine can emit is
 *                                                          claimed by exactly one studio kind here
 *                                                          (`__tests__/studio-kinds.test.ts`);
 *   the component side (`src/clubhouse/screens/coachhelm/chat/studio/**`, CAPABILITIES)   its registry has exactly
 *                                                          these keys, one component each, in full and compact sizes.
 *
 * A schema kind is named by where it comes from:
 *   `block:<type>`      a block of a `show_visual` composition, as resolved (`ResolvedBlock`, composition.ts)
 *   `scene:<kind>`      a `show_visual` scene (`VisualSceneKind`, schema.ts)
 *   `part:<data-type>`  a UI part a tool or the engine emits beside the text
 *   `read:<tool>`       a read's evidence, drawn from its envelope by the form the catalogue gives it
 *
 * Adding a schema kind means naming the component that draws it here, in the same change. A form with no component
 * worth its place is taken out of what the model can ask for, and `table` draws anything that is left.
 */
export interface StudioKind {
  /** The component's key in the renderer's registry. */
  kind: string;
  /** What a coach sees, in a few words. */
  draws: string;
  /** Every schema kind this component draws. */
  schema: readonly string[];
}

export const STUDIO_KINDS = [
  { kind: 'figure', draws: 'One figure set large, or up to six beside each other, each with its window and sample', schema: ['block:headline', 'block:kpis', 'read:get_season'] },
  { kind: 'comparison', draws: 'Players across the same measures, the best in each marked', schema: ['block:compare', 'read:get_player_stats'] },
  { kind: 'ranking', draws: 'Players ranked on one measure, with a bar and the sample', schema: ['block:ranking', 'read:get_team_stats'] },
  { kind: 'trend', draws: 'One measure round by round, with its reference line', schema: ['block:trend', 'block:season_compare'] },
  { kind: 'round', draws: 'A round as the scorecard shows it, hole by hole', schema: ['block:hole_strip', 'read:get_round', 'read:get_rounds'] },
  { kind: 'strokes_gained', draws: 'Strokes gained by part of the game, gain to the right and loss to the left', schema: ['block:split', 'scene:sg_anatomy'] },
  { kind: 'distance_profile', draws: 'Make rate or feet left by distance band, each with its attempts; where the misses go', schema: ['block:bands', 'block:putt_profile', 'block:miss_pattern', 'read:get_shots'] },
  { kind: 'schedule', draws: 'Days with their events, replies in, class conflicts and trips', schema: ['read:get_schedule'] },
  { kind: 'qualifier_board', draws: 'A qualifier’s board with the cut drawn between rows', schema: ['read:get_qualifiers', 'read:get_tournaments'] },
  { kind: 'practice_plan', draws: 'A practice plan as a run sheet, and the questions asked before one is drafted', schema: ['part:data-practice-plan', 'part:data-brief', 'read:get_practice'] },
  { kind: 'document', draws: 'A long piece kept beside the chat, and a draft handed to Messages', schema: ['part:data-artifact', 'part:data-handoff'] },
  { kind: 'app_link', draws: 'A way into a screen of the app', schema: ['part:data-app-link'] },
  { kind: 'note', draws: 'One sentence about a visual, or a standing note the coach asked to keep', schema: ['block:note', 'part:data-coach-note', 'read:get_coachhelm', 'read:get_reference'] },
  { kind: 'action_preview', draws: 'What a task will do, to check, edit, confirm or dismiss', schema: ['part:data-action-proposal'] },
  { kind: 'receipt', draws: 'What a task did, with the way to the thing it made', schema: ['part:data-action-receipt'] },
  { kind: 'table', draws: 'Rows and columns with a caption that names the source: the fallback, always available', schema: ['block:table', 'part:data-evidence', 'read:query_team_data', 'read:summarise_data', 'read:find_thread'] },
] as const satisfies readonly StudioKind[];

export type StudioKindName = (typeof STUDIO_KINDS)[number]['kind'];

/** The component a schema kind is drawn by, or null when nothing claims it (the test fails before that ships). */
export function studioKindOf(schemaKind: string): StudioKindName | null {
  return STUDIO_KINDS.find((k) => (k.schema as readonly string[]).includes(schemaKind))?.kind ?? null;
}

/** Parts that carry no component of their own: the work line, the turn's bookkeeping, a failed turn's sentence, a player's allowance running out. They are the shell's. */
export const SHELL_PARTS = ['data-progress', 'data-turn-meta', 'data-turn-incomplete', 'data-allowance'] as const;
/** Parts that only hold other kinds: a composition is drawn block by block (`block:*`), a visual artifact as its scene (`scene:*`). */
export const CONTAINER_PARTS = ['data-visual-composition', 'data-visual-artifact'] as const;

/**
 * Blocks the model may still ask `show_visual` for. A resolved block type that is not here is drawn only for
 * conversations stored before it was withdrawn. `table` is added to the model's choices in the same change that
 * gives the renderer its case (CONTRACT_NOTES, PLANS P12).
 */
export const PLANNED_BLOCKS = ['table'] as const;
