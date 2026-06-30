export type AiResult =
  | { ok: true; text: string; generatedAt: string; stale?: boolean }
  | { ok: false; error: string; staleText?: string };

export type AiViewState =
  | { state: 'fresh_insight'; text: string; generatedAt: string }
  | { state: 'unavailable'; message: string; staleText?: string }
  | { state: 'stale_insight'; text: string; generatedAt: string };

export function mapAiResultState(result: AiResult): AiViewState {
  if (!result.ok) {
    return {
      state: 'unavailable',
      message: result.error || 'CoachHelm is unavailable.',
      staleText: result.staleText,
    };
  }
  if (result.stale) {
    return { state: 'stale_insight', text: result.text, generatedAt: result.generatedAt };
  }
  return { state: 'fresh_insight', text: result.text, generatedAt: result.generatedAt };
}
