/**
 * The safe, display-only identity shape Messaging needs for people who share a
 * conversation. Keep this outside a `use server` module so the client can use
 * the type without importing server-only code.
 */
export interface GolfMessageParticipantIdentity {
  userId: string;
  /** Authorized conversations this person shares with the requesting user. */
  conversationIds: string[];
  name: string;
  subtitle: string;
  avatarUrl: string | null;
  type: 'coach' | 'player';
}
