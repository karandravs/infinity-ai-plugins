// Recipe 1: create a new Blueprint from scratch and walk the context wizard.
const { chromium } = require('playwright-core');
const [appName] = process.argv.slice(2); // optional: org/app name to type in purpose step

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function body(p){
  return p.evaluate(()=>{ const h=document.querySelector('header'),f=document.querySelector('footer'); for(const e of [h,f]) if(e) e.remove(); return document.body?document.body.innerText:''; });
}
async function clickTxt(p, label){
  return p.evaluate(l=>{ const b=Array.from(document.querySelectorAll('button,a,[role=button]')).find(x=>(x.innerText||'').trim()===l && x.offsetParent!==null && !x.disabled); if(b){ b.click(); return true; } return false; }, label);
}
async function clickNav(p, name){
  return p.evaluate(n=>{ const b=Array.from(document.querySelectorAll('button')).find(x=>x.getAttribute('data-testid')==='navigation:nav:'+n); if(b&&!b.disabled){ b.click(); return true; } return false; }, name);
}
async function fillCombobox(p, id, text){
  const box = p.locator('#'+id);
  await box.click({ clickCount: 3 });
  await p.keyboard.press('Meta+a');
  await p.keyboard.press('Backspace');
  await sleep(300);
  await box.type(text, { delay: 60 });
  await sleep(1000);
  // pick first role=option
  const n = await p.locator('[role=option]').count();
  if (n) { await p.locator('[role=option]').first().click(); await sleep(600); }
}
const DESC = "Resolve customer payment disputes and refund requests end to end. The application ingests a dispute, enriches it with transaction, customer, and risk data, applies policy-based decisioning, obtains human approval for exceptions, communicates the outcome, and writes the resolution back to downstream systems. Automated enrichment and triage reduce dispute handling time; low-risk policy-compliant disputes resolve automatically, high-value or high-risk disputes route to a human analyst with complete context, and every disposition leaves an auditable governed decision trail. Includes contract-real integrations with Payments, CRM, Risk, Notification, and Document AI REST APIs; AI-assisted summarization, classification, and recommended disposition; evidence upload and validation; approval workflow; customer notification; CRM and payment-system writeback; and full case audit history.";

(async()=>{
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const p = ctx.pages().find(x=>/blueprint/.test(x.url()));
  console.log('start URL:', p.url().slice(0, 90));

  // dashboard -> Create a Blueprint
  await p.goto('https://pega.com/blueprint/dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(7000);
  // accept the Pega Blueprint Agreement if it's blocking creation
  await p.evaluate(()=>{ const b=Array.from(document.querySelectorAll('button,a')).find(x=>/Accept the terms and conditions/i.test(x.innerText||'') && x.offsetParent!==null); if(b) b.click(); }).catch(()=>{});
  await sleep(2000);
  let hit = await clickTxt(p, 'Create an Application Blueprint') || await clickTxt(p, 'Create a Blueprint');
  console.log('create clicked:', hit);
  await sleep(3000);
  // accept the agreement that the create click may re-open
  const agreed = await p.evaluate(()=>{ const b=Array.from(document.querySelectorAll('button,a')).find(x=>/Accept the terms and conditions/i.test(x.innerText||'') && x.offsetParent!==null); if(b){ b.click(); return true; } return false; });
  if(agreed){ console.log('terms accepted after create'); await sleep(2000); }
  await sleep(5000);
  console.log('step1 URL:', p.url().slice(0, 110));

  // step 1: industry = Banking (tile)
  await p.locator('label.c-dco-industry__tile', { hasText: 'Banking' }).first().click().catch(async()=>clickTxt(p,'Banking'));
  await sleep(2000);
  await clickNav(p, 'next');
  await sleep(6000);

  // ensure we advanced (Retail Banking sub-industry present)
  await p.locator('label.c-dco-industry__tile', { hasText: 'Retail Banking' }).first().waitFor({ timeout: 20000 }).catch(()=>{});
  // step 2: sub-industry = Retail Banking + department = Operations
  await p.locator('label.c-dco-industry__tile', { hasText: 'Retail Banking' }).first().click().catch(async()=>clickTxt(p,'Retail Banking'));
  await sleep(1500);
  const dept = p.locator('input[role=combobox][id]');
  const nDept = await dept.count();
  const deptId = nDept ? (await dept.first().getAttribute('id')) : null;
  console.log('dept combo id:', deptId);
  await dept.first().click();
  await sleep(1200);
  await p.locator('[role=option]', { hasText: /^Operations$/ }).first().click();
  await sleep(800);
  await clickNav(p, 'next');
  await sleep(6000);

  // step 3: purpose + description + language
  await fillCombobox(p, 'purpose-combobox', 'Disputes');
  await sleep(800);
  await p.locator('#description').fill(DESC);
  const lang = p.locator('#language');
  await lang.click();
  await sleep(800);
  await p.locator('[role=option]', { hasText: /^English$/ }).first().click().catch(()=>{});
  await sleep(400);
  // Generate (split-button default)
  await p.evaluate(()=>{ const b=document.querySelector('[data-testid="generate-deep-thinking:split-button:default-button"]'); if(b) b.click(); });
  console.log('Generate clicked');
  // wait for generation to finish
  let done=false;
  for(let i=0;i<40;i++){
    await sleep(4000);
    const b=(await body(p)).replace(/\s+/g,' ');
    if(/Generating|Waiting|designing|analyzing|harvesting/i.test(b) && !/What Case Types/.test(b)) continue;
    if(/What Case Types|Define your workflows|Add a Case Type/i.test(b)){ done=true; break; }
  }
  console.log('generated:', done);
  console.log('now URL:', p.url().slice(0, 110));
  await p.screenshot({ path: 'recipe1-created.png', fullPage: true });
  await browser.close();
})().catch(e=>{ console.error('FATAL', String(e).slice(0,500)); process.exit(1); });