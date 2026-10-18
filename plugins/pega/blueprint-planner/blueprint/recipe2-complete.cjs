// Recipe 2: complete the blueprint — case type + 5 integrations + personas, to summary.
const { chromium } = require('playwright-core');
const path = require('node:path');
const CONTRACTS = path.join(__dirname, '..', 'contracts');
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function body(p){ return p.evaluate(()=>{ const h=document.querySelector('header'),f=document.querySelector('footer'); for(const e of [h,f]) if(e) e.remove(); return document.body?document.body.innerText:''; }); }
async function clickNav(p, name){ return p.evaluate(n=>{ const b=Array.from(document.querySelectorAll('button')).find(x=>x.getAttribute('data-testid')==='navigation:nav:'+n); if(b&&!b.disabled){ b.click(); return true; } return false; }, name); }
const SYSTEMS = [
  ['PAYMENTS API','Payments system of record: transaction lookup, idempotent refunds, dispute status updates.', path.join(CONTRACTS,'payments.yaml')],
  ['CRM API','CRM system of record: customer profile lookup and case-status writeback.', path.join(CONTRACTS,'crm.yaml')],
  ['RISK API','Risk scoring system of record: stateless score for a dispute.', path.join(CONTRACTS,'risk.yaml')],
  ['NOTIFICATION SERVICE','Notification system of record: template-driven email dispatch.', path.join(CONTRACTS,'notifications.yaml')],
  ['DOCUMENT AI SERVICE','Document AI system of record: extract structured facts from evidence.', path.join(CONTRACTS,'documents.yaml')],
];
const PERSONAS = [
  ['Customer','Submits a dispute or refund request through the web portal, uploads evidence, and tracks case status.'],
  ['Dispute Analyst','Reviews high-risk exception disputes: evidence, AI summary, risk data; approves, rejects, or requests more information.'],
  ['Finance Approver','Approves or rejects refunds at or above the 1000 EUR threshold after analyst review.'],
  ['Operations Administrator','Monitors SLAs, stuck cases, and integration failures; owns the exception queue.'],
  ['System Integration User','Non-human actor for API calls, customer notifications, and system writebacks.'],
];
async function clickTxt(p, label){ return p.evaluate(l=>{ const b=Array.from(document.querySelectorAll('button,a,[role=button]')).find(x=>(x.innerText||'').trim()===l && x.offsetParent!==null && !x.disabled); if(b){ b.click(); return true; } return false; }, label); }
function menuOpen(p){ return p.evaluate(()=>Array.from(document.querySelectorAll('*')).some(e=>(e.innerText||'').trim()==='Delete' && e.offsetParent!==null)); }
async function deleteAllCards(p, kind){
  let round=0;
  while(round<20){
    const cnt = await p.locator('[aria-label^="Actions - "]').count();
    if(cnt===0) break;
    if(!(await menuOpen(p))){
      await p.evaluate(()=>{ const b=document.querySelector('button[aria-label^="Actions - "]'); if(b) b.click(); });
      await sleep(1300);
    }
    if(!(await menuOpen(p))) break;
    await p.evaluate(()=>{ for(const e of Array.from(document.querySelectorAll('button,[role=menuitem]'))) if((e.innerText||'').trim()==='Delete' && e.offsetParent!==null){ e.click(); break; } });
    await sleep(1100);
    await p.evaluate(()=>{ for(const e of Array.from(document.querySelectorAll('[class*=modal] button,[role=dialog] button'))) if((e.innerText||'').trim()==='Delete' && e.offsetParent!==null){ e.click(); return; } });
    await sleep(2000);
    round++;
  }
  console.log(`deleted ${kind}: ${await p.locator('[aria-label^="Actions - "]').count()} remain`);
}
async function addCaseType(p, name, desc){
  await clickTxt(p, 'Add a Case Type'); await sleep(2000);
  await p.locator('#case-type-name').fill(name);
  await p.locator('#case-type-description').fill(desc);
  await sleep(400);
  await p.evaluate(()=>{ const dd=Array.from(document.querySelectorAll('[role=dialog]')).find(e=>e.offsetParent!==null); if(!dd)return; const btns=Array.from(dd.querySelectorAll('button')).filter(b=>b.offsetParent!==null&&!b.disabled); (btns.find(b=>/hSKSyv/.test(b.className))||btns[btns.length-1]).click(); });
  await sleep(3000);
  console.log('case type added:', name);
}
async function addSystem(p, name, desc, yaml){
  await p.evaluate(()=>{ const btns=Array.from(document.querySelectorAll('button')).filter(b=>(b.innerText||'').trim()==='Add System'&&b.offsetParent!==null); if(btns.length) btns.sort((a,c)=>a.getBoundingClientRect().height-c.getBoundingClientRect().height)[0].click(); });
  await sleep(2000);
  await p.evaluate(()=>{ const dd=Array.from(document.querySelectorAll('[role=dialog]')).find(e=>e.offsetParent!==null); const r=Array.from(dd.querySelectorAll('input[type=radio]')).find(x=>x.value==='import'); if(r) r.click(); });
  await sleep(1400);
  await p.evaluate(()=>{ const dd=Array.from(document.querySelectorAll('[role=dialog]')).find(e=>e.offsetParent!==null); const t=Array.from(dd.querySelectorAll('.c-dco-sor-select-tile')).find(e=>(e.innerText||'').trim()==='Custom'); if(t) t.click(); });
  await sleep(1100);
  await p.locator('#edit-sor-name').fill(name);
  await p.locator('#edit-sor-description').fill(desc);
  await p.locator('#data-schemas').setInputFiles(yaml);
  await sleep(2500);
  await clickTxt(p, 'Next'); await sleep(2500);
  for(let i=0;i<40;i++){ await sleep(3000); const t=await p.locator('[role=dialog]:visible').first().innerText().catch(()=>''); if(!/Generating|analyzing|Waiting|harvesting|designing/i.test(t)) break; }
  for(let round=0; round<4; round++){
    const open = await p.locator('[role=dialog]:visible').count();
    if(!open) break;
    await p.evaluate(()=>{ const dd=Array.from(document.querySelectorAll('[role=dialog]')).find(e=>e.offsetParent!==null&&e.getAttribute('aria-hidden')!=='true'); if(!dd)return; const btns=Array.from(dd.querySelectorAll('button')).filter(b=>b.offsetParent!==null&&!b.disabled); (btns.find(b=>/hSKSyv/.test(b.className))||btns[btns.length-1]).click(); });
    await sleep(3500);
  }
  const b=await body(p);
  console.log('  added', name, '| INTEGRATIONS:', (b.match(/INTEGRATIONS\s*\n(\d+)/)||[])[1]);
}
async function addPersona(p, name, desc){
  await clickTxt(p, 'Add a Persona'); await sleep(1800);
  await p.locator('#persona-name-default').fill(name);
  await p.locator('#persona-description-default').fill(desc);
  await sleep(300);
  await p.evaluate(()=>{ const dd=Array.from(document.querySelectorAll('[role=dialog]')).find(e=>e.offsetParent!==null&&e.getAttribute('aria-hidden')!=='true'); if(!dd)return; const b=Array.from(dd.querySelectorAll('button')).find(x=>(x.innerText||'').trim()==='Save'&&x.offsetParent!==null&&!x.disabled); if(b) b.click(); });
  await sleep(2000);
}
(async()=>{
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x=>/blueprint/.test(x.url()));
  const start = (await body(p)).slice(0,80);
  console.log('current step:', start.replace(/\n+/g,' ').slice(0,80));

  // Case types step: delete generated, add Dispute Resolution
  await deleteAllCards(p, 'case types');
  await addCaseType(p, 'Dispute Resolution', 'Resolve a customer payment dispute or refund request end to end: intake, enrichment from Payments/CRM/Risk APIs, AI-assisted triage, automated or human decisioning with finance approval for high value, refund writeback, CRM update, and customer notification.');
  await clickNav(p, 'next'); await sleep(8000);
  console.log('→ lifecycle step'); 

  // Data & Integrations: add 5 systems
  await clickNav(p, 'next'); await sleep(8000);
  console.log('→ data & integrations step');
  for (const s of SYSTEMS){ await addSystem(p, ...s); }
  await clickNav(p, 'next'); await sleep(7000);

  // Personas: delete generated, add spec 5
  console.log('→ personas step');
  await deleteAllCards(p, 'personas');
  for (const s of PERSONAS){ await addPersona(p, ...s); }
  await clickNav(p, 'next'); await sleep(6000);
  console.log('→ features step');
  await clickNav(p, 'next'); await sleep(8000);

  const final = await body(p);
  console.log('SUMMARY reached:', /Summary/.test(final), '| URL:', p.url().slice(0,110));
  await p.screenshot({ path: 'recipe2-summary.png', fullPage: true });
  await browser.close();
})().catch(e=>{ console.error('FATAL', String(e).slice(0,500)); process.exit(1); });