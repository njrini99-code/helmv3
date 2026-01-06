import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU5MzA4NjgsImV4cCI6MjA1MTUwNjg2OH0.dhzy2WLw-kHnT0et1vWwWoJNjLjy0iweoqdaBWXOc3M'
);

const { data, error } = await supabase
  .from('golf_events')
  .select('id, title, start_date, start_time, end_time, event_type')
  .order('start_date', { ascending: true })
  .limit(30);

if (error) {
  console.error('Error:', error);
} else {
  console.log('\nEvents in database:\n');
  let missingCount = 0;
  let hasTimeCount = 0;

  data?.forEach(event => {
    const hasTime = event.start_time && event.end_time;
    const icon = hasTime ? '✅' : '❌';

    if (!hasTime) missingCount++;
    else hasTimeCount++;

    console.log(`${icon} ${event.title}`);
    console.log(`   Date: ${event.start_date}, Start: ${event.start_time || 'NULL'}, End: ${event.end_time || 'NULL'}`);
    console.log();
  });

  console.log(`\n📊 Summary: ${hasTimeCount} events with times, ${missingCount} events missing times\n`);
}
