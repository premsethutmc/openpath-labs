// Journey list: every journey in the registry that loads, plus the learner's record (export / import).
import { JOURNEYS } from '../content/journeys/index.mjs';
import { BENCHES } from '../content/benches.mjs';
import { listJourneys, listBenches } from './load.mjs';
import { openLedger } from '../core/ledger.mjs';
import { openStore } from '../core/project.mjs';
import { pageFor } from '../core/open-loop.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ledger = openLedger();
const [journeys, benches] = await Promise.all([listJourneys(JOURNEYS), listBenches(BENCHES)]);
// the learner's own projects on every registered open bench, from each bench's store in this browser
const titled = await Promise.all(benches.map(async l => ({ learn: l, title: l.title ?? (await l.adapter().catch(() => null))?.title ?? l.domain })));
const own = titled.flatMap(({ learn, title }) => openStore(learn.domain).list().map(p => ({ learn, title, p })));
// Open benches stay listed whatever the learner has saved. A saved design's main action opens that exact project on its
// editable bench (?project=<id>); Predict and learn is a separate, optional action.
const benchPage = l => l.openPage ?? (l.page ? l.page.replace(/[?&]project=[^&]*/, '').replace(/\?$/, '') : null);
$('benches').innerHTML = titled.filter(({ learn }) => benchPage(learn)).map(({ learn, title }) => `<li><a href="${esc(benchPage(learn))}" data-bench="${esc(learn.domain)}"><b>${esc(title)}</b><span>Open bench</span></a></li>`).join('')
  || '<li class="quiet">No open benches are available.</li>';
$('own').innerHTML = own.length ? own.map(({ learn, title, p }) => `<li class="design" data-project="${esc(p.id)}" data-open="${esc(learn.domain)}">
    <div class="what"><b>${esc(p.name)}</b><span>${esc(title)} · ${p.runs} runs</span></div>
    <div class="acts"><a class="main" data-act="open" href="${esc(pageFor(learn.page, p.id))}">Open design</a>
      <a data-act="learn" href="./journey.html?open=${encodeURIComponent(learn.domain)}&project=${encodeURIComponent(p.id)}">Predict and learn</a></div></li>`).join('')
  : '<li class="quiet">No designs yet. Open a bench above and save a run; your design will appear here.</li>';
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
