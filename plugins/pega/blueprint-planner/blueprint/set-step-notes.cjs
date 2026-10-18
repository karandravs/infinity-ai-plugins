// Recipe: set a step's Notes (routing/SLA documentation) in the case lifecycle.
// Usage: node set-step-notes.cjs "<stepName>" "<notesText>"
const { chromium } = require('playwright-core');
const [stepName, notes] = process.argv.slice(2);
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
(async()=>{
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x=>/blueprint/.test(x.url()));
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(8000);
  // ensure Case Lifecycle tab
  await p.evaluate(()=>{ const b=Array.from(document.querySelectorAll('button,[role=tab]')).find(x=>/^Case Lifecycle/.test((x.innerText||'').trim().replace(/\n+/g,' '))); if(b) b.click(); });
  await sleep(1500);
  // open the step
  await p.getByText(stepName, { exact: true }).first().click();
  await sleep(2200);
  const n = await p.locator('#lifecycle-step-fields-modal-notes').count();
  console.log('notes field present:', n);
  if(n){
    await p.locator('#lifecycle-step-fields-modal-notes').fill(notes);
    await sleep(400);
    // Save (primary button in modal)
    const saved = await p.evaluate(()=>{ const dd=Array.from(document.querySelectorAll('[role=dialog]')).find(e=>e.offsetParent!==null&&e.getAttribute('aria-hidden')!=='true'); if(!dd)return false; const btns=Array.from(dd.querySelectorAll('button')).filter(b=>b.offsetParent!==null&&!b.disabled); const pr=btns.find(b=>/hSKSyv/.test(b.className))||btns[btns.length-1]; if(pr){ pr.click(); return true; } return false; });
    console.log('step notes saved:', saved);
    await sleep(2000);
  }
  await browser.close();
})().catch(e=>{console.error('FATAL',String(e).slice(0,400));process.exit(1);});