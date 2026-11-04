import type { ChMessagesApi } from './MessagesView';

/** The directory's person for a user id. */
export const personOf = (api: ChMessagesApi, userId: string) =>
  api.directory.find((p) => p.userId === userId);
