/* Cybersprouts — shared state, theming, and small helpers.
   localStorage is always the working copy: reads are instant and nothing here
   waits on a network. When the learner is signed in, sync.js mirrors this same
   document to Postgres so it follows them to another browser or device. With
   no account — or no connection — everything below behaves exactly as it did
   when this was local-only. */

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
    /* The two timestamps exist only for merging: they let sync.js decide which
       side of a conflict is newer without guessing. */
    return { completed: [], team: null, teamUpdatedAt: null, placement: null, updatedAt: null };
  },

  /* `sync: false` is for writes that came *from* the server — stamping and
     re-pushing those would bounce the same state back and forth forever. */
  write(state, { sync = true } = {}) {
    if (sync) state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    if (sync && typeof Sync !== 'undefined') Sync.schedulePush();
    return state;
  },

  update(fn) {
    const state = Store.read();
    const teamBefore = state.team;
    fn(state);
    /* Stamp the specialization whenever it actually changes, so a switch made
       on a phone can win over a stale choice sitting on a laptop. */
    if (state.team !== teamBefore) state.teamUpdatedAt = new Date().toISOString();
    return Store.write(state);
  },

  /* Clearing the local copy leaves the account's saved progress alone unless
     `remote` is set — "reset this browser" and "reset my account" are very
     different promises to make to someone. */
  reset({ remote = false } = {}) {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    if (remote && typeof Sync !== 'undefined' && Sync.active()) return Sync.resetRemote();
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

  if (mod.track === 'free') return p.done > 0 ? 'current' : 'open';

  if (mod.track === 'core') {
    const i = CORE_ORDER.indexOf(mod.id);
    const priorDone = CORE_ORDER.slice(0, i).every(id => {
      const pm = moduleProgress(getModule(id), state);
      return pm.done === pm.total;
    });
    return priorDone ? 'current' : 'locked';
  }

  // red / yellow / blue
  if (!branchesUnlocked(state)) return 'locked';

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

/* The fork opens once the entire shared trunk is finished. */
function branchesUnlocked(state) {
  return CORE_ORDER.every(id => {
    const p = moduleProgress(getModule(id), state);
    return p.done === p.total;
  });
}

const lastCoreModule = () => getModule(CORE_ORDER[CORE_ORDER.length - 1]);

/* Overall percentage: the core spine, the AI module, and — once chosen —
   the learner's specialization. */
function overallProgress(state) {
  const scope = CURRICULUM.filter(m =>
    m.track === 'core' || m.track === 'free' || m.track === state.team
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

/* The account chip, in its four states. It is rendered even when Supabase is
   unconfigured — clicking through then explains what is missing, which beats
   a nav item that silently does nothing. */
function accountChip(active) {
  if (!Auth.ready()) return `<span class="acct-chip loading" aria-hidden="true"></span>`;

  if (!Auth.signedIn()) {
    return `<a class="acct-chip signin ${active === 'account' ? 'active' : ''}" href="account.html">Sign in</a>`;
  }

  const email = Auth.user().email || '';
  return `
    <a class="acct-chip user ${active === 'account' ? 'active' : ''}" href="account.html"
       title="${email}">
      <i class="avatar">${(email[0] || '?').toUpperCase()}</i>
      <span>${email.split('@')[0]}</span>
      <i class="sync-dot ${Sync.status}" aria-hidden="true"></i>
    </a>`;
}

let activeNav = null;

function renderHeader(active) {
  if (active !== undefined) activeNav = active;
  const state = Store.read();
  const p = overallProgress(state);
  const el = document.getElementById('header');
  if (!el) return;
  el.className = 'site-header';
  el.innerHTML = `
    <div class="wrap">
      <a class="brand" href="index.html">${SPROUT_SVG}<span>Cyber<em>sprouts</em></span></a>
      <nav class="nav">
        <a href="roadmap.html" class="${activeNav === 'roadmap' ? 'active' : ''}">Roadmap</a>
        <a href="placement.html" class="${activeNav === 'placement' ? 'active' : ''}">Placement test</a>
        <a href="lesson.html?module=ai" class="ai-link">AI Security</a>
        <a href="lesson.html?module=cloud" class="ai-link">Cloud</a>
        <a href="lesson.html?module=career" class="ai-link">Breaking In</a>
      </nav>
      <span class="pill"><i class="dot"></i>${p.done}/${p.total} lessons</span>
      ${accountChip(activeNav)}
    </div>`;
}

/* Where the learner's progress actually lives, said plainly. Someone who
   thinks their work is safe on a server when it is only in this browser will
   find out the hard way. */
function storageNote() {
  if (!Auth.signedIn()) {
    return Auth.available()
      ? 'Progress is stored in this browser — <a href="account.html">make an account</a> to keep it anywhere.'
      : 'Progress is stored locally in this browser.';
  }
  const notes = {
    synced:  'Progress saved to your account.',
    syncing: 'Saving…',
    offline: 'Offline — saved in this browser, and to your account when you reconnect.',
    error:   'Could not reach your account. Progress is safe in this browser.',
    local:   'Progress is stored locally in this browser.'
  };
  return notes[Sync.status] || notes.local;
}

function renderFooter() {
  const el = document.getElementById('footer');
  if (!el) return;
  el.className = 'site-footer';
  el.innerHTML = `
    <div class="wrap">
      <span>Cybersprouts — early mockup. ${storageNote()}</span>
      <a href="#" id="reset-progress">Reset progress</a>
    </div>`;

  el.querySelector('#reset-progress').addEventListener('click', e => {
    e.preventDefault();
    const signedIn = Auth.signedIn();
    const warning = signedIn
      ? 'Erase all of your progress? This clears it on your account too, on every device. This cannot be undone.'
      : 'Erase all progress stored in this browser? This cannot be undone.';
    if (!confirm(warning)) return;
    Promise.resolve(Store.reset({ remote: signedIn })).then(() => location.reload());
  });
}

function initChrome(active) {
  applyTheme(Store.read().team);
  renderHeader(active);
  renderFooter();

  /* Auth resolves asynchronously, and sync lands whenever the network does.
     Both just re-render the chrome in place rather than blocking first paint. */
  Auth.onChange(() => { renderHeader(); renderFooter(); });
  document.addEventListener('cybersprouts:sync', () => { renderHeader(); renderFooter(); });

  /* A pull can change progress underneath whatever page is open. Pages that
     draw progress re-render themselves on this event. */
  document.addEventListener('cybersprouts:progress', () => {
    applyTheme(Store.read().team);
    renderHeader();
  });

  Auth.init();
}
