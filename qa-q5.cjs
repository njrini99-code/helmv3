const fs=require('fs');
for (const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const {createClient}=require('@supabase/supabase-js');
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
 const {data,error}=await sb.from('golf_conversations').select('id,title,golf_conversation_participants(user_id)').eq('team_id','6ecdd1a6-63fe-4beb-b094-00118f334163');
 console.log(error&&error.message,JSON.stringify(data.map(c=>({id:c.id.slice(0,8),title:c.title,n:c.golf_conversation_participants.length}))));
})();
