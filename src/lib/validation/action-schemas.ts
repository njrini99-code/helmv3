/**
 * Validation Schemas for Server Actions
 *
 * Centralized Zod schemas for all server action inputs
 */

import { z } from 'zod';
import { CommonSchemas } from './server-action-validator';

/**
 * Recruiting Schemas
 */
export const RecruitingSchemas = {
  addInterest: z.object({
    organization_id: CommonSchemas.uuid,
  }),

  removeInterest: z.object({
    organization_id: CommonSchemas.uuid,
  }),

  // Player-reported journey stage for a single school. This is an
  // intentionally separate vocabulary from `WatchlistSchemas.updateStatus`
  // (the coach-facing `baseball_pipeline_stage` DB enum documented in
  // CLAUDE.md as the only 5 valid `PipelineStage` values). The player's
  // status tracks their own self-reported progress with a school; the
  // coach's pipeline_stage tracks the coach's classification of the
  // player. They are related but not the same value, and are never
  // written to the same column.
  updateStatus: z.object({
    interest_id: CommonSchemas.uuid,
    status: z.enum(['interested', 'researching', 'contacted', 'visited', 'offered', 'committed']),
  }),
};

/**
 * Watchlist Schemas
 */
export const WatchlistSchemas = {
  add: z.object({
    coach_id: CommonSchemas.uuid,
    player_id: CommonSchemas.uuid,
    notes: z.string().max(5000).trim().optional().nullable(),
  }),

  updateStatus: z.object({
    watchlist_id: CommonSchemas.uuid,
    status: z.enum(['watchlist', 'high_priority', 'offer_extended', 'committed', 'uninterested']),
  }),

  updatePriority: z.object({
    watchlist_id: CommonSchemas.uuid,
    is_high_priority: z.boolean(),
  }),

  addNote: z.object({
    watchlist_id: CommonSchemas.uuid,
    note: z.string().min(1).max(5000).trim(),
  }),
};

/**
 * Message Schemas
 */
export const MessageSchemas = {
  send: z.object({
    conversation_id: CommonSchemas.uuid,
    content: z.string().min(1, 'Message cannot be empty').max(5000).trim(),
  }),

  createConversation: z.object({
    recipient_id: CommonSchemas.uuid,
    initial_message: z.string().min(1).max(5000).trim(),
  }),
};

/**
 * Team Schemas
 */
export const TeamSchemas = {
  invite: z.object({
    team_id: CommonSchemas.uuid,
    max_uses: z.number().int().min(1).max(1000).optional().nullable(),
    expires_at: z.string().datetime().optional().nullable(),
  }),

  join: z.object({
    invite_code: z.string().min(6).max(20).regex(/^[A-Z0-9]+$/),
    player_id: CommonSchemas.uuid,
  }),
};

