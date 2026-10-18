// Clean up eval leftover blueprints from the dashboard (keep only BP-2552094).
const { chromium } = require('playwright-core');
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
(async()=>{
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  let p = ctx.pages().find(x=>/blueprint/.test(x.url()));
  if(!p) p = await ctx.newPage();
  await p.goto('https://pega.com/blueprint/dashboard', { waitUntil:'domcontentloaded', timeout:60000 });
  await sleep(9000);
  for(let pass=0; pass<6; pass++){
    const acts = p.locator('button[aria-label^="Actions - "]');
    const n = await acts.count();
    if(n===0) break;
    // delete every card that is NOT BP-2552094
    let any=false;
    for(let i=0;i<n;i++){
      const bp = await acts.nth(i).evaluate(el=>{ let nn=el,bp2=null; for(let k=0;k<6&&nn;k++){ nn=nn.parentElement; if(!nn)break; const m=(nn.innerText||'').match(/BP-\d+/); if(m){ bp2=m[0]; break; } } return bp2; });
      if(bp && bp !== 'BP-2552094'){
        await acts.nth(i).click(); await sleep(1500);
        await p.evaluate(()=>{ const b=Array.from(document.querySelectorAll('[role=menuitem],button')).find(x=>(x.innerText||'').trim()==='Delete'&&x.offsetParent!==null); if(b)b.click(); });
        await sleep(2000);
        // confirm overlay: primary Delete button (ezAjnX)
        await p.evaluate(()=>{ const b=Array.from(document.querySelectorAll('button')).find(x=>(x.innerText||'').trim()==='Delete'&&x.offsetParent!==null&&/ezAjnX/.test(x.className)); if(b)b.click(); });
        await sleep(5000);
        await p.goto('https://pega.com/blueprint/dashboard', { waitUntil:'domcontentloaded', timeout:60000 });
        await sleep(8000);
        any=true; break;
      }
    }
    if(!any) break;
  }
  const bps = [...new Set((await p.evaluate(()=>document.body.innerText)).match(/BP-\d+/g)||[])];
  console.log('final blueprints:', JSON.stringify(bps));
  await browser.close();
})().catch(e=>{ console.error('FATAL', String(e).slice(0,400)); process.exit(1); });