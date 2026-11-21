// Experiments panel shared by every bench: the learner's projects, saved runs, reproduce, compare, fork,
// export and import. Domain-free — it only talks to core/project.mjs and the bench's adapter.
//   notebook(el, { adapter, getSetup, applySetup, storage? }) → { sync(), render(), project() }
//   getSetup()      the bench's current setup (plain data)
//   applySetup(s)   load a setup into the bench's editor (opening a project, a fork, an import)
import * as P from './project.mjs';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => typeof v !== 'number' ? (v ?? '–') : !Number.isFinite(v) ? '–' : Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(3) : v === 0 ? '0' : v.toPrecision(3);
const VERDICT = { pass: 'yes', fail: 'no', 'cannot-assess': 'cannot assess', 'not-applicable': 'n/a' };

export function notebook(el, { adapter, getSetup, applySetup, storage }) {
  const store = P.openStore(adapter.domain, storage);
  let project = store.current();
  if (!project) { project = store.put(P.createProject({ domain: adapter.domain, name: `${adapter.title} 1`, setup: getSetup() })); store.open(project.id); }
  let compare = [], msg = null;

  const sync = () => { project.setup = getSetup(); store.put(project); };
  const say = (text, ok = false) => { msg = { text, ok }; render(); };
  const open = p => { project = p; store.put(p); store.open(p.id); compare = []; applySetup(structuredClone(p.setup)); };

  function render() {
    const runs = project.runs, sel = compare.filter(i => i < runs.length);
    const list = store.list();
    let cmp = '<p class="note">Tick two runs to compare them.</p>';
    if (sel.length === 2) {
      const [a, b] = sel.map(i => runs[i]), c = P.compareRuns(a, b);
      cmp = `<p class="note">Changed between them: <b class="nb-changed">${c.changed.length ? c.changed.map(d => esc(d.path)).join(', ') : 'nothing'}</b></p>
        <table class="tbl nb-cmp"><thead><tr><th></th><th>${esc(a.name)}</th><th>${esc(b.name)}</th></tr></thead><tbody>
        ${c.outputs.map(r => `<tr class="${r.changed ? 'chg' : ''}"><th>${esc(r.label)}${r.unit ? ` (${esc(r.unit)})` : ''}</th><td>${num(r.a)}</td><td>${num(r.b)}</td></tr>`).join('')}
        ${c.verdicts.map(r => `<tr class="${r.changed ? 'chg' : ''}"><th>${esc(r.label)}</th><td>${VERDICT[r.a] ?? '–'}</td><td>${VERDICT[r.b] ?? '–'}</td></tr>`).join('')}</tbody></table>`;
    }
    el.innerHTML = `<h2>Experiments</h2>
      <div class="row"><label class="nb-field grow">Project <select class="nb-open" aria-label="Open project">${list.map(p => `<option value="${p.id}" ${p.id === project.id ? 'selected' : ''}>${esc(p.name)} · ${p.runs} run${p.runs === 1 ? '' : 's'}</option>`).join('')}</select></label></div>
      <div class="row"><input class="nb-rename grow" aria-label="Project name" value="${esc(project.name)}"><button type="button" class="nb-fork">Fork</button><button type="button" class="nb-new">New project</button></div>
      <p class="note">${project.origin === 'scratch' ? 'Started from scratch' : project.origin.startsWith('fork:') ? `Forked from ${esc(project.origin.slice(5))}` : esc(project.origin)} · saved in this browser</p>
      <div class="row"><input class="nb-name grow" aria-label="Run name" placeholder="Run name (optional)"><button type="button" class="primary nb-save">Save run</button></div>
      ${msg ? `<p class="msg ${msg.ok ? 'okmsg' : ''}" role="alert">${esc(msg.text)}</p>` : ''}
      <ul class="nb-runs">${runs.map((r, i) => { const rep = P.reproduceRun(r, adapter); return `<li><label><input type="checkbox" data-cmp="${i}" ${sel.includes(i) ? 'checked' : ''}> <b>${esc(r.name)}</b></label>
        <span>${Object.values(r.outputs).slice(0, 3).map(o => `${esc(o.label)} ${num(o.value)}${o.unit ? ' ' + esc(o.unit) : ''}`).join(' · ')}</span>
        <em class="${rep.ok ? 'okmsg' : 'badmsg'}" data-reproduced="${rep.ok}">${rep.ok ? 'reproduced from its saved setup' : `does not reproduce: ${esc(rep.diffs.join(', '))}`}</em>
        <button type="button" class="nb-load" data-run="${r.id}">Load setup</button></li>`; }).join('') || '<li class="note">No runs saved yet.</li>'}</ul>
      ${cmp}
      <div class="row"><button type="button" class="nb-export">Export project</button><label class="nb-import">Import project<input type="file" accept="application/json,.json"></label></div>`;
    const $ = s => el.querySelector(s);
    $('.nb-open').onchange = e => { open(store.get(e.target.value)); msg = null; render(); };
    $('.nb-rename').onchange = e => { project.name = e.target.value.trim() || project.name; store.put(project); render(); };
    $('.nb-fork').onclick = () => { sync(); const f = store.put(P.forkProject(project)); open(f); say(`Forked into “${f.name}”: same setup, no runs yet.`, true); };
    $('.nb-new').onclick = () => { sync(); const p = store.put(P.createProject({ domain: adapter.domain, name: `${adapter.title} ${list.length + 1}`, setup: getSetup() })); open(p); say(`New project “${p.name}” from what is on the bench now.`, true); };
    $('.nb-save').onclick = () => { sync(); try { const r = P.saveRun(project, adapter, $('.nb-name').value); store.put(project); say(`Saved “${r.name}”.`, true); } catch (e) { say(e.message); } };
    el.querySelectorAll('[data-cmp]').forEach(c => c.onchange = () => { const i = +c.dataset.cmp; compare = c.checked ? [...sel.filter(x => x !== i), i].slice(-2) : sel.filter(x => x !== i); render(); });
    el.querySelectorAll('.nb-load').forEach(b => b.onclick = () => { const r = project.runs.find(x => x.id === b.dataset.run); applySetup(structuredClone(r.setup)); sync(); say(`Loaded the setup of “${r.name}” onto the bench.`, true); });
    $('.nb-export').onclick = () => { sync(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([P.serialize(project)], { type: 'application/json' })); a.download = `${project.name.replace(/[^\w-]+/g, '-')}.json`; a.click(); URL.revokeObjectURL(a.href); };
    $('.nb-import input').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const p = P.deserialize(await f.text(), adapter.domain); p.id = null; open(store.put(p)); say(`Imported “${p.name}” with ${p.runs.length} runs.`, true); } catch (err) { say(err.message); } };
  }
  return { sync, render, project: () => project };
}
