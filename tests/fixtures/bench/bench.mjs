// Test fixture bench: edits a design, shows the engine's outputs, and keeps projects in the shared Experiments panel.
import { notebook } from '../../../core/notebook.mjs';
import { ADAPTER } from './learn.mjs';

const $ = id => document.getElementById(id);
let setup = { design: { material: 'aluminium', shape: 'rect', b: 40, h: 30 }, loaded: true, mount: 200, dialX: 200, strainX: 200 };
function render() {
  $('material').value = setup.design.material; $('b').value = setup.design.b; $('h').value = setup.design.h;
  const r = ADAPTER.evaluate(JSON.parse(JSON.stringify(setup)));
  $('out').textContent = r.ok ? Object.values(r.outputs).slice(0, 3).map(o => `${o.label} ${o.value.toPrecision(4)} ${o.unit}`).join(' · ') : r.reason;
}
const nb = notebook($('experiments'), { adapter: ADAPTER, getSetup: () => JSON.parse(JSON.stringify(setup)), applySetup: s => { setup = s; render(); }, learn: '../tests/fixtures/bench/learn.mjs' });
setup = JSON.parse(JSON.stringify(nb.project().setup));
const edit = f => () => { f(); nb.sync(); render(); };
$('material').onchange = edit(() => { setup.design.material = $('material').value; });
$('b').onchange = edit(() => { setup.design.b = +$('b').value; });
$('h').onchange = edit(() => { setup.design.h = +$('h').value; });
render(); nb.render();
document.body.dataset.ready = 'true';
