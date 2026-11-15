/**
 * CoachHelm chat: `find_in_app`, the reader over the app map.
 *
 * The model asks in the coach's words ("join requests", "where do I change the tees"); the answer is the matching
 * places by name with one line on what each is for, and a link part the thread draws as a button under the answer
 * ("Open Roster"). The model never sees or writes an address: it names the place, and the button is the way there. That
 * keeps ids out of prose (a player's page has the player's id in its address) and keeps a wrong address from ever being
 * typed.
 *
 * Who is asking decides the list, not the model and not which of the two tool objects was registered: a player's
 * context only ever searches the player's places, and a player id is only ever honoured for a coach's roster.
 */
import { z } from 'zod';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { isPlayerContext, type ChatDataPart, type ReadTool, type ToolContext, type ToolResult } from '../engine/tool';
import { nowIso } from '../provenance';
import { hrefOf, placesFor, searchPlaces, type AppPlace, type AppRole } from './app-map';

/** The link the thread draws under an answer. `href` is an in-app path from the app map, never model text. */
export interface AppLinkPart extends ChatDataPart {
  type: 'data-app-link';
  id: string;
  data: { label: string; href: string; place: string };
}

const MAX_MATCHES = 4;
/** A second button only for a near tie: two buttons for every question would teach the coach to ignore them. */
const TIE_MARGIN = 1;

const result = (summary: string, extra: { parts?: ChatDataPart[]; detail?: unknown; refused?: boolean } = {}): ToolResult & { model_text: string } => ({
  summary,
  measurements: [],
  series: [],
  ...(extra.detail === undefined ? {} : { detail: extra.detail }),
  coverage: extra.refused ? 'unavailable' : 'complete',
  coverage_note: extra.refused ? summary : null,
  as_of: nowIso(),
  evidence: false,
  ...(extra.parts?.length ? { parts: extra.parts } : {}),
  model_text: summary,
});

const linkLabel = (place: AppPlace, playerName: string | null): string => (place.href.includes('{player}') && playerName ? `Open ${place.name.replace(/, a player’s /, ', ')} for ${playerName}` : `Open ${place.name}`);

export function linkPart(place: AppPlace, href: string, playerName: string | null): AppLinkPart {
  return { type: 'data-app-link', id: `app-link-${place.id}`, data: { label: linkLabel(place, playerName), href, place: place.id } };
}

async function run(ctx: ToolContext, input: { query: string; player_id?: string | null }): Promise<ToolResult> {
  const player = isPlayerContext(ctx.who);
  const role: AppRole = player ? 'player' : 'coach';
  const opts = { tournaments: isFlagEnabled('golf_tournaments_v1') };

  // A player's own pages take no id; a coach's player must be on their active roster.
  let forPlayer: { id: string; name: string } | null = null;
  if (!player && input.player_id) {
    const found = ctx.who.roster.find((p) => p.id === input.player_id);
    if (!found) return result('That player is not on your active roster.', { refused: true });
    forPlayer = { id: found.id, name: found.name };
  }

  const ranked = searchPlaces(role, input.query, opts)
    // With a player named, that player's own pages come first; without one they are still listed, and say what they need.
    .map((m) => ({ ...m, score: m.score + (forPlayer && m.place.href.includes('{player}') ? 2 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES);

  if (ranked.length === 0) {
    const main = placesFor(role, opts)
      .filter((p) => !p.tab || p.tab === 'home')
      .map((p) => p.name);
    return result(`No place in the app matches that. The main places are: ${[...new Set(main)].join(', ')}. Ask again in other words, or tell the ${player ? 'player' : 'coach'} which of these is closest.`);
  }

  const best = ranked[0]!.score;
  const parts: ChatDataPart[] = [];
  const lines = ranked.map((m, i) => {
    const href = hrefOf(m.place, forPlayer?.id ?? null);
    const linked = href !== null && m.score >= best - TIE_MARGIN && parts.length < 2;
    if (linked && href) parts.push(linkPart(m.place, href, forPlayer?.name ?? null));
    const note = href === null ? ' It opens for one player: call find_in_app again with that player’s id to link it.' : linked ? ' A button that opens it is shown under your answer.' : '';
    return `${i + 1}. ${m.place.name}: ${m.place.purpose}${note}`;
  });
  const head = ranked.length === 1 ? 'One place matches.' : `${ranked.length} places match, best first.`;
  return result(`${head}\n${lines.join('\n')}\nName the place in your answer. Do not write an address.`, {
    parts,
    detail: { places: ranked.map((m) => ({ name: m.place.name, purpose: m.place.purpose })) },
  });
}

/** For a coach: the query, and optionally one roster player whose own page is wanted. Strict-tool shape: every property required, optional as nullable. */
export const findInApp: ReadTool<{ query: string; player_id: string | null }> = {
  kind: 'read',
  name: 'find_in_app',
  description:
    'Find where something is in the app. Returns up to four matching screens with what each is for and puts a button under your answer that opens the best one. Use it when the coach asks where to find or change something, and for a dashboard or the team’s trends: that is the CoachHelm Team board, already built, so send them there and give its short read; never build a dashboard in the chat. player_id: one player’s own page, else null.',
  input: z.strictObject({
    query: z.string().min(1).max(120).describe('A few plain words: "join requests", "change the tees".'),
    player_id: z.string().uuid().nullable(),
  }),
  progress: () => 'Finding that in the app',
  run,
};

/** For a player: only the player's places, and no player id to pass. */
export const findInAppForPlayer: ReadTool<{ query: string }> = {
  kind: 'read',
  name: 'find_in_app',
  description:
    'Find where something is in the app: returns up to four matching screens with what each is for, and puts a button under your answer that opens the best match. Use it when the player asks where to find or do something.',
  input: z.strictObject({ query: z.string().min(1).max(120).describe('A few plain words: "post a round".') }),
  progress: () => 'Finding that in the app',
  run,
};
