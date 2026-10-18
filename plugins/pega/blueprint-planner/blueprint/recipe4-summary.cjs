// Step 7 Summary: rail nav + dump state.
const { chromium } = require('playwright-core');
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
(async()=>{
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x=>x.url().includes('blueprint'));
  const hit = await p.evaluate(()=>{
    for (const e of Array.from(document.querySelectorAll('a,[role=button],button,div[class*=step]'))){
      const t=(e.innerText||'').trim().replace(/\n+/g,' ');
      if(/^\d+ Summary$/.test(t)){ const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }
    }
    return null;
  });
  if(hit){ await p.mouse.click(hit.x+hit.w/2, hit.y+hit.h/2); await sleep(8000); }
  const txt = await p.evaluate(()=>{ const h=document.querySelector('header'),f=document.querySelector('footer'); for(const e of [h,f]) if(e) e.remove(); return document.body?document.body.innerText:''; });
  console.log('URL:', p.url());
  console.log('SUMMARY:', /Summary/.test(txt) ? 'yes' : 'no');
  console.log(txt.replace(/\n{2,}/g,'\n').slice(0,1400));
  await p.screenshot({ path: 'recipe4-summary.png', fullPage: true });
  await browser.close();
})().catch(e=>{console.error('FATAL',String(e).slice(0,400));process.exit(1);});
