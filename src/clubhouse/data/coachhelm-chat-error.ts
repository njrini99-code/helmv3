/**
 * The sentences Ask CoachHelm shows when an answer fails (Clubhouse P013).
 *
 * A copy of `describeChatError` from PR #2105 (branch agent/coachhelm-chat-errors,
 * `src/lib/coachhelm/v3/chat/error-message.ts`), which is not merged. Once #2105 is on
 * main, import it from `@/lib/coachhelm/v3/chat/error-message` and delete this file:
 * the mapping and its tests must stay identical until then. Pure and client-safe.
 *
 * `POST /api/coachhelm/v3/chat/stream` refuses a request with a JSON body
 * (`{"error": "..."}`) and a status code, before any stream exists. The AI SDK
 * turns that into an `APICallError` whose `message` IS the raw body, so the raw
 * JSON must never be printed. Two different failures reach `useChat`'s `error`:
 *
 *   - A REFUSAL carries a numeric `statusCode` and the raw `responseBody`: mapped by status.
 *   - A STREAM FAULT arrives inside a 200 response as an `error` chunk (a plain
 *     `Error(chunk.errorText)` with no `statusCode`): the server already wrote a sentence
 *     a coach can act on ("AI features are unavailable: ..."), so it is kept as it is.
 *
 * The shape is read structurally, not with `APICallError.isInstance`, because
 * `src/types/ai-shim.d.ts` shadows the SDK's types.
 */

/** What the failed answer's notice offers, so a button never promises a retry that cannot work. */
export type ChatErrorRecovery =
  /** The same request may succeed: offer "Try again". */
  | 'retry'
  /** The conversation itself is gone; retrying it fails forever: offer a new chat. */
  | 'new-chat'
  /** Nothing the coach presses will change the outcome (a daily limit, the wrong role). */
  | 'none';

export interface ChatErrorNotice {
  message: string;
  recovery: ChatErrorRecovery;
}

export const CHAT_ERROR_RATE_LIMIT = "You're asking quickly. Wait a moment, then try again.";
export const CHAT_ERROR_CONVERSATION_GONE = "That conversation isn't available. Start a new chat.";
export const CHAT_ERROR_SIGNED_OUT = 'Your session ended. Sign in again, then retry.';
export const CHAT_ERROR_NOT_A_COACH = 'Ask CoachHelm is for coaches.';
export const CHAT_ERROR_GENERIC = 'Something went wrong while answering. Try again.';
/** The pre-existing fallback for an error that carries no text at all. */
export const CHAT_ERROR_EMPTY = 'That answer did not come through.';

/** The body text `route.ts` sends for a conversation id that is not the coach's (or not there). */
const CONVERSATION_NOT_FOUND = 'Conversation not found';

/** The refusal's JSON body, when it is one. Anything else is null, never thrown. */
function parseRefusalBody(responseBody: unknown): { error?: string; reason?: string } | null {
  if (typeof responseBody !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(responseBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const { error, reason } = parsed as Record<string, unknown>;
    return {
      error: typeof error === 'string' ? error : undefined,
      reason: typeof reason === 'string' ? reason : undefined,
    };
  } catch {
    return null;
  }
}

function describeRefusal(status: number, responseBody: unknown): ChatErrorNotice {
  const body = parseRefusalBody(responseBody);

  if (status === 429) {
    // Two different 429s. The daily-budget gate names WHY (`reason`) and its `error` is already a
    // sentence written for the coach, including "Contact support: this is not something waiting
    // will fix", which no generic line could stand in for. The per-coach rate limit sends only `error`.
    if (body?.reason && body.error?.trim()) {
      return { message: body.error.trim(), recovery: 'none' };
    }
    return { message: CHAT_ERROR_RATE_LIMIT, recovery: 'retry' };
  }

  if (status === 404) {
    // `CoachContextError` also answers 404 ("No active team for this coach"), which a new chat does
    // not fix. Only a lost conversation gets that advice.
    if (body?.error === CONVERSATION_NOT_FOUND) {
      return { message: CHAT_ERROR_CONVERSATION_GONE, recovery: 'new-chat' };
    }
    return { message: CHAT_ERROR_GENERIC, recovery: 'retry' };
  }

  if (status === 401) return { message: CHAT_ERROR_SIGNED_OUT, recovery: 'retry' };
  if (status === 403) return { message: CHAT_ERROR_NOT_A_COACH, recovery: 'none' };

  // 400, 500 and anything a proxy adds (a 502/504 page is HTML, never for a coach).
  return { message: CHAT_ERROR_GENERIC, recovery: 'retry' };
}

/** `fetch` rejecting before any response: Chrome, Firefox and Safari each word it differently. */
const NETWORK_FAILURE = /failed to fetch|load failed|networkerror|network request failed/i;

export function describeChatError(error: unknown): ChatErrorNotice {
  const { statusCode, responseBody } = (error ?? {}) as { statusCode?: unknown; responseBody?: unknown };
  if (typeof statusCode === 'number') return describeRefusal(statusCode, responseBody);

  const text =
    typeof (error as { message?: unknown } | null)?.message === 'string' ? (error as { message: string }).message.trim() : '';
  if (!text) return { message: CHAT_ERROR_EMPTY, recovery: 'retry' };

  // Never show a browser's own wording for a dropped connection, or a JSON body that reached us
  // without its status (a wrapper that flattened the error).
  if (NETWORK_FAILURE.test(text) || text.startsWith('{')) {
    return { message: CHAT_ERROR_GENERIC, recovery: 'retry' };
  }

  // A stream fault: the server's own provider sentence.
  return { message: text, recovery: 'retry' };
}
