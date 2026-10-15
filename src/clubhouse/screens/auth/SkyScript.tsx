import { SKY_KEYS } from './scene-sky';

/**
 * The sign-in's sky before first paint. The server has no viewer clock, so the course still, the wordmark and the
 * sheet painted as day until hydration and then turned to night (owner, 2026-10-15: "still hot reloads day always,
 * then switches to night"). This runs in the root <head> on a hard load of /golf/login or /golf/welcome, works out the
 * hour from the viewer's clock plus the sun's offset this device last saw (SceneMount stores it), and stamps on <html>
 * what SceneMount, SignIn and auth.css would draw for it: the still's wash (--ch-au-wash-bg, --ch-au-wash-a), the
 * sheet's tint (--ch-au-paper) and the dark wordmark (data-ch-au-dark). SceneMount clears them once React has the
 * real hour. It lives in the root head for the reason ThemeScript does: a script in a nested layout is rendered by
 * React on a soft navigation, where it never runs (a soft navigation already knows the hour on its first frame).
 *
 * The maths mirror skyAt, posterWash, isDarkSky and paperTint (scene-sky.ts, SceneMount.tsx) over the same keyframes;
 * auth-sky-script.test.ts runs this script against them.
 */
export const SKY_OFFSET_KEY = 'ch-au-sky-offset';

const KEYS = JSON.stringify(SKY_KEYS.map((k) => [k.h, k.top, k.amb, k.ambA, k.stars]));

export const SKY_BOOT = `(function(){try{var p=location.pathname;if(p!='/golf/login'&&p!='/golf/welcome')return;var K=${KEYS},d=new Date(),o=0;try{o=parseFloat(localStorage.getItem('${SKY_OFFSET_KEY}'))||0}catch(e){}var h=d.getHours()+d.getMinutes()/60+o;h=((h%24)+24)%24;var i=0;while(K[i+1][0]<h)i++;var a=K[i],b=K[i+1],t=(h-a[0])/(b[0]-a[0]);t=t*t*(3-2*t);function c(x){return[1,3,5].map(function(j){return parseInt(x.slice(j,j+2),16)})}function m(x,y){var f=c(x),g=c(y);return'#'+f.map(function(v,j){return('0'+Math.round(v+(g[j]-v)*t).toString(16)).slice(-2)}).join('')}var top=m(a[1],b[1]),amb=m(a[2],b[2]),A=a[3]+(b[3]-a[3])*t,S=a[4]+(b[4]-a[4])*t,r=document.documentElement,s=r.style;s.setProperty('--ch-au-wash-bg','linear-gradient(to bottom, '+top+', '+amb+')');s.setProperty('--ch-au-wash-a',String(Math.min(0.88,Math.round(A*1.4*100)/100)));if(A>0.3)r.setAttribute('data-ch-au-dark','');if(A>=0.02){var q=c(S>0.6?'#e8b46a':amb);s.setProperty('--ch-au-paper','rgb('+q[0]+' '+q[1]+' '+q[2]+' / '+Math.round(Math.min(0.06,0.02+A*0.06)*1000)/1000+')')}}catch(e){}})();`;

/** Clears what SKY_BOOT stamped, once React draws the real hour. */
export function clearSkyBoot(): void {
  const root = document.documentElement;
  root.style.removeProperty('--ch-au-wash-bg');
  root.style.removeProperty('--ch-au-wash-a');
  root.style.removeProperty('--ch-au-paper');
  root.removeAttribute('data-ch-au-dark');
}

export function SkyScript() {
  return <script dangerouslySetInnerHTML={{ __html: SKY_BOOT }} />;
}
