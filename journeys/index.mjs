// Journey list: every journey in the registry that loads, plus the learner's record (export / import).
import { JOURNEYS } from '../content/journeys/index.mjs';
import { BENCHES } from '../content/benches.mjs';
import { listJourneys, listBenches } from './load.mjs';
import { openLedger } from '../core/ledger.mjs';
import { openStore } from '../core/project.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ledger = openLedger();
const [journeys, benches] = await Promise.all([listJourneys(JOURNEYS), listBenches(BENCHES)]);
// the learner's own projects on every registered open bench, from each bench's store in this browser
const titled = await Promise.all(benches.map(async l => ({ learn: l, title: l.title ?? (await l.adapter().catch(() => null))?.title ?? l.domain })));
const own = titled.flatMap(({ learn, title }) => openStore(learn.domain).list().map(p => ({ learn, title, p })));
$('own').innerHTML = own.length ? own.map(({ learn, title, p }) => `<li><a href="./journey.html?open=${encodeURIComponent(learn.domain)}&project=${encodeURIComponent(p.id)}" data-open="${esc(learn.domain)}" data-project="${esc(p.id)}"><b>${esc(p.name)}</b><span>${esc(title)} · ${p.runs} run${p.runs === 1 ? '' : 's'} · Predict and learn</span></a></li>`).join('')
  : `<li class="quiet">No designs yet. Build something on a bench${benches.length ? ` (${benches.map(l => `<a href="${esc(l.page)}">${esc(l.title ?? l.domain)}</a>`).join(', ')})` : ''}, then press Predict and learn in its Experiments panel.</li>`;
$('list').innerHTML = journeys.length ? journeys.map(j => `<li><a href="./journey.html?j=${encodeURIComponent(j.id)}" data-journey="${esc(j.id)}"><b>${esc(j.title)}</b><span>${esc([j.course, j.semester ? `semester ${j.semester}` : ''].filter(Boolean).join(' · '))}</span></a></li>`).join('')
  : '<li class="quiet">No journeys are available yet.</li>';
const learner = () => { $('learner').textContent = `Learner ${ledger.learner} · ${ledger.events().length} answers and help events`; };
learner();
$('export').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ledger.exportJSON()], { type: 'application/json' })); a.download = 'openpath-learning-record.json'; a.click(); URL.revokeObjectURL(a.href); };
$('import').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const n = ledger.importJSON(await f.text()); $('msg').className = 'msg okmsg'; $('msg').textContent = `Imported ${n} events.`; learner(); }
  catch (err) { $('msg').className = 'msg'; $('msg').textContent = err.message; }
};
document.body.dataset.ready = 'true';
