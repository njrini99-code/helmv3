/**
 * The in-app hand-off of a question to the CoachHelm Ask page.
 *
 * The Brief tab's composer sends a question by navigating to
 * `/golf/dashboard/coachhelm/chat?q=<question>`, and the Ask page submits it so
 * the coach does not press Send twice. But `?q=` alone is just a URL: a pasted
 * link, a crawler, or a link in an email also carried it, and each auto-sent a
 * paid LLM call plus a conversation insert nobody asked for (audit DATA-15).
 *
 * The Brief tab now leaves a short-lived token in sessionStorage right before
 * it navigates. The Ask page auto-submits only when the token matches the
 * question it was handed; any other `?q=` only pre-fills the composer.
 * sessionStorage is per tab and never leaves the browser, so the token cannot
 * be forged by a link.
 */
const KEY = 'golf.coachhelm.ask-handoff';
const MAX_AGE_MS = 60_000;

export function markAskHandoff(question: string): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ q: question, at: Date.now() }));
  } catch {
    // Storage unavailable: the Ask page falls back to pre-filling.
  }
}

/** True when the Brief tab handed off exactly this question moments ago. */
export function hasAskHandoff(question: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { q?: unknown; at?: unknown };
    return (
      typeof parsed.q === 'string' &&
      parsed.q === question &&
      typeof parsed.at === 'number' &&
      Date.now() - parsed.at >= 0 &&
      Date.now() - parsed.at < MAX_AGE_MS
    );
  } catch {
    return false;
  }
}

export function clearAskHandoff(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
