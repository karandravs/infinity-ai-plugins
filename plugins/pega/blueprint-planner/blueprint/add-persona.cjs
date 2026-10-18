// Add one persona and click Save.
const { chromium } = require('playwright-core');
const [name, desc] = process.argv.slice(2);
if (!name) { console.error('usage: add-persona.cjs <name> <description>'); process.exit(1); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
(async()=>{
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x=>x.url().includes('blueprint'));
  await p.evaluate(()=>{ const b=Array.from(document.querySelectorAll('button')).find(x=>(x.innerText||'').trim()==='Add a Persona' && x.offsetParent!==null); if(b) b.click(); });
  await sleep(1800);
  await p.locator('#persona-name-default').fill(name);
  await p.locator('#persona-description-default').fill(desc);
  await sleep(400);
  // click Save (visible dialog)
  const saved = await p.evaluate(()=>{
    const dd = Array.from(document.querySelectorAll('[role=dialog]')).find(e=>e.offsetParent!==null && e.getAttribute('aria-hidden')!=='true');
    const roots = dd ? [dd] : Array.from(document.querySelectorAll('[role=dialog]')).filter(e=>e.offsetParent!==null);
    for (const root of roots){
      const b=Array.from(root.querySelectorAll('button')).find(x=>(x.innerText||'').trim()==='Save' && x.offsetParent!==null && !x.disabled);
      if(b){ b.click(); return true; }
    }
    return false;
  });
  console.log(`${name} save clicked:`, saved);
  await sleep(2000);
  const body=await p.evaluate(()=>{const h=document.querySelector('header'),f=document.querySelector('footer');for(const e of [h,f])if(e)e.remove();return document.body?document.body.innerText:'';});
  console.log('personas now:', (body.match(/\n[A-Z][A-Za-z /]+PERSONA/g)||[]).map(s=>s.trim()).slice(0,20));
  await browser.close();
})().catch(e=>{console.error('FATAL',String(e).slice(0,300));process.exit(1);});