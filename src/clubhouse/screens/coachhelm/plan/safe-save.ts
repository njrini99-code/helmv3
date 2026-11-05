/** A dropped connection rejects a server action; a save or undo must still come back with an answer the card can show. */
export async function safeSave<T extends { success: boolean }>(run: () => Promise<T>): Promise<T | { success: false; error: string }> {
  try {
    return await run();
  } catch {
    return { success: false, error: 'Couldn’t save. Try again.' };
  }
}
