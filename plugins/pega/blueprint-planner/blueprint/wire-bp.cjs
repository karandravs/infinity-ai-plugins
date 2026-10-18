// Playwright wiring: bind a Blueprint data object to an imported system+resource.
// Opens the chip's editor (via closest button), Integrations tab, sets integration-sor + resource.
// Usage: node wire-bp.cjs <dataObject> <system> [resource] [--debug]
const { chromium } = require('playwright-core');
const argv = process.argv.slice(2);
const debug = argv.includes('--debug');
const [obj, sys, res] = argv.filter(a=>!a.startsWith('--'));
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function pickCombo(p, id, text){
  await p.keyboard.press('Escape');
  await sleep(500);
  // trusted Playwright click on the combobox inside the non-inert dialog keeps React focus
  const box = await p.evaluate(i=>{ const d=Array.from(document.querySelectorAll('[role=dialog]')).filter(x=>!x.hasAttribute('inert')&&/Save/.test(x.innerText||''))[0]; const c=d&&d.querySelector('#'+i); if(!c)return null; c.scrollIntoView({block:'center'}); const r=c.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }, id);
  if(!box) return 'no-combo';
  await p.mouse.click(box.x+box.width/2, box.y+box.height/2);
  await sleep(800);
  await p.keyboard.press('ArrowDown');
  await sleep(1600);
  const picked = await p.evaluate(({t, dbg})=>{
    const opts=Array.from(document.querySelectorAll('[role=option],[class*=option],li')).filter(o=>o.offsetParent!==null);
    const cleaned=opts.map(o=>({el:o,txt:(o.innerText||'').trim()})).filter(o=>o.txt);
    const want=cleaned.find(o=>o.txt===t);
    if(want){ want.el.click(); return true; }
    const fuzzy=cleaned.find(o=>new RegExp('^'+t).test(o.txt) && /API|Pega|Service|Local/i.test(o.txt));
    if(fuzzy){ fuzzy.el.click(); return fuzzy.txt; }
    if(dbg) console.log('  no match; visible:', cleaned.map(o=>o.txt).slice(0,20));
    return false;
  }, {t: text, dbg: debug});
  await sleep(1200);
  return picked;
}
(async()=>{
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  let p = ctx.pages().find(x=>/blueprint/.test(x.url()));
  if(!p) p = await ctx.newPage();

  // open the data object editor only if a dialog isn't already open
  let hasDlg = await p.evaluate(()=>!!Array.from(document.querySelectorAll('[role=dialog]')).filter(x=>!x.hasAttribute('inert')&&/Save/.test(x.innerText||''))[0]);
  if(!hasDlg){
    const opened = await p.evaluate(o=>{
      const label=Array.from(document.querySelectorAll('.c-dco-data-object-chip__label-text')).find(x=>(x.innerText||'').trim()===o);
      if(!label) return 'no-label';
      const btn=label.closest('button'); if(btn){ btn.click(); return 'btn'; }
      label.click(); return 'label';
    }, obj);
    await sleep(3000);
    if(debug) console.log(`open ${obj}:`, opened);
  }
  // ensure the Integrations tab is active and the combobox is present
  await p.evaluate(()=>{ const d=Array.from(document.querySelectorAll('[role=dialog]')).filter(x=>!x.hasAttribute('inert')&&/Save/.test(x.innerText||''))[0]; if(!d)return; for(const e of Array.from(d.querySelectorAll('button,a,[role=tab]'))){ const t=(e.innerText||'').trim().replace(/\n+/g,' '); if(/^Integrations/.test(t)){ e.click(); return; } } });
  await sleep(2200);
  // confirm dialog + combos are present now
  const ready = await p.evaluate(()=>{ const d=Array.from(document.querySelectorAll('[role=dialog]')).filter(x=>!x.hasAttribute('inert')&&/Save/.test(x.innerText||''))[0]; return d?{sor:!!d.querySelector('#integration-sor'),res:!!d.querySelector('#integration-resource')}:null; });
  if(debug) console.log('dialog ready:', JSON.stringify(ready));
  if(!ready) { console.log(`${obj} => no dialog after open`); process.exit(1); }

  const sysR = sys ? await pickCombo(p,'integration-sor',sys) : null;
  const resR = res ? await pickCombo(p,'integration-resource',res) : null;
  const saved = await p.evaluate(()=>{ const d=Array.from(document.querySelectorAll('[role=dialog]')).filter(x=>!x.hasAttribute('inert')&&/Save/.test(x.innerText||''))[0]; if(!d)return false; const b=Array.from(d.querySelectorAll('button')).find(x=>/hSKSyv/.test(x.className)&&x.offsetParent!==null&&!x.disabled); if(b){ b.click(); return true; } return false; });
  await sleep(2500);
  console.log(`${obj} => sys=${sysR} res=${resR} saved=${saved}`);
  await browser.close();
})().catch(e=>{console.error('ERR',String(e).slice(0,500));process.exit(1);});