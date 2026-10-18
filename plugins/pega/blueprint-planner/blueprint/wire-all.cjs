#!/usr/bin/env node
// WIRE: repeatable Blueprint data-object -> system+resource binding.
// Opens each object's editor, Integrations tab, sets Integration System + Resource via
// the aria-owns DOM (focus + ArrowDown dispatch populates the option list; click by label),
// then Save. Verifies the chip shows "NAME SYSTEM • RESOURCE". Re-runnable on any blueprint.
//
// Usage: WIRE_BP=BP-2552200 DATAMAP='Payment Transaction:Payments API:Transaction' node wire-all.cjs
//   DATAMAP entries separated by | ; each "label:system:resource". Empty resource = system only.
const { chromium } = require('playwright-core');
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
const BP = process.env.WIRE_BP;
const RAW = process.env.DATAMAP;
if(!BP || !RAW){ console.error('usage: WIRE_BP=BP-xxx DATAMAP="A:S:R|B:S:R" node wire-all.cjs'); process.exit(1); }
const MAP = RAW.split('|').map(s=>{ const [obj,sys,res] = s.split(':'); return {obj, sys, res: res||null}; });

async function comboBox(p, id){
  return p.evaluate(i=>{
    const d=Array.from(document.querySelectorAll('[role=dialog]')).filter(x=>!x.hasAttribute('inert')&&/Save/.test(x.innerText||''))[0];
    const c=d&&d.querySelector('#'+i); if(!c) return null;
    c.scrollIntoView({block:'center'}); c.focus();
    // dispatch ArrowDown/Up to populate aria-owns
    c.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',code:'ArrowDown',bubbles:true,cancelable:true}));
    c.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowDown',code:'ArrowDown',bubbles:true,cancelable:true}));
    return true;
  }, id);
}
async function ownedLabels(p, id){
  return p.evaluate(i=>{
    const d=Array.from(document.querySelectorAll('[role=dialog]')).filter(x=>!x.hasAttribute('inert')&&/Save/.test(x.innerText||''))[0];
    const c=d&&d.querySelector('#'+i); if(!c) return [];
    return (c.getAttribute('aria-owns')||'').split(/\s+/).filter(Boolean).map(id2=>{ const el=document.getElementById(id2); return el?(el.innerText||'').trim():id2; });
  }, id);
}
async function pick(p, id, label){
  await comboBox(p, id);
  await sleep(900);
  const labels = await ownedLabels(p, id);
  const hit = labels.findIndex(l=>l===label);
  if(hit<0) return {ok:false, got:labels};
  const clicked = await p.evaluate(({id2, idx})=>{
    const d=Array.from(document.querySelectorAll('[role=dialog]')).filter(x=>!x.hasAttribute('inert')&&/Save/.test(x.innerText||''))[0];
    const c=d&&d.querySelector('#'+id2); if(!c) return false;
    const own=(c.getAttribute('aria-owns')||'').split(/\s+/).filter(Boolean)[idx];
    const el=document.getElementById(own); if(!el) return false;
    el.click(); return true;
  }, {id2:id, idx:hit});
  await sleep(1000);
  return {ok:clicked, got:labels};
}
async function currentValues(p){
  return p.evaluate(()=>{ const d=Array.from(document.querySelectorAll('[role=dialog]')).filter(x=>!x.hasAttribute('inert')&&/Save/.test(x.innerText||''))[0]; return d?{sor:(d.querySelector('#integration-sor')||{}).value,res:(d.querySelector('#integration-resource')||{}).value}:null; });
}
async function chipText(p){
  return p.evaluate(()=>Array.from(document.querySelectorAll('.c-dco-data-object-chip__label-text')).map(e=>(e.closest('[class*=chip]')?.innerText||'').trim().replace(/\n+/g,' ')).filter(Boolean));
}
(async()=>{
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  let p = ctx.pages().find(x=>/blueprint/.test(x.url()));
  if(!p) p = await ctx.newPage();
  await p.goto(`https://www.pega.com/blueprint/${BP}/data-integrations`,{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(9000);

  const results=[];
  for(const {obj, sys, res} of MAP){
    // open the object editor (chip closest button)
    await p.evaluate(o=>{ const l=Array.from(document.querySelectorAll('.c-dco-data-object-chip__label-text')).find(x=>(x.innerText||'').trim()===o); if(l&&l.closest('button')) l.closest('button').click(); }, obj);
    await sleep(3200);
    // Integrations tab
    await p.evaluate(()=>{ const d=Array.from(document.querySelectorAll('[role=dialog]')).filter(x=>!x.hasAttribute('inert')&&/Save/.test(x.innerText||''))[0]; if(!d)return; for(const e of Array.from(d.querySelectorAll('button,a,[role=tab]'))){ const t=(e.innerText||'').trim().replace(/\n+/g,' '); if(/^Integrations/.test(t)){ e.click(); return; } } });
    await sleep(2000);
    const sysR = sys ? await pick(p,'integration-sor',sys) : {ok:true,note:'system-skip'};
    let resR = {ok:true,note:'resource-skip'};
    if(res) resR = await pick(p,'integration-resource',res);
    const vals = await currentValues(p);
    // Save
    const saved = await p.evaluate(()=>{ const d=Array.from(document.querySelectorAll('[role=dialog]')).filter(x=>!x.hasAttribute('inert')&&/Save/.test(x.innerText||''))[0]; if(!d)return false; const b=Array.from(d.querySelectorAll('button')).find(x=>/hSKSyv/.test(x.className)&&x.offsetParent!==null&&!x.disabled); if(b){ b.click(); return true; } return false; });
    await sleep(2500);
    // dismiss any lingering dialog
    await p.keyboard.press('Escape'); await sleep(600);
    results.push({obj, sys:sysR, res:resR, vals, saved});
    console.log(`  ${obj}: system=${JSON.stringify(sysR)} resource=${JSON.stringify(resR)} vals=${JSON.stringify(vals)} saved=${saved}`);
  }
  // final verify: reload + read chips
  await p.goto(`https://www.pega.com/blueprint/${BP}/data-integrations`,{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(9000);
  const chips = await chipText(p);
  console.log('\nFINAL CHIPS:');
  for(const c of chips) console.log('  ', c);
  await browser.close();
  process.exit(results.every(r=>r.saved)?0:1);
})().catch(e=>{ console.error('FATAL',String(e).slice(0,500)); process.exit(2); });