// Step 5 Personas: rail nav, delete generated, add spec 5.
const { chromium } = require('playwright-core');
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
const PERSONAS = [
  ['Customer','Submits a dispute or refund request through the web portal, uploads evidence, and tracks case status.'],
  ['Dispute Analyst','Reviews high-risk exception disputes: evidence, AI summary, risk data; approves, rejects, or requests more information.'],
  ['Finance Approver','Approves or rejects refunds at or above the 1000 EUR threshold after analyst review.'],
  ['Operations Administrator','Monitors SLAs, stuck cases, and integration failures; owns the exception queue.'],
  ['System Integration User','Non-human actor for API calls, customer notifications, and system writebacks.'],
];
async function gotoRail(p,label){
  const hit = await p.evaluate(l=>{
    for (const e of Array.from(document.querySelectorAll('a,[role=button],button,div[class*=step]'))){
      const t=(e.innerText||'').trim().replace(/\n+/g,' ');
      if(/^\d+ (Data & Integrations|Personas|Features|Summary)$/.test(t) && t.endsWith(l)){ const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }
    }
    return null;
  }, label);
  if(hit){ await p.mouse.click(hit.x+hit.w/2, hit.y+hit.h/2); await sleep(6000); return true; }
  return false;
}
function menuOpen(p){ return p.evaluate(()=>Array.from(document.querySelectorAll('*')).some(e=>(e.innerText||'').trim()==='Delete' && e.offsetParent!==null)); }
async function deleteAllCards(p){
  let round=0;
  while(round<15){
    const cnt=await p.locator('[aria-label^="Actions - "]').count(); if(cnt===0) return;
    if(!(await menuOpen(p))){ await p.evaluate(()=>{ const b=document.querySelector('button[aria-label^="Actions - "]'); if(b) b.click(); }); await sleep(1400); }
    if(!(await menuOpen(p))) return;
    await p.evaluate(()=>{ for(const e of Array.from(document.querySelectorAll('button,[role=menuitem]'))) if((e.innerText||'').trim()==='Delete'&&e.offsetParent!==null){ e.click(); break; } });
    await sleep(1100);
    await p.evaluate(()=>{ for(const e of Array.from(document.querySelectorAll('[class*=modal] button,[role=dialog] button'))) if((e.innerText||'').trim()==='Delete'&&e.offsetParent!==null){ e.click(); return; } });
    await sleep(2000); round++;
  }
}
async function addPersona(p,name,desc){
  await p.evaluate(()=>{ const b=Array.from(document.querySelectorAll('button')).find(x=>(x.innerText||'').trim()==='Add a Persona'&&x.offsetParent!==null); if(b) b.click(); });
  await sleep(2000);
  await p.locator('#persona-name-default').fill(name);
  await p.locator('#persona-description-default').fill(desc);
  await sleep(300);
  await p.evaluate(()=>{ const dd=Array.from(document.querySelectorAll('[role=dialog]')).find(e=>e.offsetParent!==null&&e.getAttribute('aria-hidden')!=='true'); if(!dd)return; const b=Array.from(dd.querySelectorAll('button')).find(x=>(x.innerText||'').trim()==='Save'&&x.offsetParent!==null&&!x.disabled); if(b) b.click(); });
  await sleep(2200);
}
(async()=>{
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x=>x.url().includes('blueprint'));
  // self-position: ensure we are on the target blueprint's workflows page (rail exists there)
  const bp = process.env.BP_ID || (p.url().match(/BP-\d+/)||[])[0];
  const onRail = (await p.evaluate(()=>Array.from(document.querySelectorAll('*')).some(e=>/^\d+ Personas$/.test((e.innerText||'').trim().replace(/\n+/g,' ')))).catch(()=>false));
  if(!onRail && bp){
    await p.goto(`https://www.pega.com/blueprint/${bp}/workflows`, { waitUntil:'domcontentloaded', timeout:60000 });
    await sleep(8000);
  }
  const ok = await gotoRail(p,'Personas');
  console.log('→ personas step:', ok);
  await deleteAllCards(p);
  console.log('personas deleted, remain:', await p.locator('[aria-label^="Actions - "]').count());
  for (const s of PERSONAS) await addPersona(p,s[0],s[1]);
  const cards = await p.evaluate(()=>Array.from(document.querySelectorAll('[aria-label^="Actions - "]')).map(e => e.getAttribute('aria-label').replace('Actions - ','')));
  console.log('FINAL PERSONAS:', JSON.stringify(cards));
  await p.screenshot({ path: 'recipe3-personas.png', fullPage: true });
  await browser.close();
})().catch(e=>{console.error('FATAL',String(e).slice(0,500));process.exit(1);});
