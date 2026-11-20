// Run with: node test_frontend.cjs (no npm dependencies).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = name => fs.readFileSync(path.join(__dirname, 'static', name), 'utf8');
for (const name of ['script.js','theme.js','trending.js','sharing.js','profile.js']) new vm.Script(source(name));
const context = vm.createContext({URL, location:{origin:'https://school.example'},
  escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')});
vm.runInContext(source('trending.js') + source('sharing.js'), context);
context.events = [
  {id:1,status:'approved',date:'2026-12-01',time:'17:00',count:2},
  {id:2,status:'pending',date:'2026-12-01',time:'17:00',count:500},
  {id:3,status:'approved',date:'2026-10-01',time:'17:00',count:100},
  {id:4,status:'approved',date:'2026-12-02',time:'17:00',count:10}];
assert.equal(vm.runInContext('trendingEvents(events,"2026-11-20").map(e=>e.id).join(",")',context),'4,1');
context.event = {id:42,title:'Игра & встреча #1',date:'2026-12-01',time:'17:00',room:'B19',status:'pending'};
const html = vm.runInContext('eventShareMarkup(event)',context);
const telegram = new URL(html.match(/href="(https:\/\/t.me[^\"]+)"/)[1]);
assert.equal(telegram.searchParams.get('url'),'https://school.example/#event/42');
assert.ok(telegram.searchParams.get('text').includes(context.event.title));
assert.ok(html.includes('только после одобрения'));
context.event.status='approved';
assert.ok(!vm.runInContext('eventShareMarkup(event)',context).includes('только после одобрения'));
const saved = new Map();
function loadTheme() {
  const button={setAttribute(){}};
  const document={documentElement:{dataset:{}},querySelector:s=>s==='#theme-toggle'?button:{},
    addEventListener:(_,callback)=>callback()};
  vm.runInNewContext(source('theme.js'),{document,matchMedia:()=>({matches:true,addEventListener(){}}),
    window:{addEventListener(){}},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)}});
  return {document,button};
}
const first=loadTheme();assert.equal(first.document.documentElement.dataset.theme,'light');first.button.onclick();
assert.equal(first.document.documentElement.dataset.theme,'dark');
assert.equal(loadTheme().document.documentElement.dataset.theme,'dark');
const rooms=JSON.parse(source('maps/rooms.json'));
for (const r of rooms.filter(r=>'marker_x' in r)) {
  assert.ok(r.marker_x>=0&&r.marker_x<=r.reference_width);
  assert.ok(r.marker_y>=0&&r.marker_y<=r.reference_height);
}
const b19=rooms.find(r=>r.name==='B19');
assert.ok(b19.marker_x < b19.x && b19.marker_y > b19.y);
console.log('Frontend checks passed: syntax, ranking, share URLs, moderation notice, theme persistence, marker bounds.');
