/* Cybersprouts — roadmap view. Positions module nodes over the vine SVG
   using the same 1000 x 1560 coordinate space the path is drawn in. */

const CANVAS_W = 1000;
const CANVAS_H = 1560;

const pctX = x => (x / CANVAS_W) * 100;
const pctY = y => (y / CANVAS_H) * 100;

function statusLabel(status, prog) {
  if (status === 'done') return 'Complete';
  if (status === 'locked') return 'Locked';
  if (prog.done > 0) return `${prog.done}/${prog.total} lessons`;
  return status === 'current' ? 'Up next' : `${prog.total} lessons`;
}

function trackKicker(mod, index) {
  if (mod.track === 'core') return `Module ${String(index + 1).padStart(2, '0')}`;
  if (mod.track === 'red') return 'Red team';
  if (mod.track === 'blue') return 'Blue team';
  return 'Anytime';
}

function buildNode(mod, state) {
  const prog = moduleProgress(mod, state);
  const status = moduleStatus(mod, state);
  const idx = CORE_ORDER.indexOf(mod.id);
  const teamClass = mod.track === 'red' || mod.track === 'blue' ? mod.track : '';
  const side = mod.pos.side;

  const dot = document.createElement('div');
  dot.className = `node-dot ${status} ${teamClass}`.trim();
  dot.style.left = pctX(mod.pos.x) + '%';
  dot.style.top = pctY(mod.pos.y) + '%';

  const card = document.createElement(status === 'locked' ? 'div' : 'a');
  card.className = `node-card side-${side} ${status} ${teamClass}`.trim();
  if (status !== 'locked') card.href = `lesson.html?module=${mod.id}`;
  card.style.top = pctY(mod.pos.y) + '%';
  if (side === 'left') card.style.right = `calc(${100 - pctX(mod.pos.x)}% + 34px)`;
  else card.style.left = `calc(${pctX(mod.pos.x)}% + 34px)`;

  card.innerHTML = `
    <span class="kicker">${trackKicker(mod, idx)}</span>
    <h3>${mod.title}</h3>
    <div class="meta">${statusLabel(status, prog)}</div>
    <div class="bar"><i style="width:${prog.pct}%"></i></div>`;

  return [dot, card];
}

function buildListItem(mod, state) {
  const prog = moduleProgress(mod, state);
  const status = moduleStatus(mod, state);
  const idx = CORE_ORDER.indexOf(mod.id);
  const teamClass = mod.track === 'red' || mod.track === 'blue' ? mod.track : '';
  const el = document.createElement(status === 'locked' ? 'div' : 'a');
  el.className = `node-card ${status} ${teamClass}`.trim();
  if (status !== 'locked') el.href = `lesson.html?module=${mod.id}`;
  el.innerHTML = `
    <span class="kicker">${trackKicker(mod, idx)}</span>
    <h3>${mod.title}</h3>
    <div class="meta">${statusLabel(status, prog)}</div>
    <div class="bar"><i style="width:${prog.pct}%"></i></div>`;
  return el;
}

function render() {
  const state = Store.read();
  applyTheme(state.team);

  /* --- nodes over the vine --- */
  const nodes = document.getElementById('nodes');
  const list = document.getElementById('list');
  nodes.innerHTML = '';
  list.innerHTML = '';

  const positioned = CURRICULUM.filter(m => m.pos);
  positioned.forEach(mod => buildNode(mod, state).forEach(n => nodes.appendChild(n)));

  /* --- stacked fallback, bottom-of-vine order --- */
  const addDivider = text => {
    const d = document.createElement('div');
    d.className = 'divider';
    d.textContent = text;
    list.appendChild(d);
  };
  addDivider('Core path');
  CORE_ORDER.forEach(id => list.appendChild(buildListItem(getModule(id), state)));
  addDivider('Red team');
  CURRICULUM.filter(m => m.track === 'red').forEach(m => list.appendChild(buildListItem(m, state)));
  addDivider('Blue team');
  CURRICULUM.filter(m => m.track === 'blue').forEach(m => list.appendChild(buildListItem(m, state)));

  /* --- vine "growth": light up the trunk once the core is done --- */
  const coreDone = CORE_ORDER.every(id => {
    const p = moduleProgress(getModule(id), state);
    return p.done === p.total;
  });
  document.getElementById('trunk').classList.toggle('grown', coreDone);
  document.getElementById('branch-red').classList.toggle('live', state.team === 'red');
  document.getElementById('branch-blue').classList.toggle('live', state.team === 'blue');

  /* --- progress ring --- */
  const p = overallProgress(state);
  const circumference = 264;
  document.getElementById('ring-fill').style.strokeDashoffset =
    circumference - (circumference * p.pct) / 100;
  document.getElementById('pct').textContent = p.pct + '%';
  document.getElementById('pct-sub').textContent = `${p.done} of ${p.total} lessons`;

  /* --- specialization switch --- */
  const unlocked = branchesUnlocked(state);
  document.querySelectorAll('#team-switch button').forEach(btn => {
    btn.disabled = !unlocked;
    btn.classList.toggle('on', state.team === btn.dataset.team);
  });
  document.getElementById('team-note').textContent = unlocked
    ? 'You can switch sides at any time — both branches stay open.'
    : 'Unlocks after you finish Networking Fundamentals.';

  document.getElementById('vine-sub').textContent = unlocked
    ? 'The fork is open. Pick a side — or walk both.'
    : 'Start at the seed and grow upward. After networking, the vine splits.';
}

document.getElementById('team-switch').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  Store.update(s => { s.team = s.team === btn.dataset.team ? null : btn.dataset.team; });
  render();
  renderHeader('roadmap');
});

initChrome('roadmap');
render();
