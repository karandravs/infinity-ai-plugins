// Recipe: add a field to the Dispute case data model (BP-2552094 Case Data Model tab).
// Usage: node add-field.cjs "<name>" "<description>" "<type>" [primary true|false]
const { chromium } = require('playwright-core');
const [name, desc, type, primary] = process.argv.slice(2);
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function chooseCombo(p, id, text){
  const box = p.locator('#'+id).first();
  const b = await box.boundingBox();
  if(!b){ return null; }
  await p.mouse.click(b.x+b.width/2, b.y+b.height/2); // CDP click opens the readonly combobox
  await sleep(1200);
  const opts = p.locator('[role=option]');
  const n = await opts.count();
  for(let i=0;i<n;i++){
    const t=(await opts.nth(i).innerText()).trim();
    if(t === text){ await opts.nth(i).click(); await sleep(500); return t; }
  }
  if(n){ await opts.first().click(); await sleep(400); return (await opts.first().innerText()).trim(); }
  return null;
}
(async()=>{
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x=>/blueprint/.test(x.url()));
  // fresh state: reload + land on Case Data Model tab
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(8000);
  await p.evaluate(()=>{ const b=Array.from(document.querySelectorAll('button,[role=tab]')).find(x=>/^Case Data Model/.test((x.innerText||'').trim().replace(/\n+/g,' '))); if(b) b.click(); });
  await sleep(1500);
  // open Add a Field
  await p.evaluate(()=>{ const el=Array.from(document.querySelectorAll('button')).find(x=>(x.innerText||'').trim()==='Add a Field'&&x.offsetParent!==null); if(el) el.click(); });
  await sleep(1800);
  await p.locator('#field-name-create').first().fill(name);
  await p.locator('#field-description-create').first().fill(desc);
  const ty = await chooseCombo(p, 'field-type-create', type);
  if(primary === 'true'){
    await p.locator('#checkbox-primary-create').first().check().catch(()=>{});
  }
  await sleep(400);
  const saved = await p.evaluate(()=>{ const dd=Array.from(document.querySelectorAll('[role=dialog]')).find(e=>e.offsetParent!==null&&e.getAttribute('aria-hidden')!=='true'); if(!dd)return false; const btns=Array.from(dd.querySelectorAll('button')).filter(b=>b.offsetParent!==null&&!b.disabled); const pr=btns.find(b=>/hSKSyv/.test(b.className))||btns[btns.length-1]; if(pr){ pr.click(); return true; } return false; });
  console.log(`${name} added (type ${ty}) saved:`, saved);
  await sleep(2000);
  await browser.close();
})().catch(e=>{console.error('FATAL',String(e).slice(0,500));process.exit(1);});