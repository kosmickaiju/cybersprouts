/* Cybersprouts — roadmap view. Positions module nodes over the vine SVG
   using the same 1200 x 2860 coordinate space the paths are drawn in.

   Core modules hang off the winding trunk on alternating sides; branch
   modules sit centred on their own column, threaded onto the branch stem
   like beads so the three specializations stay legible side by side. */

const CANVAS_W = 1200;
const CANVAS_H = 2860;

const pctX = x => (x / CANVAS_W) * 100;
const pctY = y => (y / CANVAS_H) * 100;

const isBranch = mod => mod.track === 'red' || mod.track === 'yellow' || mod.track === 'blue';

function statusLabel(status, prog) {
  if (status === 'done') return 'Complete';
  if (status === 'locked') return 'Locked';
  if (prog.done > 0) return `${prog.done}/${prog.total} lessons`;
  return status === 'current' ? 'Up next' : `${prog.total} lessons`;
}

function trackKicker(mod) {
  if (mod.track === 'core') {
    return `Module ${String(CORE_ORDER.indexOf(mod.id) + 1).padStart(2, '0')}`;
  }
  const branch = BRANCHES.find(b => b.id === mod.track);
  return branch ? branch.name : 'Anytime';
}

function cardMarkup(mod, status, prog) {
  return `
    <span class="kicker">${trackKicker(mod)}</span>
    <h3>${mod.title}</h3>
    <div class="meta">${statusLabel(status, prog)}</div>
    <div class="bar"><i style="width:${prog.pct}%"></i></div>`;
}

function buildNode(mod, state) {
  const prog = moduleProgress(mod, state);
  const status = moduleStatus(mod, state);
  const teamClass = isBranch(mod) ? mod.track : '';
  const side = mod.pos.side;
  const out = [];

  /* Core modules get a dot on the trunk; branch cards sit on the stem
     themselves, so a separate dot would just hide behind them. */
  if (side !== 'center') {
    const dot = document.createElement('div');
    dot.className = `node-dot ${status} ${teamClass}`.trim();
    dot.style.left = pctX(mod.pos.x) + '%';
    dot.style.top = pctY(mod.pos.y) + '%';
    out.push(dot);
  }

  const card = document.createElement(status === 'locked' ? 'div' : 'a');
  card.className = `node-card side-${side} ${status} ${teamClass}`.trim();
  if (status !== 'locked') card.href = `lesson.html?module=${mod.id}`;
  card.style.top = pctY(mod.pos.y) + '%';

  if (side === 'left') card.style.right = `calc(${100 - pctX(mod.pos.x)}% + 34px)`;
  else if (side === 'right') card.style.left = `calc(${pctX(mod.pos.x)}% + 34px)`;
  else card.style.left = pctX(mod.pos.x) + '%';

  card.innerHTML = cardMarkup(mod, status, prog);
  out.push(card);
  return out;
}

function buildListItem(mod, state) {
  const prog = moduleProgress(mod, state);
  const status = moduleStatus(mod, state);
  const teamClass = isBranch(mod) ? mod.track : '';
  const el = document.createElement(status === 'locked' ? 'div' : 'a');
  el.className = `node-card ${status} ${teamClass}`.trim();
  if (status !== 'locked') el.href = `lesson.html?module=${mod.id}`;
  el.innerHTML = cardMarkup(mod, status, prog);
  return el;
}

function render() {
  const state = Store.read();
  applyTheme(state.team);

  const nodes = document.getElementById('nodes');
  const list = document.getElementById('list');
  nodes.innerHTML = '';
  list.innerHTML = '';

  CURRICULUM.filter(m => m.pos).forEach(mod => {
    buildNode(mod, state).forEach(n => nodes.appendChild(n));
  });

  /* Stacked fallback for narrow screens, in the same bottom-up order. */
  const addDivider = text => {
    const d = document.createElement('div');
    d.className = 'divider';
    d.textContent = text;
    list.appendChild(d);
  };
  addDivider('Shared trunk');
  CORE_ORDER.forEach(id => list.appendChild(buildListItem(getModule(id), state)));
  BRANCHES.forEach(b => {
    addDivider(b.name);
    CURRICULUM.filter(m => m.track === b.id).forEach(m => list.appendChild(buildListItem(m, state)));
  });
  addDivider('Anytime');
  CURRICULUM.filter(m => m.track === 'free').forEach(m => list.appendChild(buildListItem(m, state)));

  /* The trunk lights up once the whole shared path is done; a branch lights
     up when it is the one being walked. */
  const unlocked = branchesUnlocked(state);
  document.getElementById('trunk').classList.toggle('grown', unlocked);
  BRANCHES.forEach(b => {
    document.getElementById('branch-' + b.id).classList.toggle('live', state.team === b.id);
  });

  /* progress ring */
  const p = overallProgress(state);
  const circumference = 264;
  document.getElementById('ring-fill').style.strokeDashoffset =
    circumference - (circumference * p.pct) / 100;
  document.getElementById('pct').textContent = p.pct + '%';
  document.getElementById('pct-sub').textContent = `${p.done} of ${p.total} lessons`;

  /* specialization switch */
  document.querySelectorAll('#team-switch button').forEach(btn => {
    btn.disabled = !unlocked;
    btn.classList.toggle('on', state.team === btn.dataset.team);
  });
  document.getElementById('team-note').textContent = unlocked
    ? 'Switch sides whenever you like — all three branches stay open.'
    : `Unlocks after you finish ${lastCoreModule().title}.`;

  document.getElementById('vine-sub').textContent = unlocked
    ? 'The fork is open. Pick a side — or walk all three.'
    : 'Start at the seed and grow upward. After the shared trunk, the vine splits three ways.';
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
