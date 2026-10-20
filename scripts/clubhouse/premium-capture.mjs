/** Full synthetic state capture + axe, then WebKit reduced-motion resting screens.
 * Screenshots require human critique. This does not certify production latency or iPhone fidelity.
 * node scripts/clubhouse/premium-capture.mjs --sha <7hex> [--resume] [--base http://127.0.0.1:3100]
 */
/* global document, getComputedStyle, innerHeight */
import {chromium,webkit} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {CH_A11Y_PAGES} from './a11y.mjs';
import {shotPath,recordShot,writeGallery} from './shots.mjs';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';
const {values:options}=parseArgs({options:{base:{type:'string',default:'http://127.0.0.1:3100'},sha:{type:'string'},resume:{type:'boolean',default:false},out:{type:'string',default:'.helm/runtime/premium-audit'}}});
const root=process.cwd(), base=options.base, sha=options.sha, date=new Date().toISOString().slice(0,10);
if(!/^[a-f0-9]{7}$/.test(sha??''))throw Error('Pass --sha <7 hex> identifying the source baseline; uncommitted state is disclosed.');
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Only loopback development previews are supported.');
const sourceState=execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()?'uncommitted working tree':'committed tree';
const manifests=fs.readdirSync('config/clubhouse/pages').filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join('config/clubhouse/pages',f))));
const ids={shell:'P001',home:'P002',roster:'P003','stats-team':'P004','stats-player':'P005',calendar:'P006',messages:'P007',settings:'P008',qualifiers:'P009',hub:'P010',rounds:'P011',classes:'P012',coachhelm:'P013',recruiting:'P014',auth:'P015'};
const rows=[...CH_A11Y_PAGES,['auth','/clubhouse-preview/auth'],['auth','/clubhouse-preview/auth?screen=welcome&state=player'],...['intro','code','name','grad','account','game','photo','done','staffdone','rwho','rdetails','sent'].map(step=>['auth',`/clubhouse-preview/onboard?step=${step}`])];
const out=path.resolve(root,options.out);fs.mkdirSync(out,{recursive:true});const saved=path.join(out,'render-results.json');
const results=options.resume&&fs.existsSync(saved)?JSON.parse(fs.readFileSync(saved,'utf8')).filter(r=>!r.gap):[];
const suites=[{engine:'chromium',motion:'no-preference',rows},{engine:'webkit',motion:'reduce',rows:rows.filter(x=>!x[2]&&!x[1].includes('?'))}];
for(const suite of suites){const browser=await({chromium,webkit}[suite.engine]).launch();
for(const width of [390,1280]){const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:suite.motion,deviceScaleFactor:1});
await ctx.route('**/*',r=>{const u=new URL(r.request().url()); if(!['127.0.0.1','localhost'].includes(u.hostname))return r.abort(); if(r.request().isNavigationRequest()&&!u.pathname.startsWith('/clubhouse-preview/'))return r.abort(); return r.continue();});
let next=0; await Promise.all(Array.from({length:3},async()=>{for(;;){const n=next++; if(n>=suite.rows.length)break; const [family,url,open]=suite.rows[n]; const opener=open?.[width===390?'phone':'wide']; if(open&&!opener)continue;
if(results.some(r=>r.url===url&&r.width===width&&r.engine===suite.engine&&JSON.stringify(r.opener)===JSON.stringify(opener??null)))continue; const p=await ctx.newPage(); const result={family,url,width,engine:suite.engine,motion:suite.motion,opener:opener??null};
try{const res=await p.goto(base+url,{waitUntil:'networkidle',timeout:90000}); if(!res?.ok())throw Error(`HTTP ${res?.status()}`); await p.evaluate(()=>document.fonts.ready);
for(const selector of [opener??[]].flat()){await p.locator(selector).first().click({timeout:7000}); await p.waitForTimeout(300);} await p.waitForTimeout(350);
const axe=await new AxeBuilder({page:p}).include('.ch-root').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze(); result.violations=axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
result.render=await p.evaluate(()=>{const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&!e.closest('[inert],[aria-hidden="true"],nextjs-portal');};const all=[...document.querySelectorAll('.ch-root *')].filter(visible);const materials=all.filter(e=>{const s=getComputedStyle(e);return s.boxShadow!=='none'||s.backdropFilter!=='none';}).map(e=>{const s=getComputedStyle(e);return {class:e.className,shadow:s.boxShadow,blur:s.backdropFilter,radius:s.borderRadius,background:s.backgroundColor};});const smallTargets=[...document.querySelectorAll('.ch-root button,.ch-root a[href],.ch-root [role="switch"],.ch-root input,.ch-root select')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0&&(r.width<44||r.height<44);}).map(e=>({class:e.className,label:e.getAttribute('aria-label')||e.textContent?.trim().slice(0,60),width:Math.round(e.getBoundingClientRect().width),height:Math.round(e.getBoundingClientRect().height)}));return {scrollWidth:document.documentElement.scrollWidth,headings:[...document.querySelectorAll('.ch-root h1,.ch-root h2,.ch-root h3')].filter(visible).map(e=>e.textContent),materials,smallTargets};});
const screen=new URL(url,base).pathname.split('/').at(-1);const stateParam=new URL(url,base).searchParams.get('state');
const role=family==='auth'?'none':screen==='player'?'coach':screen.endsWith('-player')||['classes','rounds','track','setup','entry','my-qualifiers','coachhelm-views'].includes(screen)||(screen==='round'&&stateParam!=='coach')||(screen==='settings'&&['player','noteam'].includes(stateParam))?'player':'coach';
result.role=role;result.roleCaveat=screen==='player'&&stateParam==='self'?'Player content currently rendered inside coach fixture shell':null; const state=`case-${String(n+1).padStart(3,'0')}-${suite.engine}-${suite.motion==='reduce'?'reduce':'normal'}`;
const file=shotPath({page:ids[family],surface:'premium-audit',role,viewport:String(width),state,phase:'evidence',sha},root,date);await p.screenshot({path:file});result.screenshot=path.relative(root,file);
recordShot(file,{route:manifests.find(m=>m.id===ids[family])?.routes?.[0]??url,fixture:`${url}; synthetic preview`,browser:`${suite.engine} ${browser.version()}`,note:`${sourceState} over ${sha}; synthetic local fixtures; target bounds require pseudo-element hit-area adjudication`},root,{},{gallery:false});
}catch(e){result.gap=String(e.message).slice(0,450);} results.push(result);fs.writeFileSync(path.join(out,'render-results.json'),JSON.stringify(results,null,2));console.log(result.gap?'GAP':result.violations.length||result.render.scrollWidth>width?'FINDING':'PASS',suite.engine,width,family,url,result.gap??result.violations.map(v=>v.id).join(','));await p.close();}}));
await ctx.close();}await browser.close();}
for(const id of Object.values(ids))writeGallery(root,id);
const gaps=results.filter(r=>r.gap),violations=results.filter(r=>r.violations?.length),overflow=results.filter(r=>r.render?.scrollWidth>r.width);console.log(JSON.stringify({cases:results.length,gaps:gaps.length,violations:violations.length,overflow:overflow.length}));process.exitCode=gaps.length||violations.length||overflow.length?1:0;
