const { chromium } = require('playwright-core');
const [name, desc, yaml] = process.argv.slice(2);
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function body(p){ return p.evaluate(()=>{ const h=document.querySelector('header'),f=document.querySelector('footer'); for(const e of [h,f]) if(e) e.remove(); return document.body?document.body.innerText:''; }); }
async function clickTxt(p,label){ return p.evaluate(l=>{ const dd=Array.from(document.querySelectorAll('[role=dialog]')).find(e=>e.offsetParent!==null&&e.getAttribute('aria-hidden')!=='true'); const roots=dd?[dd]:Array.from(document.querySelectorAll('[role=dialog]')).filter(e=>e.offsetParent!==null); for(const r of roots){ const b=Array.from(r.querySelectorAll('button')).find(x=>(x.innerText||'').trim()===l&&x.offsetParent!==null&&!x.disabled); if(b){ b.click(); return true; } } return false; }, label); }
(async()=>{
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x=>x.url().includes('blueprint'));
  // self-position: ensure we are on the target blueprint's Data & Integrations step
  const bp = process.env.BP_ID || (p.url().match(/BP-\d+/)||[])[0];
  const onD = (await p.evaluate(()=>Array.from(document.querySelectorAll('*')).some(e=>/^\d+ Data & Integrations$/.test((e.innerText||'').trim().replace(/\n+/g,' ')))).catch(()=>false));
  if(!onD && bp){
    await p.goto(`https://www.pega.com/blueprint/${bp}/workflows`, { waitUntil:'domcontentloaded', timeout:60000 });
    await sleep(8000);
    const hit = await p.evaluate(()=>{ for(const e of Array.from(document.querySelectorAll('a,[role=button],button,div[class*=step]'))){ const t=(e.innerText||'').trim().replace(/\n+/g,' '); if(/^\d+ Data & Integrations$/.test(t)){ const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; } } return null; });
    if(hit){ await p.mouse.click(hit.x+hit.w/2, hit.y+hit.h/2); await sleep(7000); }
  }
  // open Add System
  await p.evaluate(()=>{ const btns=Array.from(document.querySelectorAll('button')).filter(b=>(b.innerText||'').trim()==='Add System'&&b.offsetParent!==null); if(btns.length) btns.sort((a,c)=>a.getBoundingClientRect().height-c.getBoundingClientRect().height)[0].click(); });
  await sleep(2200);
  let dlg = await p.evaluate(()=>{ const dd=Array.from(document.querySelectorAll('[role=dialog]')).find(e=>e.offsetParent!==null); return dd?true:false; });
  console.log('dialog open:', dlg);
  if(!dlg){ console.log('NOT OPEN — abort'); process.exit(1); }
  await p.evaluate(()=>{ const dd=Array.from(document.querySelectorAll('[role=dialog]')).find(e=>e.offsetParent!==null); const r=dd&&Array.from(dd.querySelectorAll('input[type=radio]')).find(x=>x.value==='import'); if(r) r.click(); });
  await sleep(1400);
  await p.evaluate(()=>{ const dd=Array.from(document.querySelectorAll('[role=dialog]')).find(e=>e.offsetParent!==null); const t=dd&&Array.from(dd.querySelectorAll('.c-dco-sor-select-tile')).find(e=>(e.innerText||'').trim()==='Custom'); if(t) t.click(); });
  await sleep(1100);
  await p.locator('#edit-sor-name').fill(name);
  await p.locator('#edit-sor-description').fill(desc);
  await p.locator('#data-schemas').setInputFiles(yaml);
  await sleep(2500);
  await clickTxt(p,'Next'); await sleep(2500);
  for(let i=0;i<40;i++){ await sleep(3000); const t=await p.locator('[role=dialog]:visible').first().innerText().catch(()=>''); if(!/Generating|analyzing|Waiting|harvesting|designing/i.test(t)) break; }
  for(let round=0; round<4; round++){
    const open=await p.locator('[role=dialog]:visible').count();
    if(!open) break;
    await p.evaluate(()=>{ const dd=Array.from(document.querySelectorAll('[role=dialog]')).find(e=>e.offsetParent!==null&&e.getAttribute('aria-hidden')!=='true'); if(!dd)return; const btns=Array.from(dd.querySelectorAll('button')).filter(b=>b.offsetParent!==null&&!b.disabled); (btns.find(b=>/hSKSyv/.test(b.className))||btns[btns.length-1]).click(); });
    await sleep(3500);
  }
  const b=await body(p);
  console.log('FINAL INTEGRATIONS:', (b.match(/INTEGRATIONS\s*\n(\d+)/)||[])[1]);
  await browser.close();
})().catch(e=>{console.error('FATAL',String(e).slice(0,500));process.exit(1);});
