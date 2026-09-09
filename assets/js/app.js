/* Cybersprouts — shared state, theming, and small helpers.
   Progress lives in localStorage so the mockup feels continuous
   across pages without a backend. */

const STORAGE_KEY = 'cybersprouts.v1';

const Store = {
  read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign(Store.blank(), JSON.parse(raw));
    } catch (_) { /* private mode, corrupted value — fall through */ }
    return Store.blank();
  },

  blank() {
    return { completed: [], team: null, placement: null };
  },

  write(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    return state;
  },

  update(fn) {
    const state = Store.read();
    fn(state);
    return Store.write(state);
  },

  reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }
};

/* ------------------------------------------------------------------ lookups */
const key = (moduleId, lessonId) => `${moduleId}/${lessonId}`;
const getModule = id => CURRICULUM.find(m => m.id === id);

function moduleProgress(mod, state) {
  const done = mod.lessons.filter(l => state.completed.includes(key(mod.id, l.id))).length;
  return { done, total: mod.lessons.length, pct: Math.round((done / mod.lessons.length) * 100) };
}

/* A core module unlocks when every earlier core module is finished.
   Both branches unlock once networking is done. AI is always open. */
function moduleStatus(mod, state) {
  const p = moduleProgress(mod, state);
  if (p.done === p.total) return 'done';

  if (mod.track === 'ai') return p.done > 0 ? 'current' : 'open';

  if (mod.track === 'core') {
    const i = CORE_ORDER.indexOf(mod.id);
    const priorDone = CORE_ORDER.slice(0, i).every(id => {
      const pm = moduleProgress(getModule(id), state);
      return pm.done === pm.total;
    });
    return priorDone ? 'current' : 'locked';
  }

  // red / blue
  const net = moduleProgress(getModule('networking'), state);
  if (net.done < net.total) return 'locked';

  // Only the branch the learner has actually chosen gets the "up next" marker;
  // the other side stays open but quiet.
  if (state.team !== mod.track) return 'open';
  const siblings = CURRICULUM.filter(m => m.track === mod.track);
  const firstUnfinished = siblings.find(m => {
    const sp = moduleProgress(m, state);
    return sp.done < sp.total;
  });
  return firstUnfinished && firstUnfinished.id === mod.id ? 'current' : 'open';
}

function branchesUnlocked(state) {
  const net = moduleProgress(getModule('networking'), state);
  return net.done === net.total;
}

/* Overall percentage: the core spine, the AI module, and — once chosen —
   the learner's specialization. */
function overallProgress(state) {
  const scope = CURRICULUM.filter(m =>
    m.track === 'core' || m.track === 'ai' || m.track === state.team
  );
  const total = scope.reduce((n, m) => n + m.lessons.length, 0);
  const done = scope.reduce((n, m) => n + moduleProgress(m, state).done, 0);
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/* ------------------------------------------------------------------ theming */
function applyTheme(team) {
  document.documentElement.setAttribute('data-team', team || 'core');
  if (!team) document.documentElement.removeAttribute('data-team');
}

/* ------------------------------------------------------------------ chrome */
const SPROUT_SVG = `
  <svg class="sprout" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 21v-8"/>
    <path d="M12 14c0-3.3-2.5-5.4-6.2-5.4C5.8 12 8.3 14 12 14Z" fill="currentColor" fill-opacity=".22"/>
    <path d="M12 12.4c0-3 2.2-4.9 5.6-4.9 0 3-2.2 4.9-5.6 4.9Z" fill="currentColor" fill-opacity=".22"/>
  </svg>`;

function renderHeader(active) {
  const state = Store.read();
  const p = overallProgress(state);
  const el = document.getElementById('header');
  if (!el) return;
  el.className = 'site-header';
  el.innerHTML = `
    <div class="wrap">
      <a class="brand" href="index.html">${SPROUT_SVG}<span>Cyber<em>sprouts</em></span></a>
      <nav class="nav">
        <a href="roadmap.html" class="${active === 'roadmap' ? 'active' : ''}">Roadmap</a>
        <a href="placement.html" class="${active === 'placement' ? 'active' : ''}">Placement test</a>
        <a href="lesson.html?module=ai" class="ai-link">AI Security</a>
      </nav>
      <span class="pill"><i class="dot"></i>${p.done}/${p.total} lessons</span>
    </div>`;
}

function renderFooter() {
  const el = document.getElementById('footer');
  if (!el) return;
  el.className = 'site-footer';
  el.innerHTML = `
    <div class="wrap">
      <span>Cybersprouts — early mockup. Progress is stored locally in this browser.</span>
      <a href="#" id="reset-progress">Reset progress</a>
    </div>`;
  el.querySelector('#reset-progress').addEventListener('click', e => {
    e.preventDefault();
    Store.reset();
    location.reload();
  });
}

function initChrome(active) {
  applyTheme(Store.read().team);
  renderHeader(active);
  renderFooter();
}
