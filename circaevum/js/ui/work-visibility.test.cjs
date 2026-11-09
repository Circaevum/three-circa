const assert = require('node:assert/strict');
const {test} = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.VIEWER_ROOT || path.resolve(__dirname, '..');
const M = require(path.join(root, 'models/work-mode.js'));
const source = fs.readFileSync(path.join(root, 'ui/work-mode.js'), 'utf8');
const KEY = 'circaevum.work-mode.v1';
function boot(saved) {
  const elements = [];
  const handlers = {};
  const entry = { addEventListener(type, fn) { handlers.open = fn; } };
  const document = {
    body: { append(el) { elements.push(el); }, classList: { toggle() {} } },
    createElement() { return { hidden: false, innerHTML: '', handlers: {}, setAttribute() {}, querySelector() { return null; }, addEventListener(type, fn) { this.handlers[type] = fn; } }; },
    querySelector() { return entry; },
    addEventListener(type, fn) { handlers[type] = fn; },
  };
  const store = new Map(saved ? [[KEY, JSON.stringify(saved)]] : []);
  const window = { WorkMode: M, addEventListener(type, fn) { handlers[type] = fn; } };
  window.parent = window;
  vm.runInNewContext(source, { window, document, localStorage: {getItem: k => store.get(k), setItem: (k,v) => store.set(k,v)}, Date });
  return {elements, handlers, store, overlay: elements[0]};
}
for (const preferences of [{dockCollapsed:false}, {dockLayout:2,dockCollapsed:false}, {dockLayout:2,dockCollapsed:true}]) {
  test(`legacy visibility cannot open UI: ${JSON.stringify(preferences)}`, () => {
    const saved = {tasks:M.seed(Date.now()), savedAt:'2026-01-01', project:'OpenAMI / ISV', ...preferences};
    const app = boot(saved);
    assert.deepEqual(app.elements.map(e=>e.id), ['work-mode']);
    assert.equal(app.overlay.hidden,true);
    assert.equal(app.store.get(KEY),JSON.stringify(saved), 'loading does not rewrite tasks or timestamps');
    app.handlers.open();
    assert.equal(app.overlay.hidden,false);
    for (const lane of ['Research','Development','Delivery']) assert.ok(app.overlay.innerHTML.includes(`<h2>${lane}</h2>`));
    app.handlers.keydown({key:'Escape'});
    assert.equal(app.overlay.hidden,true);
    assert.equal(app.store.get(KEY),JSON.stringify(saved));
    app.handlers.message({data:{type:'CIRCAEVUM_WORK_BOARD',board:{...saved,savedAt:'2026-02-01'}}});
    assert.equal(app.overlay.hidden,true);
    const result=JSON.parse(app.store.get(KEY));
    assert.deepEqual(result.tasks,saved.tasks);
    assert.equal(result.dockCollapsed,true);
    assert.equal(result.savedAt,'2026-02-01');
  });
}
test('empty local and remote boards stay empty',()=>{
  const app=boot({tasks:[],savedAt:'2026-01-01'});
  app.handlers.open();
  assert.ok(!app.overlay.innerHTML.includes('class="wm-card'));
  app.handlers.keydown({key:'Escape'});
  app.handlers.message({data:{type:'CIRCAEVUM_WORK_BOARD',board:{tasks:[],savedAt:'2026-02-01'}}});
  assert.deepEqual(JSON.parse(app.store.get(KEY)).tasks,[]);
  assert.equal(app.overlay.hidden,true);
});
test('new board starts closed without a dock',()=>{
 const app=boot(); assert.equal(app.overlay.hidden,true); assert.equal(app.elements.length,1);
 assert.ok(JSON.parse(app.store.get(KEY)).tasks.length>0);
});
