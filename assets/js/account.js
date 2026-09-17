/* Cybersprouts — account screens.
   Sign in, sign up, password reset, and the signed-in overview. Every form
   here is a thin shell around auth.js; no credential ever touches localStorage
   or this file's own state. */

const root = document.getElementById('account-root');

let view = 'signin';        // signin · signup · forgot · sent · recovery
let notice = null;          // { kind: 'error' | 'ok' | 'info', text }
let busy = false;
let sentTo = '';

/* --------------------------------------------------------------- fragments */
function noticeMarkup() {
  if (!notice) return '';
  return `<div class="form-notice ${notice.kind}">${notice.text}</div>`;
}

function field(id, label, type, extra = '') {
  return `
    <label class="field">
      <span>${label}</span>
      <input id="${id}" type="${type}" ${extra}>
    </label>`;
}

/* --------------------------------------------------------- not set up yet */
function unconfigured() {
  root.innerHTML = `
    <div class="auth-card wide">
      <span class="eyebrow">Accounts</span>
      <h1>Accounts aren't switched on yet</h1>
      <p class="auth-lede">
        The account layer is built and wired up, but it has no backend to talk to.
        Until one is connected, Cybersprouts saves progress in this browser only —
        everything else on the platform works exactly as before.
      </p>
      <ol class="setup-steps">
        <li>Create a free project at <span class="mono">supabase.com</span>.</li>
        <li>Run <span class="mono">docs/schema.sql</span> in the project's SQL editor —
            it creates the progress table and the policies that keep each learner's
            rows private.</li>
        <li>Paste the project URL and anon key into
            <span class="mono">assets/js/supabase-config.js</span>.</li>
      </ol>
      <p class="auth-foot">
        Full walkthrough in <span class="mono">docs/SETUP-ACCOUNTS.md</span>.
      </p>
    </div>`;
}

/* ------------------------------------------------------------- signed out */
function authForm() {
  const isSignup = view === 'signup';

  root.innerHTML = `
    <div class="auth-card">
      <span class="eyebrow">${isSignup ? 'New here' : 'Welcome back'}</span>
      <h1>${isSignup ? 'Create your account' : 'Sign in'}</h1>
      <p class="auth-lede">
        ${isSignup
          ? 'Your progress stops living in one browser and starts following you — laptop, library computer, phone on the train.'
          : 'Pick up exactly where you left off, on any device.'}
      </p>

      ${noticeMarkup()}

      <form id="auth-form" novalidate>
        ${field('email', 'Email', 'email', 'autocomplete="email" required')}
        ${field('password', 'Password', 'password',
          `autocomplete="${isSignup ? 'new-password' : 'current-password'}" required`)}
        ${isSignup ? `<p class="field-hint">At least 8 characters. Longer beats complicated —
          a passphrase you can actually remember is stronger than <span class="mono">P@ssw0rd!</span></p>` : ''}
        <button class="btn btn-primary full" id="submit" ${busy ? 'disabled' : ''}>
          ${busy ? 'Working…' : (isSignup ? 'Create account' : 'Sign in')}
        </button>
      </form>

      <div class="auth-alt">
        ${isSignup
          ? `<span>Already have an account?</span> <a href="#" data-view="signin">Sign in</a>`
          : `<span>No account yet?</span> <a href="#" data-view="signup">Create one</a>
             <span class="sep">·</span> <a href="#" data-view="forgot">Forgot password?</a>`}
      </div>

      ${isSignup ? '' : `
        <p class="auth-foot">
          Progress you've already made in this browser isn't lost — it gets folded
          into your account the moment you sign in.
        </p>`}
    </div>`;

  document.getElementById('auth-form').addEventListener('submit', e => {
    e.preventDefault();
    isSignup ? doSignUp() : doSignIn();
  });
}

function forgotForm() {
  root.innerHTML = `
    <div class="auth-card">
      <span class="eyebrow">Password reset</span>
      <h1>Reset your password</h1>
      <p class="auth-lede">
        Enter your email and we'll send a link that lets you set a new password.
      </p>

      ${noticeMarkup()}

      <form id="auth-form" novalidate>
        ${field('email', 'Email', 'email', 'autocomplete="email" required')}
        <button class="btn btn-primary full" id="submit" ${busy ? 'disabled' : ''}>
          ${busy ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <div class="auth-alt">
        <a href="#" data-view="signin">← Back to sign in</a>
      </div>
    </div>`;

  document.getElementById('auth-form').addEventListener('submit', e => {
    e.preventDefault();
    doReset();
  });
}

/* Deliberately identical whether or not the email exists — see the note on
   authMessage() in auth.js. Confirming which addresses have accounts would
   turn this form into a free user-enumeration tool. */
function sentScreen() {
  root.innerHTML = `
    <div class="auth-card">
      <span class="eyebrow">Check your inbox</span>
      <h1>Sent</h1>
      <p class="auth-lede">
        If <b class="mono">${sentTo}</b> has an account, there's a link on its way.
        Open it in this browser to continue.
      </p>
      <p class="auth-foot">
        Nothing after a few minutes? Check spam — and confirm you typed the address right.
      </p>
      <div class="auth-alt">
        <a href="#" data-view="signin">← Back to sign in</a>
      </div>
    </div>`;
}

/* Reached by clicking the emailed reset link; supabase-js turns the token in
   the URL into a temporary session and fires PASSWORD_RECOVERY. */
function recoveryForm() {
  root.innerHTML = `
    <div class="auth-card">
      <span class="eyebrow">Almost there</span>
      <h1>Choose a new password</h1>
      <p class="auth-lede">This replaces your old password everywhere you're signed in.</p>

      ${noticeMarkup()}

      <form id="auth-form" novalidate>
        ${field('password', 'New password', 'password', 'autocomplete="new-password" required')}
        <p class="field-hint">At least 8 characters.</p>
        <button class="btn btn-primary full" id="submit" ${busy ? 'disabled' : ''}>
          ${busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>`;

  document.getElementById('auth-form').addEventListener('submit', e => {
    e.preventDefault();
    doUpdatePassword();
  });
}

/* -------------------------------------------------------------- signed in */
const SYNC_COPY = {
  synced:  ['ok',    'Saved to your account'],
  syncing: ['busy',  'Saving…'],
  offline: ['warn',  'Offline — will save when you reconnect'],
  error:   ['warn',  'Could not reach your account just now'],
  local:   ['idle',  'Local only']
};

function signedIn() {
  const state = Store.read();
  const p = overallProgress(state);
  const [cls, label] = SYNC_COPY[Sync.status] || SYNC_COPY.local;
  const email = Auth.user().email || '';
  const branch = state.team ? BRANCHES.find(b => b.id === state.team) : null;

  root.innerHTML = `
    <div class="auth-card wide">
      <span class="eyebrow">Your account</span>
      <h1>${email.split('@')[0]}</h1>
      <p class="auth-lede mono">${email}</p>

      ${noticeMarkup()}

      <div class="acct-grid">
        <div class="acct-stat">
          <b>${p.done}<span>/${p.total}</span></b>
          <span>Lessons complete</span>
        </div>
        <div class="acct-stat">
          <b>${p.pct}<span>%</span></b>
          <span>Of your path</span>
        </div>
        <div class="acct-stat">
          <b class="small">${branch ? branch.name : 'Not chosen'}</b>
          <span>Specialization</span>
        </div>
        <div class="acct-stat">
          <b class="small">${state.placement ? `${state.placement.correct}/${state.placement.of}` : 'Not taken'}</b>
          <span>Placement test</span>
        </div>
      </div>

      <div class="sync-row ${cls}">
        <i class="sync-dot ${Sync.status}"></i>
        <span>${label}</span>
        <button class="btn btn-sm btn-ghost" id="sync-now" ${busy ? 'disabled' : ''}>Sync now</button>
      </div>

      <div class="acct-actions">
        <a class="btn btn-primary" href="roadmap.html">Back to my roadmap →</a>
        <button class="btn btn-ghost" id="signout">Sign out</button>
      </div>

      <p class="auth-foot">
        Signing out clears this browser's copy of your progress — your account keeps it,
        and it comes back when you sign in again. That's what makes shared computers safe to use.
      </p>
    </div>`;

  document.getElementById('signout').addEventListener('click', doSignOut);
  document.getElementById('sync-now').addEventListener('click', async () => {
    busy = true; render();
    await Sync.pull();
    await Sync.push();
    busy = false;
    notice = Sync.status === 'synced'
      ? { kind: 'ok', text: 'Up to date.' }
      : { kind: 'error', text: 'Sync did not complete. Your progress is still safe in this browser.' };
    render();
  });
}

/* ------------------------------------------------------------------ actions */
function readCredentials() {
  const emailEl = document.getElementById('email');
  const passEl = document.getElementById('password');
  return {
    email: emailEl ? emailEl.value.trim() : '',
    password: passEl ? passEl.value : ''
  };
}

async function doSignUp() {
  const { email, password } = readCredentials();
  if (!email) return fail('Enter your email address.');

  const problem = passwordProblem(password);
  if (problem) return fail(problem);

  busy = true; notice = null; render();
  try {
    const { needsConfirmation } = await Auth.signUp(email, password);
    if (needsConfirmation) {
      sentTo = email;
      busy = false;
      view = 'sent';
      render();
      return;
    }
    /* Confirmation disabled in the dashboard — straight in. */
    busy = false;
    location.href = 'roadmap.html';
  } catch (err) {
    busy = false;
    fail(authMessage(err));
  }
}

async function doSignIn() {
  const { email, password } = readCredentials();
  if (!email || !password) return fail('Enter your email and password.');

  busy = true; notice = null; render();
  try {
    await Auth.signIn(email, password);
    /* onAuthStateChange fires Sync.adopt(), which folds this browser's
       anonymous progress into the account before we leave the page. */
    busy = false;
    render();
  } catch (err) {
    busy = false;
    fail(authMessage(err));
  }
}

async function doReset() {
  const { email } = readCredentials();
  if (!email) return fail('Enter your email address.');

  busy = true; notice = null; render();
  try {
    await Auth.sendReset(email);
  } catch (err) {
    /* Rate limiting is worth surfacing; a non-existent address is not, and
       Supabase does not tell us which it was anyway. */
    if (/rate limit|60 seconds/i.test(err.message || '')) {
      busy = false;
      return fail(authMessage(err));
    }
  }
  sentTo = email;
  busy = false;
  view = 'sent';
  render();
}

async function doUpdatePassword() {
  const { password } = readCredentials();
  const problem = passwordProblem(password);
  if (problem) return fail(problem);

  busy = true; notice = null; render();
  try {
    await Auth.updatePassword(password);
    busy = false;
    notice = { kind: 'ok', text: 'Password updated.' };
    view = 'signin';
    render();
  } catch (err) {
    busy = false;
    fail(authMessage(err));
  }
}

async function doSignOut() {
  await Auth.signOut();          // Sync.stop() clears the local copy
  view = 'signin';
  notice = { kind: 'info', text: 'Signed out. Your progress is saved to your account.' };
  render();
}

function fail(text) {
  notice = { kind: 'error', text };
  render();
}

/* ------------------------------------------------------------------ router */
function render() {
  if (!Auth.available()) { unconfigured(); return; }
  if (!Auth.ready()) {
    root.innerHTML = `<div class="auth-card"><p class="auth-lede">Checking your session…</p></div>`;
    return;
  }

  if (Auth.signedIn() && view !== 'recovery') signedIn();
  else if (view === 'recovery') recoveryForm();
  else if (view === 'sent') sentScreen();
  else if (view === 'forgot') forgotForm();
  else authForm();

  /* One delegated handler covers every view-switching link. */
  root.querySelectorAll('[data-view]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      view = a.dataset.view;
      notice = null;
      render();
    });
  });
}

Auth.onChange(event => {
  if (event === 'recovery') view = 'recovery';
  render();
});
document.addEventListener('cybersprouts:sync', () => { if (Auth.signedIn()) render(); });

initChrome('account');
render();
