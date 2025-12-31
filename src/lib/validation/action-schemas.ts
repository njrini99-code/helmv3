/**
 * Validation Schemas for Server Actions
 *
 * Centralized Zod schemas for all server action inputs
 */

import { z } from 'zod';
import { CommonSchemas } from './server-action-validator';

/**
 * Player Profile Schemas
 */
export const PlayerProfileSchemas = {
  update: z.object({
    first_name: z.string().min(1).max(100).regex(/^[a-zA-Z\s\-'.]+$/).trim().optional(),
    last_name: z.string().min(1).max(100).regex(/^[a-zA-Z\s\-'.]+$/).trim().optional(),
    email: CommonSchemas.email.optional(),
    phone: CommonSchemas.phone,
    city: z.string().max(100).trim().optional().nullable(),
    state: z.string().max(50).trim().optional().nullable(),
    grad_year: z.number().int().min(2020).max(2040).optional(),
    height_feet: z.number().int().min(4).max(8).optional().nullable(),
    height_inches: z.number().int().min(0).max(11).optional().nullable(),
    weight: z.number().int().min(50).max(500).optional().nullable(),
    primary_position: z.string().max(50).optional().nullable(),
    secondary_position: z.string().max(50).optional().nullable(),
    bats: z.enum(['R', 'L', 'S']).optional().nullable(),
    throws: z.enum(['R', 'L']).optional().nullable(),
    gpa: z.number().min(0).max(5).optional().nullable(),
    about: z.string().max(5000).trim().optional().nullable(),
    avatar_url: CommonSchemas.url.optional().nullable(),
  }),

  metrics: z.object({
    exit_velocity: z.number().min(0).max(150).optional().nullable(),
    pitch_velocity: z.number().min(0).max(150).optional().nullable(),
    sixty_yard_time: z.number().min(0).max(20).optional().nullable(),
    pop_time: z.number().min(0).max(10).optional().nullable(),
  }),
};

/**
 * Coach Profile Schemas
 */
export const CoachProfileSchemas = {
  update: z.object({
    full_name: z.string().min(1).max(200).regex(/^[a-zA-Z\s\-'.]+$/).trim().optional(),
    email: CommonSchemas.email.optional(),
    phone: CommonSchemas.phone,
    title: z.string().max(100).trim().optional().nullable(),
    bio: z.string().max(5000).trim().optional().nullable(),
    avatar_url: CommonSchemas.url.optional().nullable(),
  }),
};

/**
 * Organization Schemas
 */
export const OrganizationSchemas = {
  update: z.object({
    name: z.string().min(2).max(200).trim().optional(),
    logo_url: CommonSchemas.url.optional().nullable(),
    about: z.string().max(5000).trim().optional().nullable(),
    website_url: CommonSchemas.url.optional().nullable(),
    primary_color: CommonSchemas.hexColor,
    secondary_color: CommonSchemas.hexColor,
    address: z.string().max(500).trim().optional().nullable(),
    city: z.string().max(100).trim().optional().nullable(),
    state: z.string().max(100).trim().optional().nullable(),
    zip_code: z.string().max(20).regex(/^\d{5}(-\d{4})?$/).optional().nullable(),
    phone: CommonSchemas.phone,
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
 * Video Schemas
 */
export const VideoSchemas = {
  upload: z.object({
    title: z.string().min(1).max(200).trim(),
    description: z.string().max(1000).trim().optional().nullable(),
    video_url: CommonSchemas.url,
    thumbnail_url: CommonSchemas.url.optional().nullable(),
    duration_seconds: z.number().int().min(1).max(3600).optional().nullable(),
    video_type: z.enum(['highlight', 'game', 'practice', 'skills', 'pitching', 'hitting', 'fielding', 'other']).optional(),
  }),

  createClip: z.object({
    parent_video_id: CommonSchemas.uuid,
    title: z.string().min(1).max(200).trim(),
    start_time: z.number().min(0),
    end_time: z.number().min(0),
    description: z.string().max(1000).trim().optional().nullable(),
  }).refine(
    (data) => data.end_time > data.start_time,
    'End time must be after start time'
  ),
};

/**
 * Camp Schemas
 */
export const CampSchemas = {
  create: z.object({
    name: z.string().min(1).max(200).trim(),
    description: z.string().max(5000).trim().optional().nullable(),
    start_date: z.string().datetime(),
    end_date: z.string().datetime().optional().nullable(),
    location: z.string().max(500).trim().optional().nullable(),
    capacity: z.number().int().min(1).max(1000).optional().nullable(),
    price: z.number().min(0).max(10000).optional().nullable(),
    registration_deadline: z.string().datetime().optional().nullable(),
  }).refine(
    (data) => {
      if (data.end_date) {
        return new Date(data.end_date) > new Date(data.start_date);
      }
      return true;
    },
    'End date must be after start date'
  ),

  register: z.object({
    camp_id: CommonSchemas.uuid,
    player_id: CommonSchemas.uuid,
    notes: z.string().max(1000).trim().optional().nullable(),
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

/**
 * Developmental Plan Schemas
 */
export const DevPlanSchemas = {
  create: z.object({
    player_id: CommonSchemas.uuid,
    title: z.string().min(1).max(200).trim(),
    description: z.string().max(5000).trim().optional().nullable(),
    start_date: z.string().datetime(),
    end_date: z.string().datetime().optional().nullable(),
    goals: z.array(z.object({
      title: z.string().min(1).max(200).trim(),
      description: z.string().max(1000).trim().optional().nullable(),
      target_date: z.string().datetime().optional().nullable(),
    })).min(1).max(20),
  }),

  updateProgress: z.object({
    goal_id: CommonSchemas.uuid,
    completed: z.boolean(),
    notes: z.string().max(1000).trim().optional().nullable(),
  }),
};

/**
 * Search and Filter Schemas
 */
export const SearchSchemas = {
  playerSearch: z.object({
    query: z.string().max(200).trim().optional(),
    position: z.string().max(50).optional(),
    grad_year: z.number().int().min(2020).max(2040).optional(),
    state: z.string().max(50).optional(),
    min_gpa: z.number().min(0).max(5).optional(),
    max_distance: z.number().int().min(0).max(5000).optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(100).default(50),
  }),

  collegeSearch: z.object({
    query: z.string().max(200).trim().optional(),
    division: z.string().max(50).optional(),
    state: z.string().max(50).optional(),
    conference: z.string().max(100).optional(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(100).default(50),
  }),
};

/**
 * Golf-specific Schemas
 */
export const GolfSchemas = {
  createRound: z.object({
    player_id: CommonSchemas.uuid,
    course_id: CommonSchemas.uuid,
    date: z.string().datetime(),
    round_type: z.enum(['tournament', 'qualifier', 'practice', 'casual']),
    total_score: z.number().int().min(18).max(200).optional().nullable(),
  }),

  recordHole: z.object({
    round_id: CommonSchemas.uuid,
    hole_number: z.number().int().min(1).max(18),
    strokes: z.number().int().min(1).max(15),
    putts: z.number().int().min(0).max(10).optional().nullable(),
    fairway_hit: z.boolean().optional().nullable(),
    green_in_regulation: z.boolean().optional().nullable(),
  }),
};
