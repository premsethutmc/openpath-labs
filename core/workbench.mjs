// Workbench dock: builds a tab row from every <section class="module" data-module="id" data-title="Name">
// inside .side, shows exactly one at a time, and remembers the choice per lab.
// lock(ids) greys out modules (Learn mode hides controls until the learner has predicted).
export function workbench(key, { initial } = {}) {
  const dock = document.querySelector('.dock'), mods = [...document.querySelectorAll('.side .module[data-module]')];
  let locked = new Set(), current = null;
  const store = `wb.${key}`;
  dock.setAttribute('role', 'tablist');
  dock.innerHTML = mods.map(m => `<button type="button" role="tab" id="tab-${m.dataset.module}" aria-controls="${m.id || (m.id = 'mod-' + m.dataset.module)}" data-open="${m.dataset.module}">${m.dataset.title}</button>`).join('');
  mods.forEach(m => { m.setAttribute('role', 'tabpanel'); m.setAttribute('aria-labelledby', `tab-${m.dataset.module}`); });
  const open = id => {
    if (locked.has(id)) return;
    current = id;
    mods.forEach(m => { m.hidden = m.dataset.module !== id; });
    dock.querySelectorAll('[data-open]').forEach(b => { b.setAttribute('aria-selected', String(b.dataset.open === id)); b.tabIndex = b.dataset.open === id ? 0 : -1; });
    dock.querySelector(`[data-open="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    try { localStorage.setItem(store, id); } catch {}
    document.dispatchEvent(new CustomEvent('module', { detail: id }));
  };
  dock.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) open(b.dataset.open); });
  dock.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const ids = mods.map(m => m.dataset.module).filter(id => !locked.has(id)), i = ids.indexOf(current);
    open(ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]); dock.querySelector(`[data-open="${current}"]`).focus();
  });
  const lock = ids => {
    locked = new Set(ids);
    dock.querySelectorAll('[data-open]').forEach(b => { const l = locked.has(b.dataset.open); b.classList.toggle('locked', l); b.disabled = l; b.title = l ? 'Answer the mission first' : ''; });
    if (locked.has(current)) open(mods.map(m => m.dataset.module).find(id => !locked.has(id)));
  };
  let first = initial || mods[0].dataset.module; try { first = localStorage.getItem(store) || first; } catch {}
  open(mods.some(m => m.dataset.module === first) ? first : mods[0].dataset.module);
  return { open, lock, get current() { return current; } };
}
