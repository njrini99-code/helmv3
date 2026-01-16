import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const startedAt = Date.now();
  let database = 'unknown';
  let status: 'healthy' | 'degraded' = 'healthy';

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (error) {
      database = 'error';
      status = 'degraded';
    } else {
      database = 'ok';
    }
  } catch {
    database = 'error';
    status = 'degraded';
  }

  return NextResponse.json({
    status,
    database,
    timestamp: new Date().toISOString(),
    responseTimeMs: Date.now() - startedAt,
  });
}
