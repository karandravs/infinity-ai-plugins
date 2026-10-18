const { chromium } = require('playwright-core');
const spec = [
  'Dispute ID','Customer Email','Transaction Amount','Currency','Merchant Name','Transaction Date',
  'Transaction Status','Risk Score','Risk Band','AI Summary','AI Recommended Disposition','AI Rationale',
  'Final Disposition','Approved Refund Amount','Rejection Reason Code','Analyst Comments','SLA Breach',
  'Case Status','Dispute Category',
];
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = browser.contexts()[0].pages().find(x => /blueprint/.test(x.url()));
  const rows = await p.evaluate(() => {
    const t = document.querySelector('table');
    return t ? Array.from(t.querySelectorAll('tr')).map(r => Array.from(r.querySelectorAll('td')).map(d => (d.innerText || '').trim().slice(0, 40))).filter(r => r.length) : [];
  });
  const names = rows.map(r => r[1] || '$').filter(Boolean);
  console.log('FIELDNAMES:', JSON.stringify(names, null, 1));
  const present = spec.filter(s => names.some(n => n.toLowerCase().includes(s.toLowerCase())));
  const missing = spec.filter(s => !names.some(n => n.toLowerCase().includes(s.toLowerCase())));
  console.log('present:', JSON.stringify(present));
  console.log('missing:', JSON.stringify(missing));
  await browser.close();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });