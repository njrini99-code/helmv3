const fs=require('fs');
for (const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const {createClient}=require('@supabase/supabase-js');
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
 let uid=fs.readFileSync('/private/tmp/claude-501/-Users-ricknini-Downloads-helmv3/53383e9e-e998-409c-9673-37278001fe90/scratchpad/uid.txt','utf8').trim();
 console.log('uid',uid&&uid.slice(0,8));
 const {data:co,error}=await sb.from('golf_coaches').select('*').eq('user_id',uid);
 console.log(error,co&&co.map(c=>({id:c.id,team:c.team_id,})));
 const cid=co[0].id;
 const {data:tm}=await sb.from('golf_teams').select('id,name,timezone').eq('organization_id',co[0].organization_id);console.log(JSON.stringify(tm));
 const tid=tm[0].id;
 const {data:mem}=await sb.from('golf_team_members').select('player_id').eq('team_id',tid).eq('status','active');
 const {data:p}=await sb.from('golf_players').select('id,first_name,last_name,email,user_id,phone').in('id',mem.map(m=>m.player_id));
 console.log('players',JSON.stringify(p.map(x=>[x.id.slice(0,8),x.first_name,x.last_name,x.email,!!x.user_id,!!x.phone])));
 const {data:tr}=await sb.from('golf_tournaments').select('id,name,start_date,end_date').eq('team_id',tid).order('start_date',{ascending:false}).limit(8);
 console.log('tournaments',JSON.stringify(tr));
 const {data:e}=await sb.from('golf_events').select('id,title,event_type,start_time').eq('team_id',tid).gte('start_time','2026-11-08').order('start_time').limit(10);
 console.log('events',JSON.stringify(e));
})();
