// Recipe: delete a blueprint card from the dashboard (by card index).
// Usage: node del-blueprint.cjs <cardIndex>   (0-based order on the dashboard)
const { chromium } = require('playwright-core');
const idx = parseInt(process.argv[2] || '0', 10);
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
(async()=>{
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  let p = ctx.pages().find(x=>/blueprint/.test(x.url()));
  if(!p) p = await ctx.newPage();
  await p.goto('https://pega.com/blueprint/dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(9000);
  // open Nth card actions menu
  const acts = p.locator('button[aria-label^="Actions - "]');
  const n = await acts.count();
  if(n <= idx){ console.log('no card at index', idx, '(have', n, ')'); process.exit(1); }
  await acts.nth(idx).click();
  await sleep(1800);
  // click Delete (menu item)
  const hit = await p.evaluate(()=>{ const b=Array.from(document.querySelectorAll('button,[role=menuitem],[class*=menu] li')).find(x=>(x.innerText||'').trim()==='Delete' && x.offsetParent!==null); if(b){ b.click(); return true; } return false; });
  console.log('Delete clicked:', hit);
  await sleep(2000);
  // confirm overlay: click the primary "Delete" button (ezAjnX class)
  const confirmed = await p.evaluate(()=>{ const b=Array.from(document.querySelectorAll('button')).find(x=>(x.innerText||'').trim()==='Delete' && x.offsetParent!==null && /ezAjnX/.test(x.className)); if(b){ b.click(); return true; } return false; });
  console.log('confirm clicked:', confirmed);
  await sleep(5000);
  const body = await p.evaluate(()=>document.body?document.body.innerText:'');
  const bps = body.match(/BP-\d+/g) || [];
  console.log('remaining BP ids:', JSON.stringify([...new Set(bps)]));
  await browser.close();
})().catch(e=>{console.error('FATAL',String(e).slice(0,400));process.exit(1);});