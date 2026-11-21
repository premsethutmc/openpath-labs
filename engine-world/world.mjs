import { createRenderer } from '../core/gl3d.mjs';
import { OILS, viscosity, blend, ageOil } from '../engines/thermofluids/oil.mjs';
import { ENGINE, operatingPoint, bearing, rodLoad, cranking, oilPressureDelay, soak, warmUp, startWear, oilPressure, coolantFreezePoint, warmUpSeries } from '../engines/thermofluids/engine.mjs';
import { CAMS, SPRINGS, timing, volumetricEfficiency, machIndex, tunedRpm, floatRpm, valveClearance, idleQuality, intakeLift, exhaustLift } from '../engines/thermofluids/breathing.mjs';
import { PARTS, emptyBuild, complete, fit, remove, has, option, isComplete, buildEffects } from './assembly.mjs';
import { engineItems, SCENE_TARGET } from './scene.mjs';

const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PLACES = [
  { id: 'chennai', name: 'Chennai summer', T: 38 }, { id: 'delhi', name: 'Delhi winter', T: 5 },
  { id: 'shimla', name: 'Shimla', T: -10 }, { id: 'ladakh', name: 'Ladakh', T: -25 }, { id: 'alaska', name: 'Alaska', T: -35 },
];
const S = {
  oilKey: '5W-30', blendA: '0W-20', blendB: '20W-50', blendF: 0.5, history: 'fresh', age: 1.25,
  place: 'chennai', hours: 96, rpm: 3000, thr: 0.6, ot: 95,
  phase: 'off', crank: null, start: null, guess: null, gallery: 1, warmed: false,
  tab: 'build', build: emptyBuild(), choice: {}, flash: null, gly: 50,
  camId: 'stock', cam: { ...CAMS.stock }, spring: 'standard', runner: 0.35, prevDyno: null,
};
const br = () => ({ cam: S.cam, runner: S.runner, spring: S.spring });
const airAt = rpm => volumetricEfficiency(rpm, br());
const breathe = rpm => ({ ve: airAt(rpm).ve, evo: timing(S.cam).evo });
const fx = () => buildEffects(S.build);
const frozen = () => engineT() < coolantFreezePoint(S.gly);

// ---------- model glue ----------
const baseOil = () => (S.oilKey === 'blend' ? blend(OILS[S.blendA], OILS[S.blendB], S.blendF) : OILS[S.oilKey]);
const oil = () => (S.history === 'desert' ? ageOil(baseOil(), S.age) : baseOil());
const place = () => PLACES.find(p => p.id === S.place);
const engineT = () => soak(90, place().T, S.hours);
const fmt = (n, d = 0) => (Math.abs(n) >= 10000 ? Math.round(n).toLocaleString('en-IN') : n.toFixed(d));
const conf = c => `<span class="conf ${c}">${{ reliable: 'Reliable', approximate: 'Approximate', assumption: 'Assumption' }[c]}</span>`;
const li = (label, value, c, cls = '') => `<li class="${cls}"><span>${label}</span><b>${value}</b>${c ? conf(c) : ''}</li>`;
function oilColour(T, o) {
  const v = viscosity(o, T);
  if (v.gelled) return '#5b4a33';
  const t = Math.max(0, Math.min(1, (Math.log10(v.mu) - 0.5) / 3.5)); // thin → thick
  const a = [214, 160, 52], b = [74, 40, 10], c = a.map((x, i) => Math.round(x + (b[i] - x) * t));
  return '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
}

// ---------- panels ----------
function paintOilChips() {
  const keys = [...Object.keys(OILS), 'blend'];
  $('oils').innerHTML = keys.map(k => `<button type="button" role="radio" data-oil="${k}" aria-checked="${S.oilKey === k}">${k === 'blend' ? 'Blend your own' : OILS[k].name}</button>`).join('');
  $('oils').querySelectorAll('button').forEach(b => b.onclick = () => { S.oilKey = b.dataset.oil; resetStart(); paint(); });
  const opts = Object.keys(OILS).map(k => `<option value="${k}">${OILS[k].name}</option>`).join('');
  if (!$('blend-a').options.length) { $('blend-a').innerHTML = opts; $('blend-b').innerHTML = opts; $('blend-a').value = S.blendA; $('blend-b').value = S.blendB; }
  $('blendbox').hidden = S.oilKey !== 'blend';
  $('blend-out').textContent = `${Math.round(S.blendF * 100)} %`;
}

function paintChart() {
  const o = oil(), ref = OILS['5W-30'], W = 340, H = 170, x0 = 38, y0 = 150, xw = 292, yh = 136;
  const X = T => x0 + (T + 40) / 190 * xw, Y = mu => y0 - (Math.log10(Math.max(mu, 1)) / 5) * yh;
  let s = '';
  for (const p of [1, 10, 100, 1000, 10000, 100000]) s += `<path d="M${x0} ${Y(p)}H${x0 + xw}" stroke="#e1e5df"/><text x="${x0 - 4}" y="${Y(p) + 3}" text-anchor="end" class="tick">${p >= 1000 ? p / 1000 + 'k' : p}</text>`;
  for (const T of [-40, 0, 40, 100, 150]) s += `<text x="${X(T)}" y="${y0 + 13}" text-anchor="middle" class="tick">${T}°</text>`;
  if (o.pour > -40) s += `<rect x="${x0}" y="${y0 - yh}" width="${X(o.pour) - x0}" height="${yh}" fill="url(#gel)"/><text x="${x0 + 4}" y="${y0 - yh + 11}" class="tick gel">solid below ${fmt(o.pour)} °C</text>`;
  const curve = (oo, cls) => {
    const pts = [];
    for (let T = Math.max(-40, Math.ceil(oo.pour)); T <= 150; T += 2) pts.push(`${X(T).toFixed(1)},${Y(viscosity(oo, T).mu).toFixed(1)}`);
    return `<polyline class="${cls}" points="${pts.join(' ')}" fill="none"/>`;
  };
  if (S.oilKey !== '5W-30' || S.history === 'desert') s += curve(ref, 'refline');
  s += curve(o, 'oilline');
  const T = S.phase === 'running' ? S.ot : engineT(), v = viscosity(o, T);
  if (!v.gelled) s += `<circle cx="${X(T)}" cy="${Y(v.mu)}" r="5" class="mark"/><text x="${Math.min(X(T) + 8, W - 70)}" y="${Y(v.mu) - 8}" class="tick strong">${fmt(v.mu)} mPa·s</text>`;
  else s += `<path d="M${X(T)} ${y0}V${y0 - yh}" class="mark-line"/>`;
  s += `<text x="${x0}" y="10" class="tick">thickness, mPa·s (log scale)</text>`;
  $('vchart').innerHTML = `<title id="vchart-t">Thickness of ${o.name} against temperature</title><defs><pattern id="gel" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v6" stroke="#b9c7d3" stroke-width="2"/></pattern></defs>` + s;
  const v40 = viscosity(o, 40), v100 = viscosity(o, 100);
  $('oil-note').innerHTML = `${o.name}: ${fmt(v40.mu)} mPa·s at 40 °C, ${fmt(v100.mu, 1)} at 100 °C ${conf('reliable')}. Below 0 °C ${conf('approximate')}.${S.oilKey !== '5W-30' || S.history === 'desert' ? ' Grey line: fresh 5W-30 for comparison.' : ''}`;
}

function paintPlaces() {
  $('places').innerHTML = PLACES.map(p => `<button type="button" role="radio" data-place="${p.id}" aria-checked="${S.place === p.id}">${p.name} ${p.T > 0 ? '+' : ''}${p.T} °C</button>`).join('');
  $('places').querySelectorAll('button').forEach(b => b.onclick = () => { S.place = b.dataset.place; resetStart(); paint(); });
  $('hours-out').textContent = S.hours >= 48 ? `${fmt(S.hours / 24, S.hours % 24 ? 1 : 0)} days` : `${S.hours} h`;
  const T = engineT();
  $('soak-note').innerHTML = `Engine and oil are now at <b>${fmt(T, 1)} °C</b> ${conf('reliable')} — a parked engine cools towards the air around it, losing most of the difference in the first few hours.`;
  document.body.dataset.climate = place().T < 0 ? 'cold' : place().T > 30 ? 'hot' : 'mild';
  const fp = coolantFreezePoint(S.gly);
  $('gly-out').textContent = `${S.gly} %`;
  $('coolant-note').innerHTML = `Coolant freezes at <b>${fmt(fp, 0)} °C</b> ${conf('reliable')}. ${frozen() ? '<b class="badtext">It is frozen solid now.</b> Ice expands about 9 % — it can crack the block or push out the core plugs.' : 'Safe at this temperature.'}`;
}

function paintPredict() {
  const el = $('predict');
  if (S.phase !== 'off') { el.innerHTML = S.guess ? `<p class="guessline">You said it <b>${S.guess === 'yes' ? 'would' : 'would not'}</b> start.</p>` : ''; return; }
  el.innerHTML = `<p class="think">Pause and think</p><p>With this oil, at ${fmt(engineT(), 0)} °C, will the engine start?</p>
    <div class="row">${['yes', 'no'].map(g => `<button type="button" class="guess" data-guess="${g}" aria-pressed="${S.guess === g}">${g === 'yes' ? 'Yes, it starts' : 'No, it won’t'}</button>`).join('')}</div>`;
  el.querySelectorAll('[data-guess]').forEach(b => b.onclick = () => { S.guess = b.dataset.guess; paintPredict(); });
}

function startResults() {
  const r = S.start; if (!r) return '';
  if (S.phase === 'cranking') return '<li class="verdict">Starter turning the engine…</li>';
  if (r.crashed) return `<li class="verdict bad">Crunch. On the first turn the open valves hit the piston crowns (gap ${fmt(valveClearance(S.cam).mm, 1)} mm). With this much lift and overlap the valves reach into the cylinder just as the piston arrives at the top. Bent valves — engine must come apart.</li>`;
  if (r.frozen) return `<li class="verdict bad">Do not start it: the coolant is frozen at ${fmt(r.T, 0)} °C (it freezes at ${fmt(coolantFreezePoint(S.gly), 0)} °C with ${S.gly} % antifreeze). With no coolant flowing the engine would overheat, and the ice may already have cracked the block.</li>`;
  const c = r.crank, T = r.T;
  let h = li('Battery power left at this temperature', `${fmt(c.battery * 100)} %`, 'approximate');
  h += li('Oil thickness at start', c.oil.gelled ? 'solid — below its pour point' : `${fmt(c.oil.mu)} mPa·s`, c.oil.band === 'reliable' ? 'reliable' : 'approximate');
  h += li('Cranking speed', `${fmt(c.rpm)} rpm (needs ${ENGINE.startRpm})`, 'approximate', c.starts ? 'good' : 'bad');
  if (!c.starts) {
    h += `<li class="verdict bad">${c.reason === 'gelled' ? 'The oil has turned almost solid. The starter cannot turn the engine at all.' : c.reason === 'no-turn' ? 'The starter cannot overcome the thick oil — the engine does not turn.' : 'The engine turns, but too slowly to fire. The battery runs flat.'}</li>`;
  } else {
    h += li('Time until oil reaches the bearings', r.delay.seconds > 600 ? 'never — the pump cannot draw the oil' : `${fmt(r.delay.seconds, 1)} s`, 'approximate', r.delay.seconds > 4 ? 'bad' : 'good');
    h += li('Bearings in the first seconds', r.regime, 'approximate', r.regime === 'full film' ? 'good' : 'bad');
    h += li('Wear from this start (index, 0–100)', fmt(r.wear), 'assumption', r.wear > 30 ? 'bad' : '');
    h += li('Oil pressure at idle, cold', `${fmt(r.pressure.bar, 1)} bar${r.pressure.relief ? ' (relief valve open)' : ''}`, 'approximate', r.pressure.low ? 'bad' : '');
    h += li('Idle warm-up to 90 °C', r.warm.reached ? `${fmt(r.warm.reached / 60, 0)} min` : 'over an hour', 'approximate');
    h += `<li class="verdict good">It started${r.delay.seconds > 4 ? ', but the bearings ran without fresh oil for several seconds' : ''}.</li>`;
  }
  if (S.guess) h += `<li class="verdict ${(S.guess === 'yes') === c.starts ? 'good' : 'bad'}">${(S.guess === 'yes') === c.starts ? 'Your prediction was right.' : 'Your prediction was wrong — look at the oil thickness and battery power.'}</li>`;
  return h;
}

function paintDrive() {
  const o = oil(), f = fx(), op = operatingPoint({ rpm: S.rpm, throttle: S.thr, oil: o, oilTemp: S.ot, compression: f.compressionFactor, friction: f.frictionFactor, ...breathe(S.rpm) });
  $('rpm-out').textContent = `${S.rpm} rpm`; $('thr-out').textContent = `${Math.round(S.thr * 100)} %`; $('ot-out').textContent = `${S.ot} °C`;
  let h = '';
  if (op.oil.gelled) h = `<li class="verdict bad">At ${S.ot} °C this oil is solid. The engine cannot run.</li>`;
  else {
    const tightHot = f.clearance < 12e-6 && S.ot > 60;
    const br = tightHot ? { hmin: 0, lambda: 0, regime: 'boundary' } : bearing({ load: rodLoad(op), rpm: S.rpm, muCp: op.oil.mu, b: { ...ENGINE.rodBearing, c: f.clearance } });
    const pr = oilPressure({ oil: o, T: S.ot, rpm: S.rpm, clearance: f.clearance });
    h += li('Torque', `${fmt(op.torque)} N·m`, 'approximate') + li('Power', `${fmt(op.power / 1000, 1)} kW`, 'approximate');
    h += li('Fuel energy turned into work', `${fmt(Math.max(0, op.efficiency) * 100)} %`, 'approximate');
    h += li('Lost to friction', `${fmt(op.frictionPower / 1000, 1)} kW (${fmt(op.frictionPower / op.fuelPower * 100)} % of fuel)`, 'approximate', op.frictionPower / op.fuelPower > 0.12 ? 'bad' : '');
    h += li('Peak cylinder pressure', `${fmt(op.pmax / 1e5)} bar at ${fmt(op.thPmax)}° after top`, 'approximate');
    h += li('Rod bearing oil film', `${fmt(br.hmin * 1e6, 1)} µm (${fmt(br.lambda, 1)}× surface roughness) — ${br.regime}`, 'approximate', br.regime === 'full film' ? 'good' : 'bad');
    h += li('Oil pressure', `${fmt(pr.bar, 1)} bar${pr.relief ? ' (relief valve open)' : ''}${pr.low ? ' — warning light on' : ''}`, 'approximate', pr.low ? 'bad' : 'good');
    if (tightHot) h += `<li class="verdict bad">Tight bearings, hot engine: the parts have expanded into the oil gap. Metal touches metal — this engine is about to seize.</li>`;
    if (f.warnings.length) h += `<li class="verdict warnline">Your build: ${f.warnings.join(' ')}</li>`;
    const air = airAt(S.rpm);
    if (air.floating) h += `<li class="verdict bad">Valve float: above ${fmt(air.floatRpm)} rpm the springs cannot pull the valves shut in time. They bounce, the cylinders fill badly — and a floating valve can meet a rising piston.</li>`;
    S.driveRegime = br.regime;
    if (op.torque < 0) h += `<li class="verdict bad">Friction is larger than the work from combustion: the engine cannot hold this speed.</li>`;
    drawPV(op);
  }
  $('drive-results').innerHTML = h;
}

function drawWarm() {
  const sr = S.start.series, x0 = 36, y0 = 138, xw = 290, yh = 120, tMax = sr.at(-1).t;
  const tMin = Math.min(...sr.map(p => p.T), 0), X = t => x0 + t / tMax * xw, Y = T => y0 - (T - tMin) / (100 - tMin) * yh;
  let s = `<path d="M${x0} ${y0 - yh}V${y0}H${x0 + xw}" stroke="#7d8a84" fill="none"/>`;
  for (const T of [tMin, 0, 45, 90]) s += `<text x="${x0 - 4}" y="${Y(T) + 3}" text-anchor="end" class="tick">${fmt(T)}°</text><path d="M${x0} ${Y(T)}H${x0 + xw}" stroke="#eef0ec"/>`;
  for (const t of [0, 10, 20, 30, 40]) s += `<text x="${X(t)}" y="${y0 + 13}" text-anchor="middle" class="tick">${t} min</text>`;
  s += `<polyline class="warmline" fill="none" points="${sr.map(p => `${X(p.t).toFixed(1)},${Y(p.T).toFixed(1)}`).join(' ')}"/>`;
  const idle = T => operatingPoint({ rpm: 1000, throttle: 0.15, oil: oil(), oilTemp: T, friction: fx().frictionFactor }).frictionPower / 1000;
  const f0 = idle(sr[0].T), f1 = idle(90);
  s += `<text x="${x0 + 6}" y="${y0 - yh + 10}" class="tick strong">friction at idle: ${fmt(f0, 1)} kW cold → ${fmt(f1, 1)} kW warm</text>`;
  if (S.ffT !== undefined) s += `<circle cx="${X(S.ffT)}" cy="${Y(S.ot)}" r="5" class="mark"/>`;
  $('warm').innerHTML = `<title id="warm-t">Engine temperature while idling: from ${fmt(sr[0].T)} °C to 90 °C</title>` + s;
}
$('warm-go').onclick = () => {
  const sr = S.start.series, t0 = performance.now(), speed = reduced ? 400 : 2.5; // simulated minutes per real second
  const step = now => {
    const t = Math.max(0, Math.min(sr.at(-1).t, (now - t0) / 1000 * speed));
    const k = Math.min(sr.length - 1, Math.round(t * 2));
    S.ffT = sr[k].t; S.ot = Math.round(sr[k].T); $('ot').value = S.ot;
    paintDrive(); paintGauges(); drawWarm();
    if (k < sr.length - 1 && S.phase === 'running') requestAnimationFrame(step); else { S.ffT = undefined; paint(); }
  };
  requestAnimationFrame(step);
};

function dynoCurve() {
  const pts = [];
  for (let rpm = 1000; rpm <= 7500; rpm += 250) {
    const op = operatingPoint({ rpm, throttle: 1, oil: oil(), oilTemp: 95, compression: fx().compressionFactor, friction: fx().frictionFactor, ...breathe(rpm) });
    pts.push({ rpm, torque: op.torque, power: op.power / 1000 });
  }
  return { name: S.camId === 'custom' ? 'Custom cam' : CAMS[S.camId].name + ' cam', pts };
}
function drawDyno(cur) {
  const x0 = 34, y0 = 172, xw = 270, yh = 150, X = r => x0 + (r - 1000) / 6500 * xw;
  const curves = [cur, S.prevDyno].filter(Boolean);
  const tMax = Math.max(140, ...curves.flatMap(c => c.pts.map(p => p.torque))), pMax = Math.max(80, ...curves.flatMap(c => c.pts.map(p => p.power)));
  const YT = t => y0 - Math.max(t, 0) / tMax * yh, YP = p => y0 - Math.max(p, 0) / pMax * yh;
  let s = `<path d="M${x0} ${y0 - yh}V${y0}H${x0 + xw}V${y0 - yh}" stroke="#9aa5a0" fill="none"/>`;
  for (const r of [2000, 4000, 6000]) s += `<text x="${X(r)}" y="${y0 + 13}" text-anchor="middle" class="tick">${r / 1000}k rpm</text>`;
  for (let k = 1; k <= 3; k++) s += `<text x="${x0 - 3}" y="${y0 - yh * k / 3 + 3}" text-anchor="end" class="tick" fill="#1d58c8">${fmt(tMax * k / 3)}</text><text x="${x0 + xw + 3}" y="${y0 - yh * k / 3 + 3}" class="tick">${fmt(pMax * k / 3)}</text>`;
  const line = (c, key, Y, cls) => `<polyline class="${cls}" fill="none" points="${c.pts.map(p => `${X(p.rpm).toFixed(1)},${Y(p[key]).toFixed(1)}`).join(' ')}"/>`;
  if (S.prevDyno && S.prevDyno.name !== cur.name) s += line(S.prevDyno, 'torque', YT, 'tq prev') + line(S.prevDyno, 'power', YP, 'pw prev');
  s += line(cur, 'torque', YT, 'tq') + line(cur, 'power', YP, 'pw');
  const best = cur.pts.reduce((a, b) => (b.power > a.power ? b : a)), bestT = cur.pts.reduce((a, b) => (b.torque > a.torque ? b : a));
  s += `<text x="${x0 + 4}" y="12" class="dynolabel" fill="#1d58c8">torque N·m · peak ${fmt(bestT.torque)} at ${fmt(bestT.rpm)}</text><text x="${x0 + xw}" y="24" text-anchor="end" class="dynolabel" fill="#e0531f">power kW · peak ${fmt(best.power, 1)} at ${fmt(best.rpm)}</text>`;
  if (S.prevDyno && S.prevDyno.name !== cur.name) s += `<text x="${x0 + 4}" y="${y0 - 6}" class="tick">dashed: ${S.prevDyno.name}</text>`;
  $('dyno').innerHTML = `<title id="dyno-t">${cur.name}: peak power ${fmt(best.power, 1)} kW at ${best.rpm} rpm, peak torque ${fmt(bestT.torque)} N·m at ${bestT.rpm} rpm</title>` + s;
  document.body.dataset.peakPower = best.power.toFixed(1);
}
function paintBreathe() {
  const keys = [...Object.keys(CAMS), 'custom'];
  $('cams').innerHTML = keys.map(k => `<button type="button" role="radio" data-cam="${k}" aria-checked="${S.camId === k}">${k === 'custom' ? 'Custom' : CAMS[k].name}</button>`).join('');
  $('cams').querySelectorAll('button').forEach(b => b.onclick = () => {
    if (b.dataset.cam === 'custom') return;
    S.prevDyno = dynoCurve(); S.camId = b.dataset.cam; S.cam = { ...CAMS[S.camId] };
    $('dur').value = S.cam.duration; $('lift').value = S.cam.lift; $('lc').value = S.cam.centre; resetStart(); paint();
  });
  $('springs').innerHTML = Object.entries(SPRINGS).map(([k, v]) => `<button type="button" role="radio" data-spring="${k}" aria-checked="${S.spring === k}">${v.name}</button>`).join('');
  $('springs').querySelectorAll('button').forEach(b => b.onclick = () => { S.prevDyno = dynoCurve(); S.spring = b.dataset.spring; paint(); });
  $('dur-out').textContent = `${S.cam.duration}°`; $('lift-out').textContent = `${S.cam.lift} mm`; $('lc-out').textContent = `${S.cam.centre}°`; $('run-out').textContent = `${fmt(S.runner * 100)} cm`;
  const t = timing(S.cam), air = airAt(S.rpm), cl = valveClearance(S.cam), fl = floatRpm(S.cam, S.spring);
  const deg = (v, ref, after, before) => (v >= ref ? `${fmt(v - ref)}° ${after}` : `${fmt(ref - v)}° ${before}`);
  let h = li('Inlet opens / closes', `${deg(t.ivo, 360, 'after top', 'before top')} / ${deg(t.ivc, 540, 'after bottom', 'before bottom')}`, 'reliable');
  h += li('Exhaust opens / closes', `${deg(t.evo, 180, 'after bottom', 'before bottom')} / ${deg(t.evc, 360, 'after top', 'before top')}`, 'reliable');
  h += li('Overlap (both valves open)', `${fmt(t.overlap)}° — idle ${idleQuality(S.cam)}`, 'assumption', t.overlap > 55 ? 'bad' : '');
  h += li(`Cylinder filling at ${S.rpm} rpm`, `${fmt(air.ve * 100)} %${air.Z > 0.6 ? ' — valves choking the flow' : ''}`, 'approximate', air.ve < 0.8 ? 'bad' : '');
  h += li('Intake runner resonance helps near', `${fmt(tunedRpm(S.runner), 0)} rpm`, 'approximate');
  h += li('Valve float starts at', `${fmt(fl, 0)} rpm`, 'approximate', fl < 7500 ? 'bad' : 'good');
  h += li('Closest valve-to-piston gap', `${fmt(cl.mm, 1)} mm`, 'reliable', cl.contact ? 'bad' : cl.mm < 1 ? 'bad' : 'good');
  if (cl.contact) h += `<li class="verdict bad">Valves will hit the pistons. Less lift, less duration, or a later intake lobe centre.</li>`;
  $('breathe-results').innerHTML = h;
  drawDyno(dynoCurve());
}

function drawPV(op) {
  const tr = op.trace, W = 340, x0 = 40, y0 = 165, xw = 286, yh = 150;
  const Vmax = Math.max(...tr.map(t => t.V)), pmax = Math.max(...tr.map(t => t.p));
  const X = V => x0 + (V / Vmax) * xw, Y = p => y0 - (p / (pmax * 1.08)) * yh;
  const pts = tr.map(t => `${X(t.V).toFixed(1)},${Y(t.p).toFixed(1)}`).join(' ');
  let s = `<path d="M${x0} ${y0 - yh}V${y0}H${x0 + xw}" stroke="#7d8a84" fill="none"/>`;
  for (let k = 1; k <= 4; k++) { const p = pmax * 1.08 * k / 4; s += `<text x="${x0 - 4}" y="${Y(p) + 3}" text-anchor="end" class="tick">${fmt(p / 1e5)}</text>`; }
  s += `<polyline points="${pts}" class="pvline" fill="none"/><text x="${x0}" y="10" class="tick">pressure, bar</text><text x="${x0 + xw}" y="${y0 + 16}" text-anchor="end" class="tick">cylinder volume → (${fmt(Vmax * 1e6)} cc)</text>`;
  s += `<text x="${x0 + 60}" y="${y0 - 30}" class="tick strong">area inside = work per cycle</text>`;
  $('pv').innerHTML = `<title id="pv-t">Pressure–volume diagram at ${S.rpm} rpm: peak ${fmt(op.pmax / 1e5)} bar</title>` + s;
}

function paintGauges() {
  const o = oil(), running = S.phase === 'running', T = running ? S.ot : engineT(), v = viscosity(o, T);
  $('g-temp').textContent = `${fmt(T, 0)} °C`;
  $('g-visc').textContent = v.gelled ? 'solid' : `${fmt(v.mu)} mPa·s`;
  $('g-speed-label').textContent = running ? 'Engine speed' : 'Crank speed';
  $('g-speed').textContent = S.phase === 'cranking' ? `${fmt(S.start.crank.rpm)} rpm` : running ? `${S.rpm} rpm` : '0 rpm';
  $('g-bearing').textContent = running ? (S.gallery < 1 ? 'waiting for oil' : S.driveRegime || '–') : S.phase === 'failed' ? 'stopped' : 'still';
  $('hud-state').textContent = { off: 'Engine off', cranking: 'Cranking…', running: 'Running', failed: 'Did not start' }[S.phase];
  $('hud-state').className = 'state ' + S.phase;
}

function paintBuild() {
  const n = S.build.fitted.length;
  $('build-progress').textContent = `${n} of ${PARTS.length} fitted${isComplete(S.build) ? ' — ready to run' : ''}`;
  $('parts').innerHTML = PARTS.map(p => {
    if (has(S.build, p.id)) {
      const o = option(S.build, p.id);
      return `<li class="done"><div class="ph"><span>✓ ${p.name}</span><button type="button" data-remove="${p.id}">Take off</button></div>${o ? `<small>${o.name}</small>` : ''}</li>`;
    }
    const opts = p.options ? `<div class="chips" role="radiogroup" aria-label="${p.name} choice">${p.options.map(o => `<button type="button" role="radio" data-part="${p.id}" data-opt="${o.id}" aria-checked="${(S.choice[p.id] || p.options[0].id) === o.id}">${o.name}</button>`).join('')}</div>` : '';
    return `<li><div class="ph"><span>${p.name}</span><button type="button" class="fit" data-fit="${p.id}">Fit</button></div>${opts}</li>`;
  }).join('');
  $('parts').querySelectorAll('[data-opt]').forEach(b => b.onclick = () => { S.choice[b.dataset.part] = b.dataset.opt; paintBuild(); });
  $('parts').querySelectorAll('[data-fit]').forEach(b => b.onclick = () => {
    const r = fit(S.build, b.dataset.fit, S.choice[b.dataset.fit]);
    const msg = $('build-msg');
    msg.className = 'msg ' + (r.ok ? 'ok' : 'bad');
    msg.innerHTML = r.message + (r.warn ? `<span class="warn">${r.warn}</span>` : '');
    if (r.ok) { S.build = r.build; S.flash = { id: b.dataset.fit, t: performance.now() }; resetStart(); }
    paint();
  });
  $('parts').querySelectorAll('[data-remove]').forEach(b => b.onclick = () => { S.build = remove(S.build, b.dataset.remove); $('build-msg').className = 'msg'; $('build-msg').textContent = 'Removed — along with anything that was fitted on top of it.'; resetStart(); paint(); });
  $('tab-run').disabled = false;
  $('tab-build').setAttribute('aria-selected', String(S.tab === 'build'));
  $('tab-run').setAttribute('aria-selected', String(S.tab === 'run'));
  $('build-panel').hidden = S.tab !== 'build';
  $('run-panel').hidden = S.tab !== 'run';
}

function paint() {
  paintBuild();
  paintOilChips(); paintChart(); paintPlaces(); paintPredict();
  $('history').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.history === S.history)));
  $('age-box').hidden = S.history !== 'desert';
  $('age-out').textContent = `+${Math.round((S.age - 1) * 100)} %`;
  $('start-results').innerHTML = startResults();
  $('key').textContent = S.phase === 'off' ? 'Turn the key' : 'Reset and try again';
  $('key').disabled = S.phase === 'cranking';
  $('warmbox').hidden = S.phase !== 'running';
  if (S.phase === 'running') drawWarm();
  paintDrive(); paintBreathe(); paintGauges();
  document.body.dataset.phase = S.phase;
}

function resetStart() { S.phase = 'off'; S.start = null; S.gallery = 1; S.warmed = false; }

// ---------- turning the key ----------
let crankTimer = null;
$('key').onclick = () => {
  if (S.phase !== 'off') { resetStart(); S.guess = null; paint(); return; }
  const o = oil(), T = engineT();
  if (frozen()) { S.start = { T, frozen: true }; S.phase = 'failed'; paint(); return; }
  if (valveClearance(S.cam).contact) { S.start = { T, crashed: true }; S.phase = 'failed'; paint(); return; }
  const crank = cranking({ oil: o, T });
  const delay = oilPressureDelay({ oil: o, T, rpm: 1000 });
  const idle = operatingPoint({ rpm: 1000, throttle: 0.15, oil: o, oilTemp: T });
  const regime = crank.oil.gelled ? 'boundary' : bearing({ load: rodLoad(idle), rpm: 1000, muCp: crank.oil.mu }).regime;
  const firstSeconds = delay.seconds > 2 ? 'boundary' : regime;
  S.start = { T, crank, delay, regime: firstSeconds, wear: startWear(Math.min(delay.seconds, 60), firstSeconds), warm: warmUp(T, place().T, 3600),
    pressure: oilPressure({ oil: o, T, rpm: 1000, clearance: fx().clearance }), series: warmUpSeries(T, place().T, 40) };
  S.phase = 'cranking'; S.gallery = 0;
  paint();
  clearTimeout(crankTimer);
  crankTimer = setTimeout(() => {
    S.phase = crank.starts ? 'running' : 'failed';
    if (crank.starts) { S.ot = Math.round(T); $('ot').value = S.ot; S.rpm = 1000; $('rpm').value = 1000; S.thr = 0.15; $('thr').value = 15; S.fillStart = performance.now(); }
    paint();
  }, reduced ? 50 : 2600);
};

// ---------- inputs ----------
$('tab-build').onclick = () => { S.tab = 'build'; resetStart(); paint(); };
$('tab-run').onclick = () => {
  if (!isComplete(S.build)) { $('build-msg').className = 'msg bad'; $('build-msg').textContent = `Finish building first: ${PARTS.filter(p => !has(S.build, p.id)).map(p => p.name.toLowerCase()).join(', ')} still to fit.`; return; }
  S.tab = 'run'; paint();
};
$('b-ready').onclick = () => { S.build = complete(); S.tab = 'run'; $('build-msg').className = 'msg'; resetStart(); paint(); };
$('b-strip').onclick = () => { S.build = emptyBuild(); $('build-msg').className = 'msg'; $('build-msg').textContent = 'Stripped down to the bare block.'; resetStart(); paint(); };
const customCam = () => { if (S.camId !== 'custom') S.prevDyno = dynoCurve(); S.camId = 'custom'; S.cam = { ...S.cam, duration: +$('dur').value, lift: +$('lift').value, centre: +$('lc').value }; resetStart(); paint(); };
$('dur').oninput = customCam; $('lift').oninput = customCam; $('lc').oninput = customCam;
$('runner').oninput = e => { if (!S.runnerDrag) S.prevDyno = { ...dynoCurve(), name: `runner ${fmt(S.runner * 100)} cm` }; S.runnerDrag = true; S.runner = +e.target.value / 100; paint(); };
$('runner').onchange = () => { S.runnerDrag = false; };
$('gly').oninput = e => { S.gly = +e.target.value; resetStart(); paint(); };
$('history').querySelectorAll('button').forEach(b => b.onclick = () => { S.history = b.dataset.history; resetStart(); paint(); });
$('age').oninput = e => { S.age = +e.target.value / 100; resetStart(); paint(); };
$('hours').oninput = e => { S.hours = +e.target.value; resetStart(); paint(); };
$('blend-a').onchange = e => { S.blendA = e.target.value; resetStart(); paint(); };
$('blend-b').onchange = e => { S.blendB = e.target.value; resetStart(); paint(); };
$('blend-f').oninput = e => { S.blendF = +e.target.value / 100; resetStart(); paint(); };
$('rpm').oninput = e => { S.rpm = +e.target.value; paintDrive(); paintBreathe(); paintGauges(); };
$('thr').oninput = e => { S.thr = +e.target.value / 100; paintDrive(); };
$('ot').oninput = e => { S.ot = +e.target.value; paintDrive(); paintGauges(); paintChart(); };

// ---------- 3D ----------
const canvas = $('gl');
const R = createRenderer(canvas);
const cam = { yaw: 0.75, pitch: 0.32, dist: 78, target: SCENE_TARGET };
let theta = 30, last = performance.now(), dragging = null, flowPhase = 0;
if (!R) $('nogl').hidden = false;
canvas.addEventListener('pointerdown', e => { dragging = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!dragging) return; cam.yaw = dragging.yaw - (e.clientX - dragging.x) * 0.01; cam.pitch = Math.max(-0.3, Math.min(1.2, dragging.pitch + (e.clientY - dragging.y) * 0.01)); });
canvas.addEventListener('pointerup', () => { dragging = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.max(45, Math.min(130, cam.dist * (1 + e.deltaY * 0.001))); }, { passive: false });

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  let revs = 0, label = '';
  if (S.phase === 'cranking') { revs = S.start.crank.rpm / 60; label = `real speed: ${fmt(S.start.crank.rpm)} rpm`; }
  if (S.phase === 'running') { const slow = Math.max(1, S.rpm / 60 / 1.5); revs = S.rpm / 60 / slow; label = `shown ${fmt(slow)}× slower`; }
  if (S.phase === 'running' && S.gallery < 1) {
    const d = Math.min(S.start.delay.seconds, 20);
    S.gallery = Math.min(1, (now - S.fillStart) / 1000 / d);
    if (S.gallery >= 1) paintGauges();
  }
  theta = (theta + revs * 360 * dt * (reduced ? 0.25 : 1)) % 720;
  const q = S.start?.delay?.flow || 0;
  flowPhase = (flowPhase + dt * (S.phase === 'running' ? Math.min(1.2, q * 800) : 0)) % 1;
  if (!dragging && !reduced && S.phase === 'off' && S.tab === 'run') cam.yaw += dt * 0.12;
  $('hud-speed').textContent = label;
  if (R) {
    const o = oil(), T = S.phase === 'running' ? S.ot : engineT(), amb = place().T;
    const flash = S.flash ? { id: S.flash.id, amount: Math.max(0, 1 - (now - S.flash.t) / 1200) } : null;
    R.draw(engineItems(theta, {
      parts: new Set(S.build.fitted.map(f => f.id)), flash,
      valves: { cam: S.cam, intakeLift, exhaustLift, crash: S.start?.crashed },
      running: S.phase === 'running', oilColor: oilColour(T, o), oilLevel: 0.55 * fx().oilLitres / 3.5,
      galleryFill: S.phase === 'running' ? S.gallery : S.phase === 'cranking' ? 0 : 1, flow: S.phase === 'running' ? 1 : 0, flowPhase,
      regime: S.phase === 'running' ? (S.gallery < 1 ? 'boundary' : S.driveRegime) : null,
      frost: S.phase === 'running' ? 0 : Math.max(0, Math.min(1, -amb / 30)) * (T < 0 ? 1 : 0),
      heat: Math.max(0, Math.min(1, (T - 60) / 60)),
    }), cam);
  }
  requestAnimationFrame(frame);
}
paint();
requestAnimationFrame(frame);
window.__engine = { state: S };
document.body.dataset.ready = 'true';
