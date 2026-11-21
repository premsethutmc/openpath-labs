// Pump set drive check UI. Every number and verdict comes from model.mjs; this file renders and records edits.
import { workbench } from '../core/workbench.mjs';
import * as M from './model.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'pumpset.project.v1';
const load = () => { try { const t = localStorage.getItem(KEY); return t ? M.deserialize(t) : null; } catch { return null; } };
let proj = load() || M.projectFromPreset('tank4');
let ui = { compare: [], msg: {} };
const save = () => { try { localStorage.setItem(KEY, M.serialize(proj)); } catch {} };
const f = (v, d) => Number.isFinite(v) ? v.toFixed(d) : '–';
const act = (k, fn) => { try { const t = fn(); ui.msg = { [k]: t ? { ok: true, text: t } : null }; } catch (e) { ui.msg = { [k]: { text: e.message } }; } save(); render(); };
const msg = k => ui.msg[k] ? `<p class="msg ${ui.msg[k].ok ? 'okmsg' : ''}" role="alert">${esc(ui.msg[k].text)}</p>` : '';
const num = (id, label, value, step, unit) => `<label class="field"><span>${label}${unit ? ` <span class="unit">${unit}</span>` : ''}</span><input id="${id}" type="number" inputmode="decimal" step="${step}" value="${value}"></label>`;
const onNum = (id, fn) => { const el = $(id); if (el) el.onchange = () => act(el.closest('.module').dataset.module, () => fn(+el.value)); };

function paintBar() {
  $('projectbar').innerHTML = M.PRESETS.map(p => `<button type="button" data-preset="${p.id}">Preset: ${esc(p.name)}</button>`).join('')
    + `<button type="button" class="buildbtn" id="newproj">+ New project</button><button type="button" id="export">Export project</button><label class="filebtn">Import project<input type="file" id="import" accept="application/json,.json"></label>`;
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { proj = M.projectFromPreset(b.dataset.preset); ui = { compare: [], msg: {} }; save(); render(); });
  $('newproj').onclick = () => { proj = M.newProject(); ui = { compare: [], msg: {} }; save(); render(); };
  $('export').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([M.serialize(proj)], { type: 'application/json' })); a.download = `${proj.name.replace(/[^\w-]+/g, '-')}.json`; a.click(); URL.revokeObjectURL(a.href); };
  $('import').onchange = async e => { const file = e.target.files[0]; if (!file) return; try { proj = M.deserialize(await file.text()); ui = { compare: [], msg: { runs: { ok: true, text: `Opened “${proj.name}” with ${proj.runs.length} saved runs.` } } }; } catch (err) { ui.msg = { runs: { text: err.message } }; } save(); render(); bench.open('runs'); };
}

function paintScheme(r) {
  const s = proj.system, top = Math.max(s.tankHeight, 2), bot = Math.min(s.sumpLevel, 0) - 1, Y = z => 20 + (top - z) / (top - bot) * 190;
  const ok = r.drive.state === 'pass', bad = r.drive.state === 'fail';
  $('scheme').innerHTML = `
    <rect x="30" y="${Y(s.sumpLevel)}" width="120" height="${Y(bot) - Y(s.sumpLevel)}" class="water"/><text x="34" y="${Y(bot) + 14}" class="lbl">sump</text>
    <path d="M90 ${Y(s.sumpLevel) + 10} V${Y(0)} H230" class="pipe"/>
    <rect x="230" y="${Y(0) - 16}" width="44" height="32" rx="6" class="pumpbox"/><text x="252" y="${Y(0) + 4}" class="lbl" text-anchor="middle">pump</text>
    <line x1="274" x2="300" y1="${Y(0)}" y2="${Y(0)}" class="shaft"/>
    <rect x="300" y="${Y(0) - 18}" width="70" height="36" rx="6" class="motor ${ok ? 'ok' : bad ? 'bad' : 'na'}"/><text x="335" y="${Y(0) + 4}" class="lbl" text-anchor="middle">motor</text>
    <path d="M252 ${Y(0) - 16} V${Y(s.tankHeight) + 4} H480" class="pipe ${r.flow.pass ? '' : 'short'}"/>
    <rect x="480" y="${Y(s.tankHeight) - 10}" width="90" height="40" class="tank"/><text x="525" y="${Y(s.tankHeight) + 14}" class="lbl" text-anchor="middle">tank</text>
    <line x1="590" x2="590" y1="${Y(s.tankHeight)}" y2="${Y(0)}" class="dimline"/><text x="584" y="${(Y(s.tankHeight) + Y(0)) / 2}" class="lbl" text-anchor="end">${s.tankHeight} m</text>
    <text x="160" y="${Y(s.sumpLevel) + 4}" class="lbl">${s.sumpLevel} m</text>
    <text x="${(252 + 480) / 2}" y="${Y(s.tankHeight) + 22}" class="dim" text-anchor="middle">delivery Ø${f(s.delivery.D * 1000, 0)} mm × ${s.delivery.L} m ${esc(M.PIPES[s.delivery.material].name)}</text>`;
}

function paintModules(r) {
  const s = proj.system, mats = Object.entries(M.PIPES).map(([k, m]) => `<option value="${k}" ${s.delivery.material === k ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  $('m-pipework').innerHTML = `<h2>Pipework</h2>
    <div class="grid2">${num('tankH', 'Delivery height', s.tankHeight, 0.5, 'm above pump')}${num('sumpL', 'Water level', s.sumpLevel, 0.5, 'm (− below pump)')}
    ${num('dD', 'Delivery bore', +(s.delivery.D * 1000).toFixed(1), 1, 'mm')}${num('dL', 'Delivery length', s.delivery.L, 1, 'm')}
    <label class="field">Delivery pipe <select id="dMat">${mats}</select></label>${num('dE', 'Delivery elbows', s.delivery.elbows, 1, '')}
    ${num('sD', 'Suction bore', +(s.suction.D * 1000).toFixed(1), 1, 'mm')}${num('sL', 'Suction length', s.suction.L, 0.5, 'm')}
    ${num('wT', 'Water temperature', s.temp, 1, '°C')}${num('vO', 'Valve opening', Math.round(s.valveOpen * 100), 5, '%')}</div>${msg('pipework')}`;
  onNum('tankH', v => M.setSystem(proj, { tankHeight: v })); onNum('sumpL', v => M.setSystem(proj, { sumpLevel: v }));
  onNum('dD', v => M.setPipe(proj, 'delivery', { D: v / 1000 })); onNum('dL', v => M.setPipe(proj, 'delivery', { L: v })); onNum('dE', v => M.setPipe(proj, 'delivery', { elbows: v }));
  onNum('sD', v => M.setPipe(proj, 'suction', { D: v / 1000 })); onNum('sL', v => M.setPipe(proj, 'suction', { L: v }));
  onNum('wT', v => M.setSystem(proj, { temp: v })); onNum('vO', v => M.setSystem(proj, { valveOpen: v / 100 }));
  $('dMat').onchange = e => act('pipework', () => M.setPipe(proj, 'delivery', { material: e.target.value }));

  $('m-pump').innerHTML = `<h2>Pump and speed</h2><div class="grid2">${num('rpm', 'Operating speed', proj.pump.rpm, 10, 'rpm')}${num('d2', 'Impeller diameter', +(proj.pump.D2 * 1000).toFixed(1), 1, 'mm')}</div>
    <p class="note">Pump House's model pump (Euler equation with slip and losses), not a catalogue pump. The motor is direct-coupled, so this speed is the motor's speed too.</p>
    <p class="note">Efficiency at this point: <b>${f(r.operating.efficiency * 100, 1)} %</b> · NPSH available ${f(r.operating.npshAvailable, 2)} m, required ${f(r.operating.npshRequired, 2)} m</p>${msg('pump')}`;
  onNum('rpm', v => M.setPump(proj, { rpm: v })); onNum('d2', v => M.setPump(proj, { D2: v / 1000 }));

  $('m-duty').innerHTML = `<h2>Required flow</h2>${num('req', 'Flow the job needs', proj.requiredFlow, 0.1, 'L/s')}
    <p class="note">${f(proj.requiredFlow * 3.6, 2)} m³/h. This is your requirement, not a model output: the flow verdict compares the calculated flow with it.</p>${msg('duty')}`;
  onNum('req', v => M.setTarget(proj, v));

  $('m-motor').innerHTML = `<h2>Motor</h2><div class="chips" role="radiogroup" aria-label="Motor">${M.MOTORS.map(m => `<button type="button" role="radio" data-motor="${m.id}" aria-checked="${proj.motorId === m.id}">${m.name} <small>${m.speed[0]}–${m.speed[1]} rpm</small></button>`).join('')}</div>
    <p class="note">Continuous (S1) shaft output, valid only inside the stated speed band. Outputs follow the IEC standard series; illustrative, not a manufacturer's data sheet. Service factor 1.0.</p>
    <p class="note">At ${proj.pump.rpm} rpm this rating is ${f(r.drive.ratedTorqueAtSpeed, 2)} N·m of shaft torque; the pump needs ${f(r.operating.torque, 2)} N·m.</p>${msg('motor')}`;
  document.querySelectorAll('[data-motor]').forEach(b => b.onclick = () => act('motor', () => M.setMotor(proj, b.dataset.motor)));

  const R = proj.runs, sel = ui.compare.filter(i => i < R.length);
  const word = v => v === true ? 'yes' : v === false ? 'no' : 'n/a';
  const cmp = sel.length === 2 ? (() => { const [a, b] = sel.map(i => R[i]), ch = M.changedInputs(a, b), row = (k, fa, fb) => `<tr class="${fa !== fb ? 'chg' : ''}"><th>${k}</th><td>${fa}</td><td>${fb}</td></tr>`;
    return `<p class="note">Changed between them: <b>${ch.length ? ch.map(esc).join(', ') : 'nothing'}</b></p><table class="tbl cmp"><thead><tr><th></th><th>${esc(a.name)}</th><th>${esc(b.name)}</th></tr></thead><tbody>
      ${row('Flow (L/s)', f(a.result.operating.flow, 2), f(b.result.operating.flow, 2))}${row('Head (m)', f(a.result.operating.head, 2), f(b.result.operating.head, 2))}
      ${row('Shaft power (kW)', f(a.result.operating.shaftPower / 1000, 3), f(b.result.operating.shaftPower / 1000, 3))}${row('Torque (N·m)', f(a.result.operating.torque, 2), f(b.result.operating.torque, 2))}
      ${row('Flow met?', word(a.result.flow.pass), word(b.result.flow.pass))}${row('Motor OK?', word(a.result.drive.pass), word(b.result.drive.pass))}</tbody></table>`; })() : '<p class="note">Tick two runs to compare them.</p>';
  $('m-runs').innerHTML = `<h2>Runs</h2><div class="row"><input id="runName" aria-label="Run name" placeholder="Name (optional)" class="grow"><button type="button" class="primary" id="saveRun">Save run</button></div>${msg('runs')}
    <ul class="runs">${R.map((x, i) => { const rep = M.reproduce(x); return `<li><label><input type="checkbox" data-cmp="${i}" ${sel.includes(i) ? 'checked' : ''}> <b>${esc(x.name)}</b></label>
      <span>${f(x.result.operating.flow, 2)} L/s · ${f(x.result.operating.shaftPower / 1000, 3)} kW · flow ${x.result.flow.pass ? 'met' : 'short'} · motor ${x.result.drive.state === 'pass' ? 'OK' : x.result.drive.state === 'fail' ? 'overloaded' : 'n/a'}</span>
      <em class="${rep.ok ? 'okmsg' : 'badmsg'}" data-reproduced="${rep.ok}">${rep.ok ? 'reproduced from its saved inputs' : `does not reproduce: ${esc(rep.diffs.join(', '))}`}</em></li>`; }).join('') || '<li class="note">No runs saved yet.</li>'}</ul>${cmp}`;
  $('saveRun').onclick = () => act('runs', () => { const x = M.saveRun(proj, $('runName').value); return `Saved “${x.name}”.`; });
  document.querySelectorAll('[data-cmp]').forEach(c => c.onchange = () => { const i = +c.dataset.cmp; ui.compare = c.checked ? [...sel.filter(x => x !== i), i].slice(-2) : sel.filter(x => x !== i); render(); });

  $('m-model').innerHTML = `<h2>What this check includes</h2>
    <p>Steady-state sizing check of a direct-coupled pump set. The pump side is Pump House's solver unchanged: pump curve from impeller geometry, Darcy–Weisbach pipe losses with Colebrook friction, fittings, NPSH. The operating point is where the pump curve meets the system curve.</p>
    <p>Two separate verdicts: the flow verdict compares calculated flow with your required flow; the drive verdict compares the shaft power the pump takes at this speed with the motor's continuous shaft-output rating, valid only inside its speed band. Torque = shaft power ÷ (2π × rpm ÷ 60).</p>
    <p class="note">Not modelled: motor starting and acceleration, the speed an overloaded motor would settle at, voltage and frequency variation, motor efficiency and electrical input, service factor, transients and water hammer, wear. Motors are illustrative IEC-series ratings, not a manufacturer's data.</p>`;
}

function render() {
  const r = M.evaluate(proj);
  $('title').textContent = proj.name;
  $('subtitle').textContent = `${proj.runs.length} saved run${proj.runs.length === 1 ? '' : 's'} · saved in this browser · export to keep a file`;
  paintBar(); paintScheme(r);
  $('v-flow').className = `vcard ${r.flow.pass ? 'ok' : 'bad'}`; $('vf-word').textContent = r.flow.pass ? 'Yes' : 'No'; $('vf-why').textContent = r.flow.reason;
  $('v-drive').className = `vcard ${r.drive.state === 'pass' ? 'ok' : r.drive.state === 'fail' ? 'bad' : 'warn'}`;
  $('vd-word').textContent = r.drive.state === 'pass' ? 'Yes' : r.drive.state === 'fail' ? 'No' : 'Not applicable'; $('vd-why').textContent = `${r.drive.motor}: ${r.drive.reason}`;
  $('design').className = `design ${r.design ? 'ok' : 'bad'}`;
  $('design').textContent = r.design ? 'Design works: the flow is met and the motor copes.' : !r.flow.pass && r.drive.pass ? 'Design does not work yet: the motor copes, but the flow falls short.' : r.flow.pass && r.drive.state === 'fail' ? 'Design does not work yet: the flow is met, but the motor is overloaded.' : 'Design does not work yet.';
  $('r-flow').textContent = `${f(r.operating.flow, 2)} L/s`; $('r-head').textContent = `${f(r.operating.head, 2)} m`;
  $('r-power').textContent = `${f(r.operating.shaftPower / 1000, 3)} kW`; $('r-torque').textContent = `${f(r.operating.torque, 2)} N·m`;
  $('r-rated').textContent = `${r.drive.rated / 1000} kW`;
  $('r-margin').textContent = r.drive.state === 'not-applicable' ? 'n/a' : `${r.drive.margin >= 0 ? '+' : ''}${f(r.drive.margin * 100, 1)} %`;
  $('r-margin').className = r.drive.state === 'fail' ? 'warn' : '';
  paintModules(r);
}

const bench = workbench('pumpset', { initial: 'pipework' });
render();
document.body.dataset.ready = 'true';
