const fs=require('fs');
for (const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const {createClient}=require('@supabase/supabase-js');
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const tid='6ecdd1a6-63fe-4beb-b094-00118f334163';
(async()=>{
 const {data:e,error}=await sb.from('golf_events').select('id,title,event_type,start_time,end_time,location,requires_rsvp,status,created_at,created_by').eq('team_id',tid).gte('created_at',process.argv[2]||'2026-11-08T14:00:00Z').order('created_at');
 console.log('events',error,JSON.stringify(e,null,1));
 const {data:r}=await sb.from('golf_coachhelm_action_runs').select('id,tool_name,status,decided_at,completed_at,error_message,result,partial_failures,proposed_at').eq('team_id',tid).gte('proposed_at',process.argv[2]||'2026-11-08T14:00:00Z').order('proposed_at');
 console.log('runs',JSON.stringify(r,null,1));
})();
