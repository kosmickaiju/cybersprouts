/* Cybersprouts — accounts.
   A thin wrapper over Supabase Auth so the rest of the app never has to know
   what a JWT is. Everything here is optional: if Supabase is not configured,
   Auth.available() is false and the platform runs local-only.

   Deliberately NOT in this file: password hashing, session tokens, reset-token
   generation, email sending. Supabase does all of it server-side. That is the
   point of choosing a managed auth provider — the parts of authentication that
   are easy to get quietly, catastrophically wrong are the parts we don't own. */

const Auth = {
  client: null,
  _user: null,
  _ready: false,
  _listeners: [],

  /* Is there a backend to talk to at all? */
  available() {
    return SUPABASE_READY && Boolean(Auth.client);
  },

  /* Has the initial session check finished? Until it has, we don't know
     whether the visitor is signed in, and the UI says so rather than
     flashing "Sign in" at someone who is already signed in. */
  ready() {
    return Auth._ready;
  },

  user() {
    return Auth._user;
  },

  signedIn() {
    return Boolean(Auth._user);
  },

  /* ---------------------------------------------------------------- startup */
  init() {
    if (!SUPABASE_READY) { Auth._finishInit(null); return; }

    /* The UMD build from the CDN puts createClient on window.supabase. */
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.warn('[Cybersprouts] supabase-js did not load — running local-only.');
      Auth._finishInit(null);
      return;
    }

    Auth.client = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
      auth: {
        persistSession: true,      // survive a page navigation / browser restart
        autoRefreshToken: true,    // keep long study sessions from expiring mid-lesson
        detectSessionInUrl: true   // needed for the emailed confirm + reset links
      }
    });

    /* One subscription handles sign-in, sign-out, token refresh, and the
       arrival of a password-recovery link.

       INITIAL_SESSION is deliberately ignored here: it fires on every page
       load for an already-signed-in visitor, and getSession() below is what
       handles that case. Treating it as a fresh sign-in would run the merge
       on every single navigation. */
    Auth.client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;

      const previous = Auth._user;
      Auth._user = session ? session.user : null;
      Auth._ready = true;

      if (event === 'PASSWORD_RECOVERY') {
        Auth._emit('recovery');
        return;
      }

      /* A fresh sign-in is the one moment progress has to be reconciled:
         whatever this browser did anonymously gets folded into the account
         rather than thrown away. Token refreshes and profile updates leave
         both sides unchanged and skip this entirely. */
      if (!previous && Auth._user) {
        Sync.adopt();
      } else if (previous && !Auth._user) {
        Sync.stop();
      }

      Auth._emit(Auth._user ? 'signed-in' : 'signed-out');
    });

    Auth.client.auth.getSession().then(({ data }) => {
      Auth._finishInit(data && data.session ? data.session.user : null);
      if (Auth._user) Sync.pull();
    }).catch(() => Auth._finishInit(null));
  },

  _finishInit(user) {
    Auth._user = user;
    Auth._ready = true;
    Auth._emit(user ? 'signed-in' : 'signed-out');
  },

  /* ------------------------------------------------------------ credentials */

  /* Where Supabase sends people back to after they click a link in an email.
     Derived from the current page so it works on localhost and in production
     without a second config value. Every URL used here must also be listed in
     the dashboard's redirect allow-list — Supabase refuses unknown ones, which
     is what stops an attacker redirecting your confirmation links elsewhere. */
  _redirectTo() {
    return location.origin + location.pathname.replace(/[^/]*$/, '') + 'account.html';
  },

  async signUp(email, password) {
    const { data, error } = await Auth.client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: Auth._redirectTo() }
    });
    if (error) throw error;
    /* With email confirmation on, there is a user but no session until the
       link is clicked. The caller needs to tell those two cases apart. */
    return { needsConfirmation: !data.session };
  },

  async signIn(email, password) {
    const { error } = await Auth.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  async signOut() {
    await Auth.client.auth.signOut();
  },

  async sendReset(email) {
    const { error } = await Auth.client.auth.resetPasswordForEmail(email, {
      redirectTo: Auth._redirectTo()
    });
    if (error) throw error;
  },

  async updatePassword(password) {
    const { error } = await Auth.client.auth.updateUser({ password });
    if (error) throw error;
  },

  /* ------------------------------------------------------------- listeners */
  onChange(fn) {
    Auth._listeners.push(fn);
    return fn;
  },

  _emit(event) {
    Auth._listeners.forEach(fn => {
      try { fn(event); } catch (err) { console.error(err); }
    });
  }
};

/* Supabase returns terse, sometimes cryptic messages. Translate the handful a
   learner will actually hit, and pass anything else through rather than
   swallowing it — a silent auth failure is worse than an ugly one.

   Note what these messages deliberately do NOT do: distinguish "no such
   account" from "wrong password". Supabase returns the same error for both,
   and that is correct — a login form that confirms which emails are
   registered hands an attacker a free list of your users. */
function authMessage(error) {
  const raw = (error && error.message) || 'Something went wrong.';
  const map = {
    'Invalid login credentials': 'That email and password combination does not match an account.',
    'Email not confirmed': 'Check your inbox and click the confirmation link before signing in.',
    'User already registered': 'There is already an account with that email. Try signing in instead.',
    'Password should be at least 6 characters': 'Passwords need to be at least 8 characters.',
    'Email rate limit exceeded': 'Too many emails requested. Wait a few minutes and try again.',
    'For security purposes, you can only request this after 60 seconds.':
      'Just a moment — you can request another email in a minute.'
  };
  return map[raw] || raw;
}

/* Client-side validation is a courtesy to the person typing, never a security
   control — Supabase enforces its own rules server-side regardless. */
function passwordProblem(password) {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (/^\d+$/.test(password)) return 'Digits alone are easy to guess — mix in something else.';
  const common = ['password', '12345678', 'qwerty123', 'letmein', 'cybersprouts'];
  if (common.includes(password.toLowerCase())) return 'That is one of the most guessed passwords there is.';
  return null;
}
