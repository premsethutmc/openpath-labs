// Journey list: every journey in the registry that loads, plus the learner's record (export / import).
import { JOURNEYS } from '../content/journeys/index.mjs';
import { listJourneys } from './load.mjs';
import { openLedger } from '../core/ledger.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ledger = openLedger();
const journeys = await listJourneys(JOURNEYS);
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
