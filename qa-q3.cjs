const fs=require('fs');
for (const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');}
const {createClient}=require('@supabase/supabase-js');
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
 const [tab,col,val,sel]=process.argv.slice(2);
 const {data,error}=await sb.from(tab).select(sel||'*').eq(col,val);
 console.log(tab,error&&error.message,JSON.stringify(data,null,0).slice(0,1500));
})();
