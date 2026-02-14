#!/usr/bin/env npx tsx
/**
 * Seed Admin Events
 * 
 * Populates the admin_events table with historical data from:
 * - users table → 'signup' events
 * - golf_rounds table → 'round_submitted' events
 * - golf_round_reviews table → 'ai_generation' events
 * - error_logs table → 'error' events (if exists)
 * 
 * Run: npx tsx scripts/seed-admin-events.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local first, then .env as fallback
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

// ============================================
// SETUP
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================
// HELPERS
// ============================================

interface AdminEventInsert {
  event_type: string;
  title: string;
  severity: string;
  message?: string | null;
  metadata?: Record<string, unknown>;
  user_id?: string | null;
  user_email?: string | null;
  created_at?: string;
}

async function insertEvents(events: AdminEventInsert[]): Promise<number> {
  if (events.length === 0) return 0;

  // Insert in batches of 100
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    const { error } = await supabase.from('admin_events').insert(batch);

    if (error) {
      console.error(`  ⚠️  Batch insert error:`, error.message);
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
}

// ============================================
// SEED FUNCTIONS
// ============================================

async function seedSignupEvents(): Promise<number> {
  console.log('\n📝 Seeding signup events from users table...');

  // Get recent users (last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, role, created_at')
    .gte('created_at', ninetyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('  ❌ Error fetching users:', error.message);
    return 0;
  }

  if (!users || users.length === 0) {
    console.log('  ℹ️  No recent users found');
    return 0;
  }

  console.log(`  Found ${users.length} users`);

  const events: AdminEventInsert[] = users.map((user) => ({
    event_type: 'signup',
    title: `New ${user.role || 'user'} signed up`,
    severity: 'info',
    message: `${user.email} registered as ${user.role || 'user'}`,
    user_id: user.id,
    user_email: user.email,
    metadata: { role: user.role },
    created_at: user.created_at,
  }));

  const inserted = await insertEvents(events);
  console.log(`  ✅ Inserted ${inserted} signup events`);
  return inserted;
}

async function seedRoundEvents(): Promise<number> {
  console.log('\n⛳ Seeding round_submitted events from golf_rounds table...');

  // Get recent rounds (last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: rounds, error } = await supabase
    .from('golf_rounds')
    .select(`
      id,
      player_id,
      course_name,
      total_score,
      score_to_par,
      round_type,
      status,
      created_at,
      golf_players (
        user_id,
        users (
          email
        )
      )
    `)
    .gte('created_at', ninetyDaysAgo.toISOString())
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('  ❌ Error fetching rounds:', error.message);
    return 0;
  }

  if (!rounds || rounds.length === 0) {
    console.log('  ℹ️  No recent rounds found');
    return 0;
  }

  console.log(`  Found ${rounds.length} rounds`);

  const events: AdminEventInsert[] = rounds.map((round) => {
    // Handle nested relationships safely
    const player = round.golf_players as { user_id?: string; users?: { email?: string } } | null;
    const userId = player?.user_id || null;
    const userEmail = player?.users?.email || null;

    const scoreDisplay = round.score_to_par !== null
      ? (round.score_to_par > 0 ? `+${round.score_to_par}` : round.score_to_par === 0 ? 'E' : round.score_to_par.toString())
      : round.total_score?.toString() || 'N/A';

    return {
      event_type: 'round_submitted',
      title: 'Round submitted',
      severity: 'info',
      message: `${round.course_name || 'Unknown course'} - ${scoreDisplay}`,
      user_id: userId,
      user_email: userEmail,
      metadata: {
        roundId: round.id,
        courseName: round.course_name,
        totalScore: round.total_score,
        scoreToPar: round.score_to_par,
        roundType: round.round_type,
      },
      created_at: round.created_at,
    };
  });

  const inserted = await insertEvents(events);
  console.log(`  ✅ Inserted ${inserted} round_submitted events`);
  return inserted;
}

async function seedAIGenerationEvents(): Promise<number> {
  console.log('\n🤖 Seeding ai_generation events from golf_round_reviews table...');

  // Get recent AI reviews (last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: reviews, error } = await supabase
    .from('golf_round_reviews')
    .select(`
      id,
      round_id,
      created_at,
      golf_rounds (
        player_id,
        course_name,
        golf_players (
          user_id,
          users (
            email
          )
        )
      )
    `)
    .gte('created_at', ninetyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('  ❌ Error fetching reviews:', error.message);
    return 0;
  }

  if (!reviews || reviews.length === 0) {
    console.log('  ℹ️  No recent AI reviews found');
    return 0;
  }

  console.log(`  Found ${reviews.length} AI reviews`);

  const events: AdminEventInsert[] = reviews.map((review) => {
    // Handle nested relationships safely
    const round = review.golf_rounds as {
      player_id?: string;
      course_name?: string;
      golf_players?: { user_id?: string; users?: { email?: string } };
    } | null;
    const player = round?.golf_players || null;
    const userId = player?.user_id || null;
    const userEmail = player?.users?.email || null;

    return {
      event_type: 'ai_generation',
      title: 'AI round review completed',
      severity: 'info',
      message: `Review generated for round at ${round?.course_name || 'Unknown course'}`,
      user_id: userId,
      user_email: userEmail,
      metadata: {
        reviewId: review.id,
        roundId: review.round_id,
        generationType: 'round_review',
        success: true,
      },
      created_at: review.created_at,
    };
  });

  const inserted = await insertEvents(events);
  console.log(`  ✅ Inserted ${inserted} ai_generation events`);
  return inserted;
}

async function seedErrorEvents(): Promise<number> {
  console.log('\n🚨 Seeding error events from error_logs table...');

  // Check if error_logs table exists
  const { data: tables } = await supabase
    .from('information_schema.tables' as unknown as 'users')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'error_logs')
    .limit(1);

  // Try admin_client_errors as fallback
  const { data: clientErrors, error: clientError } = await supabase
    .from('admin_client_errors')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (clientError) {
    console.log('  ℹ️  No error_logs or admin_client_errors table found, skipping');
    return 0;
  }

  if (!clientErrors || clientErrors.length === 0) {
    console.log('  ℹ️  No recent errors found');
    return 0;
  }

  console.log(`  Found ${clientErrors.length} client errors`);

  const events: AdminEventInsert[] = clientErrors.map((err) => ({
    event_type: 'error',
    title: `Client Error: ${(err.error_message || 'Unknown error').slice(0, 100)}`,
    severity: 'error',
    message: err.error_message,
    metadata: {
      source: 'client',
      pageUrl: err.page_url,
      userAgent: err.user_agent,
    },
    user_id: err.user_id || null,
    stack_trace: err.error_stack,
    created_at: err.created_at,
  }));

  const inserted = await insertEvents(events);
  console.log(`  ✅ Inserted ${inserted} error events`);
  return inserted;
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🌱 Starting admin_events seed...\n');
  console.log('═'.repeat(50));

  let totalInserted = 0;

  try {
    // Check if admin_events table exists
    const { error: tableCheck } = await supabase
      .from('admin_events')
      .select('id')
      .limit(1);

    if (tableCheck) {
      console.error('❌ admin_events table does not exist or is not accessible');
      console.error('   Error:', tableCheck.message);
      process.exit(1);
    }

    totalInserted += await seedSignupEvents();
    totalInserted += await seedRoundEvents();
    totalInserted += await seedAIGenerationEvents();
    totalInserted += await seedErrorEvents();

    console.log('\n' + '═'.repeat(50));
    console.log(`\n✨ Seed complete! Inserted ${totalInserted} total events.`);

  } catch (err) {
    console.error('\n❌ Unexpected error:', err);
    process.exit(1);
  }
}

main();
