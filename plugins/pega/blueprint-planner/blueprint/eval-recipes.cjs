#!/usr/bin/env node
// EVAL: verify the Blueprint recipe scripts work, by SPAWNING them (they drive the CDP
// Chrome) and checking their own stdout assertions + a fresh dashboard read after each.
// Self-contained recipes: recipe1-create, recipe3-personas, add-sys-guarded, del-blueprint.
//
// Usage: node eval-recipes.cjs   (run from the repo root; playwright-core resolves locally)
const { chromium } = require('playwright-core');
const { spawnSync } = require('child_process');
const path = require('path');
const DIR = __dirname;
const NODE = process.execPath;
const ENV = { ...process.env, NODE_PATH: require('node:path').join(__dirname, '..', 'node_modules') };
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function run(cmd, args, t=420000, extraEnv={}){
  const r = spawnSync(NODE,[path.join(DIR,cmd),...args],{cwd:DIR,env:{...ENV,...extraEnv},encoding:'utf8',timeout:t});
  const o = String(r.stdout||''); const e = String(r.stderr||'');
  return { ok: r.status===0 && !/FATAL/.test(o+e), out:o, err:e, status:r.status };
}
const R = { pass:0, fail:0 };
function verdict(name, ok, note){ if(ok){ R.pass++; console.log(`PASS  ${name}${note?' — '+note:''}`); } else { R.fail++; console.log(`FAIL  ${name}${note?' — '+note:''}`); } }
const bodyOf = p => p.evaluate(()=>{ const h=document.querySelector('header'),f=document.querySelector('footer'); for(const e of [h,f]) if(e) e.remove(); return document.body?document.body.innerText:''; });
async function goRail(p,label){
  const hit = await p.evaluate(l=>{ for(const e of Array.from(document.querySelectorAll('a,[role=button],button,div[class*=step]'))){ const t=(e.innerText||'').trim().replace(/\n+/g,' '); if(t.endsWith(l) && /^\d+/.test(t)){ const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; } } return null; }, label);
  if(hit){ await p.mouse.click(hit.x+hit.w/2, hit.y+hit.h/2); await sleep(7000); return true; }
  return false;
}

(async()=>{
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const vp = await ctx.newPage();
  const dash = async()=>{ await vp.goto('https://pega.com/blueprint/dashboard',{waitUntil:'domcontentloaded',timeout:60000}); await sleep(9000); return [...new Set((await vp.evaluate(()=>document.body.innerText)).match(/BP-\d+/g)||[])]; };
  const park = async()=>{ await vp.goto('about:blank',{waitUntil:'domcontentloaded'}).catch(()=>{}); await sleep(1500); };

  const before = await dash();
  console.log(`== EVAL START ==  existing blueprints: ${before.length}`);

  // 1. recipe1-create
  console.log('\n[eval] recipe1-create — make a fresh blueprint');
  await park();
  const r1 = run('recipe1-create.cjs', []);
  const after1 = await dash();
  const evalBp = after1.find(b=>!before.includes(b));
  verdict('recipe1-create makes a new blueprint', !!evalBp && /BP-\d+/.test(evalBp||''), `new=${evalBp}`);

  // 2. recipe3-personas — exports its own assertion (5 personas)
  console.log('\n[eval] recipe3-personas — delete AI + add spec 5');
  await park();
  const r3 = run('recipe3-personas.cjs', [], 1, {BP_ID: evalBp});
  await sleep(3000);
  // verify via dashboard-independent read: reopen eval bp, rail to personas, count Customer
  await vp.goto(`https://www.pega.com/blueprint/${evalBp}/workflows`,{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(9000);
  await goRail(vp,'Personas');
  const cust = await vp.locator('button[aria-label^="Actions - Customer"]').count();
  const all = await vp.locator('button[aria-label^="Actions - "]').count();
  verdict('recipe3-personas lands personas (incl Customer)', r3.ok && cust>0, `ok=${r3.ok} cards=${all} customer=${cust}`);
  const personaNames = [];
  for(let i=0;i<await vp.locator('button[aria-label^="Actions - "]').count();i++) personaNames.push((await vp.locator('button[aria-label^="Actions - "]').nth(i).getAttribute('aria-label')).replace('Actions - ',''));
  console.log(`   personas: ${JSON.stringify(personaNames)}`);

  // 3. add-sys-guarded — import ONE OpenAPI system
  console.log('\n[eval] add-sys-guarded — import payments.yaml');
  await park();
  await vp.goto(`https://www.pega.com/blueprint/${evalBp}/workflows`,{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(9000);
  const dRail = await goRail(vp,'Data & Integrations');
  await park();
  const sys = run('add-sys-guarded.cjs', ['EVAL API','Eval system of record.',require('node:path').join(__dirname,'..','contracts','payments.yaml')], 1, {BP_ID: evalBp});
  await sleep(3000);
  await vp.goto(`https://www.pega.com/blueprint/${evalBp}/workflows`,{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(9000);
  await goRail(vp,'Data & Integrations');
  const integTxt = await bodyOf(vp);
  const integN = (integTxt.match(/INTEGRATIONS\s*\n(\d+)/)||[])[1];
  const hasEvalApi = integTxt.includes('EVAL API');
  verdict('add-sys-guarded imports a system (INTEGRATIONS>=1)', sys.ok && integN>=1 && hasEvalApi, `ok=${sys.ok} integ=${integN} evalApi=${hasEvalApi}`);

  // 4. persistence
  console.log('\n[eval] persistence across reload');
  await vp.goto(`https://www.pega.com/blueprint/${evalBp}/workflows`,{waitUntil:'domcontentloaded',timeout:60000});
  await sleep(9000);
  const t = await bodyOf(vp);
  verdict('blueprint reopens cleanly', !/Oops!|Something went wrong/.test(t), 'no error on reopen');

  // 5. del-blueprint — delete the eval blueprint (by locating its card)
  console.log('\n[eval] del-blueprint — cleanup the eval blueprint');
  await dash();
  const acts = vp.locator('button[aria-label^="Actions - "]');
  let deleted=false, foundIdx=-1;
  for(let i=0;i<await acts.count();i++){
    const bp = await acts.nth(i).evaluate(el=>{ let nn=el,bp2=null; for(let k=0;k<6&&nn;k++){ nn=nn.parentElement; if(!nn)break; const m=(nn.innerText||'').match(/BP-\d+/); if(m){ bp2=m[0]; break; } } return bp2; });
    if(bp===evalBp){ foundIdx=i; break; }
  }
  if(foundIdx>=0){
    // run del-blueprint by index
    await park();
    const dr = run('del-blueprint.cjs', ['0']);
    await sleep(3000);
    const fin = await dash();
    deleted = !fin.includes(evalBp);
    verdict('del-blueprint deletes the eval blueprint', deleted, `remaining=${fin.length}`);
  } else {
    verdict('del-blueprint deletes the eval blueprint', false, 'eval blueprint not found on dashboard (unknown index)');
  }

  console.log(`\n== EVAL DONE ==  PASS=${R.pass} FAIL=${R.fail}`);
  await browser.close();
  process.exit(R.fail?1:0);
})().catch(e=>{ console.error('EVAL FATAL', String(e).slice(0,500)); process.exit(2); });