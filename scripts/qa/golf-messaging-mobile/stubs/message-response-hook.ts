export function useGolfMessageResponses() {
  return {
    getFor: () => ({ counts: {}, mine: null, total: 0 }),
    respond: async () => undefined,
  };
}
