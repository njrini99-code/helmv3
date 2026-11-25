const fs=require('fs');
for (const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const {createClient}=require('@supabase/supabase-js');
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const tid='6ecdd1a6-63fe-4beb-b094-00118f334163';
(async()=>{
 const since=process.argv[2];
 const tabs={golf_announcements:'id,title,body,urgency,send_email,send_push,published_at,publish_at,created_at',golf_tasks:'id,title,description,due_date,assigned_to,status,created_at,task_type,priority',golf_goals:'id,player_id,title,metric_id,target_value,window_days,state,created_at',golf_travel_itineraries:'id,event_name,destination,transportation_type,departure_date,departure_time,created_at',golf_qualifiers:'id,name,start_date,created_at'};
 for (const [t,s] of Object.entries(tabs)){const {data,error}=await sb.from(t).select(s).eq('team_id',tid).gte('created_at',since);console.log(t,error&&error.message,JSON.stringify(data));}
 const {data:r}=await sb.from('golf_coachhelm_action_runs').select('id,tool_name,status,decided_at,completed_at,error_message,result').eq('team_id',tid).gte('proposed_at',since).order('proposed_at');
 console.log('runs',JSON.stringify(r.map(x=>({id:x.id.slice(0,8),tool:x.tool_name,status:x.status,err:x.error_message,sum:x.result&&x.result.summary,created:x.result&&x.result.created,notif:x.result&&x.result.notifications}))));
})();
