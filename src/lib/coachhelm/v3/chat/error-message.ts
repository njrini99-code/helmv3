/**
 * ============================================================================
 * CoachHelm chat — what a coach reads when a request fails
 * ----------------------------------------------------------------------------
 * `POST /api/coachhelm/v3/chat/stream` refuses a request with a JSON body
 * (`{"error": "..."}`) and a status code, before any stream exists. The AI SDK
 * turns that into an `APICallError` whose `message` IS the raw body
 * (`createUIApiCallError`: `message: responseBody || fallbackMessage`), so the
 * chat used to print `{"error":"Too many requests. Please slow down."}` in the
 * coach's face while its own comment said the server's sentence was shown.
 *
 * Two different failures reach `useChat`'s `error`, and they must not be
 * treated alike:
 *
 *   · A REFUSAL carries a numeric `statusCode` and the raw `responseBody`.
 *     Map it here, by status.
 *   · A STREAM FAULT arrives inside a 200 response as an `error` chunk, and the
 *     SDK raises a plain `Error(chunk.errorText)` with no `statusCode`. The
 *     server already sanitised that text into a sentence a coach can act on
 *     ("AI features are unavailable: the Anthropic account is out of credit…"),
 *     so it is kept as it is.
 *
 * The shape is read structurally, not with `APICallError.isInstance`:
 * `src/types/ai-shim.d.ts` shadows the SDK's types, so an `instanceof` here
 * would be a check the compiler cannot vouch for.
 *
 * Pure and client-safe on purpose: the page and the drawer mount the same
 * `CoachHelmChat`, and a test can drive it without a DOM.
 * ========================================================================== */

/** What the failed answer's notice offers, so a button never promises a retry that cannot work. */
export type ChatErrorRecovery =
  /** The same request may succeed — offer "Try again". */
  | 'retry'
  /** The conversation itself is gone; retrying it fails forever — offer a new chat. */
  | 'new-chat'
  /** Nothing the coach presses will change the outcome (a daily limit, the wrong role). */
  | 'none';

/** Why it failed, as the closed set the screens pick a notice by. The same list as `ChatErrorKind` in `engine/protocol.ts`. */
export type ChatFailureKind = 'offline' | 'lost' | 'model' | 'declined' | 'truncated' | 'budget' | 'off' | 'rate' | 'signed_out' | 'gone' | 'card_retry' | 'card_gone';
const FAILURE_KINDS: readonly string[] = ['offline', 'lost', 'model', 'declined', 'truncated', 'budget', 'off', 'rate', 'signed_out', 'gone', 'card_retry', 'card_gone'];

export interface ChatErrorNotice {
  message: string;
  recovery: ChatErrorRecovery;
}

/**
 * The kind of a failure, beside `describeChatError`'s sentence. The server names it (on a stream's `error` event, or as `kind` in a refused request's body);
 * where it does not (an older deployment, a proxy's page) the status decides. A failure with neither is a dropped
 * connection, which the hook has already named `offline`, `lost` or `card_retry`.
 */
export function chatErrorKind(error: unknown): ChatFailureKind {
  const { kind, statusCode, responseBody } = (error ?? {}) as { kind?: unknown; statusCode?: unknown; responseBody?: unknown };
  if (typeof kind === 'string' && FAILURE_KINDS.includes(kind)) return kind as ChatFailureKind;
  if (typeof statusCode === 'number') {
    const body = parseRefusalBody(responseBody);
    if (body?.kind && FAILURE_KINDS.includes(body.kind)) return body.kind as ChatFailureKind;
    if (statusCode === 401) return 'signed_out';
    if (statusCode === 403) return 'off';
    if (statusCode === 404) return body?.error === CONVERSATION_NOT_FOUND ? 'gone' : 'off';
    if (statusCode === 429) return body?.reason ? 'budget' : 'rate';
    return 'model';
  }
  const text = typeof (error as { message?: unknown } | null)?.message === 'string' ? (error as { message: string }).message.trim() : '';
  return !text || NETWORK_FAILURE.test(text) ? 'lost' : 'model';
}

export const CHAT_ERROR_RATE_LIMIT = "You're asking quickly. Wait a moment, then try again.";
export const CHAT_ERROR_CONVERSATION_GONE = "That conversation isn't available. Start a new chat.";
export const CHAT_ERROR_SIGNED_OUT = 'Your session ended. Sign in again, then retry.';
export const CHAT_ERROR_NOT_A_COACH = 'Ask CoachHelm is for coaches.';
export const CHAT_ERROR_HELM_OFF = 'CoachHelm is turned off for your team.';
export const CHAT_ERROR_GENERIC = 'Something went wrong while answering. Try again.';
/** The pre-existing fallback for an error that carries no text at all. */
export const CHAT_ERROR_EMPTY = 'That answer did not come through.';

/** The body text `route.ts` sends for a conversation id that is not the coach's (or not there). */
const CONVERSATION_NOT_FOUND = 'Conversation not found';
/** The body text `route.ts` sends when the CoachHelm gate is off for the coach or the team (CH13-20). */
const COACHHELM_OFF = 'CoachHelm is off for your team.';

/** The refusal's JSON body, when it is one. Anything else is null, never thrown. */
function parseRefusalBody(responseBody: unknown): { error?: string; reason?: string; kind?: string } | null {
  if (typeof responseBody !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(responseBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const { error, reason, kind } = parsed as Record<string, unknown>;
    return {
      error: typeof error === 'string' ? error : undefined,
      reason: typeof reason === 'string' ? reason : undefined,
      kind: typeof kind === 'string' ? kind : undefined,
    };
  } catch {
    return null;
  }
}

function describeRefusal(status: number, responseBody: unknown): ChatErrorNotice {
  const body = parseRefusalBody(responseBody);

  if (status === 429) {
    // Two different 429s. The daily-budget gate names WHY (`reason`) and its
    // `error` is already a sentence written for the coach — including "Contact
    // support — this is not something waiting will fix", which no generic line
    // could stand in for. The per-coach rate limit sends only `error`.
    if (body?.reason && body.error?.trim()) {
      return { message: body.error.trim(), recovery: 'none' };
    }
    return { message: CHAT_ERROR_RATE_LIMIT, recovery: 'retry' };
  }

  if (status === 404) {
    // `CoachContextError` also answers 404 ("No active team for this coach"),
    // which a new chat does not fix. Only a lost conversation gets that advice.
    if (body?.error === CONVERSATION_NOT_FOUND) {
      return { message: CHAT_ERROR_CONVERSATION_GONE, recovery: 'new-chat' };
    }
    return { message: CHAT_ERROR_GENERIC, recovery: 'retry' };
  }

  if (status === 401) return { message: CHAT_ERROR_SIGNED_OUT, recovery: 'retry' };
  if (status === 403) {
    // Two different 403s, neither fixed by pressing anything: CoachHelm switched
    // off for this coach's team (the gate), and a signed-in user who is not a
    // coach. A coach must not be told the surface is for coaches.
    if (body?.error === COACHHELM_OFF) return { message: CHAT_ERROR_HELM_OFF, recovery: 'none' };
    return { message: CHAT_ERROR_NOT_A_COACH, recovery: 'none' };
  }

  // 400, 500 and anything a proxy adds (a 502/504 page is HTML, never for a coach).
  return { message: CHAT_ERROR_GENERIC, recovery: 'retry' };
}

/** `fetch` rejecting before any response — Chrome, Firefox and Safari each word it differently. */
const NETWORK_FAILURE = /failed to fetch|load failed|networkerror|network request failed/i;

export function describeChatError(error: unknown): ChatErrorNotice {
  const { statusCode, responseBody } = (error ?? {}) as { statusCode?: unknown; responseBody?: unknown };
  if (typeof statusCode === 'number') return describeRefusal(statusCode, responseBody);

  const text = typeof (error as { message?: unknown } | null)?.message === 'string'
    ? (error as { message: string }).message.trim()
    : '';
  if (!text) return { message: CHAT_ERROR_EMPTY, recovery: 'retry' };

  // Never show a browser's own wording for a dropped connection, or a JSON body
  // that reached us without its status (a wrapper that flattened the error).
  if (NETWORK_FAILURE.test(text) || text.startsWith('{')) {
    return { message: CHAT_ERROR_GENERIC, recovery: 'retry' };
  }

  // A stream fault: the server's own provider sentence.
  return { message: text, recovery: 'retry' };
}
