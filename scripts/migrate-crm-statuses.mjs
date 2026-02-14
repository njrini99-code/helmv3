#!/usr/bin/env node

/**
 * Migrate CRM coach statuses from 15 statuses to 5 simplified statuses:
 * 
 * OLD -> NEW mapping:
 * - new_lead -> new_lead
 * - researching -> new_lead
 * - outreach_pending -> new_lead
 * - initial_contact -> contacted
 * - follow_up -> contacted
 * - engaged -> contacted
 * - demo_scheduled -> demo_scheduled
 * - demo_completed -> demo_scheduled
 * - proposal_sent -> demo_scheduled
 * - negotiating -> demo_scheduled
 * - closed_won -> customer
 * - closed_lost -> closed
 * - not_interested -> closed
 * - bad_timing -> closed
 * - nurture -> new_lead
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const STATUS_MAPPING = {
  // Keep as-is
  'new_lead': 'new_lead',
  'contacted': 'contacted',
  'demo_scheduled': 'demo_scheduled',
  'customer': 'customer',
  'closed': 'closed',
  
  // Map old statuses to new
  'researching': 'new_lead',
  'outreach_pending': 'new_lead',
  'initial_contact': 'contacted',
  'follow_up': 'contacted',
  'engaged': 'contacted',
  'demo_completed': 'demo_scheduled',
  'proposal_sent': 'demo_scheduled',
  'negotiating': 'demo_scheduled',
  'closed_won': 'customer',
  'closed_lost': 'closed',
  'not_interested': 'closed',
  'bad_timing': 'closed',
  'nurture': 'new_lead',
};

async function migrateStatuses() {
  console.log('Starting CRM status migration...\n');
  
  // Get all coaches
  const { data: coaches, error } = await supabase
    .from('crm_coaches')
    .select('id, status');
  
  if (error) {
    console.error('Failed to fetch coaches:', error.message);
    process.exit(1);
  }
  
  console.log(`Found ${coaches.length} coaches to check\n`);
  
  let updatedCount = 0;
  let skippedCount = 0;
  
  for (const coach of coaches) {
    const oldStatus = coach.status;
    const newStatus = STATUS_MAPPING[oldStatus];
    
    if (!newStatus) {
      console.log(`⚠️  Unknown status "${oldStatus}" for coach ${coach.id}`);
      skippedCount++;
      continue;
    }
    
    if (oldStatus !== newStatus) {
      const { error: updateError } = await supabase
        .from('crm_coaches')
        .update({ status: newStatus })
        .eq('id', coach.id);
      
      if (updateError) {
        console.error(`Failed to update coach ${coach.id}:`, updateError.message);
        skippedCount++;
      } else {
        console.log(`✓ ${oldStatus} -> ${newStatus}`);
        updatedCount++;
      }
    } else {
      skippedCount++;
    }
  }
  
  console.log(`\n✅ Migration complete!`);
  console.log(`   Updated: ${updatedCount}`);
  console.log(`   Skipped/unchanged: ${skippedCount}`);
}

migrateStatuses().catch(console.error);
