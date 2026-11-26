// Reads the design page's computed styles for every capture state, light and dark. Output: extract.json
const {chromium}=require(process.env.PW);const fs=require('fs');
const FRAME=id=>({ask:'#phA',desk:'#dAwrap',fmt:'#phF',bld:'#phB',bldd:'#dB',ply:'#phC'}[id.split('-')[0]]);
(async()=>{
const b=await chromium.launch({executablePath:'/root/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1360,height:1000}});
await p.goto('file://'+__dirname+'/wrapped.html');await p.waitForTimeout(500);
const ids=process.argv[2]?process.argv[2].split(','):await p.evaluate(()=>window.PP_CAPS);const out={};
for(const id of ids)for(const th of ['light','dark']){
 await p.goto('file://'+__dirname+'/wrapped.html?n='+Math.random()+'#cap-'+id+'-'+th);
 await p.waitForFunction(()=>window.__ppReady===true,null,{timeout:45000});
 out[id+'|'+th]=await p.evaluate(sel=>{
  const fr=document.querySelector(sel);if(!fr)return null;
  const box=fr.getBoundingClientRect();
  const scale=(()=>{const d=fr.querySelector('.dscreen');if(!d)return 1;const m=getComputedStyle(d).transform;if(m==='none')return 1;return +m.split('(')[1].split(',')[0];})();
  const parse=c=>{const m=c&&c.match(/rgba?\(([^)]+)\)/);if(!m)return null;const v=m[1].split(/[ ,/]+/).filter(Boolean).map(Number);return {r:v[0],g:v[1],b:v[2],a:v[3]??1};};
  const hex=c=>'#'+[c.r,c.g,c.b].map(x=>Math.round(x).toString(16).padStart(2,'0')).join('').toUpperCase();
  const L=c=>{const f=x=>{x/=255;return x<=.03928?x/12.92:((x+.055)/1.055)**2.4};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b)};
  const over=(t,u)=>({r:t.r*t.a+u.r*(1-t.a),g:t.g*t.a+u.g*(1-t.a),b:t.b*t.a+u.b*(1-t.a),a:1});
  const bgOf=el=>{const st=[];let e=el;while(e&&e.nodeType===1){const cs=getComputedStyle(e);if(cs.backgroundImage.includes('gradient')){st.push({grad:cs.backgroundImage});break;}const c=parse(cs.backgroundColor);if(c&&c.a>0){st.push(c);if(c.a>=1)break;}e=e.parentElement;}
    let col={r:255,g:255,b:255,a:1};for(let i=st.length-1;i>=0;i--){if(st[i].grad){const m=st[i].grad.match(/rgb\([^)]+\)/g);if(m)col=parse(m[m.length-1]);continue;}col=over(st[i],col);}return col;};
  const ratio=(a,b)=>{const x=L(a),y=L(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const rows=[];const seen=new Map();
  fr.querySelectorAll('*').forEach(el=>{
   const r=el.getBoundingClientRect();if(r.width<1||r.height<1)return;
   if(r.right<box.left||r.left>box.right)return;
   const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')return;
   let op=1,e=el;while(e&&e!==fr.parentElement){op*=+getComputedStyle(e).opacity;e=e.parentElement;}if(op<.5)return;
   if(el.closest('svg')&&el.tagName!=='svg')return;
   const own=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(' ');
   const ctl=el.matches('button,a,input,[role=switch],[role=button],[data-act]');
   const surf=(parse(cs.backgroundColor)?.a>0&&cs.backgroundColor!==getComputedStyle(el.parentElement).backgroundColor)||cs.backgroundImage!=='none'||(cs.boxShadow!=='none'&&parseFloat(cs.borderRadius)>0);
   const icon=el.tagName==='svg';
   if(!own&&!ctl&&!surf&&!icon)return;
   const cls=typeof el.className==='string'?el.className.trim().split(/\s+/).filter(Boolean).slice(0,2).join('.'):(el.getAttribute('class')||'');
   const pc=el.parentElement&&typeof el.parentElement.className==='string'?el.parentElement.className.trim().split(/\s+/)[0]||el.parentElement.tagName.toLowerCase():'';
   const sig=el.tagName.toLowerCase()+(cls?'.'+cls:'')+' < '+pc;
   const fg=parse(cs.color),bg=bgOf(el);const s=scale;
   const row={sig,text:(own||el.getAttribute('aria-label')||'').slice(0,48),w:+(r.width/s).toFixed(1),h:+(r.height/s).toFixed(1),
    x:+((r.left-box.left)/s).toFixed(1),y:+((r.top-box.top)/s).toFixed(1),
    pad:[cs.paddingTop,cs.paddingRight,cs.paddingBottom,cs.paddingLeft].map(v=>parseFloat(v)).join(' '),gap:cs.gap==='normal'?'':cs.gap,
    radius:cs.borderRadius,font:own?`${parseFloat(cs.fontSize)}/${cs.lineHeight==='normal'?'n':parseFloat(cs.lineHeight).toFixed(1)} ${cs.fontWeight}`:'',
    track:cs.letterSpacing==='normal'?'':cs.letterSpacing,num:cs.fontVariantNumeric==='normal'?'':cs.fontVariantNumeric,
    fg:fg&&own?hex(over(fg,bg)):'',bg:hex(bg),cr:fg&&own?+ratio(over(fg,bg),bg).toFixed(2):null,
    shadow:cs.boxShadow==='none'?'':cs.boxShadow.slice(0,90),ctl,icon,clamp:cs.webkitLineClamp!=='none'?cs.webkitLineClamp:(cs.textOverflow==='ellipsis'?'ellipsis':''),
    stroke:icon?(cs.stroke!=='none'?cs.stroke:cs.color):''};
   if(icon){const ic=parse(cs.color);row.cr=ic?+ratio(over(ic,bg),bg).toFixed(2):null;row.fg=ic?hex(over(ic,bg)):'';}
   if(!seen.has(sig)){seen.set(sig,rows.length);rows.push({...row,n:1});}else rows[seen.get(sig)].n++;
  });
  return {frame:{w:box.width/scale,h:box.height/scale,scale},rows};
 },FRAME(id));
 process.stderr.write(id+' '+th+' '+(out[id+'|'+th]?.rows.length)+'\n');}
fs.writeFileSync(__dirname+'/extract.json',JSON.stringify(out));await b.close();})();
