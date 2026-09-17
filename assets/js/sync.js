/* Cybersprouts — progress sync.
   ============================================================================
   The model is offline-first. localStorage is always the working copy: every
   read is instant, every write lands locally first, and the app never blocks
   on the network. The `progress` table in Postgres is a mirror the browser
   pushes to and pulls from. Sign out, lose your connection, or never make an
   account at all, and the platform keeps working exactly as it did before.

   Reconciliation rules
   --------------------
   PULL  — union. Remote completions are folded into local ones. Lesson
           completion is monotonic (you don't un-learn the CIA triad), so a
           union can only ever be additive, and two devices used on different
           days both keep their work.

   PUSH  — verbatim. The local document overwrites the remote row. This is what
           makes "mark as complete → undo" actually stick; a union-on-push
           would make un-completing a lesson impossible.

   ADOPT — union, then push. Runs once, at sign-in. This is the step that
           rescues progress made before signing up: someone who works through
           three modules anonymously and then creates an account keeps all
           three, rather than staring at an empty roadmap and never coming back.

   Known edge: two devices editing simultaneously resolve last-write-wins on
   the full document, so an un-completion made on one device inside the same
   minute as work on another can be re-absorbed by the next pull. Correctly
   fixing that needs per-lesson tombstones, which is not worth the complexity
   for monotonic learning progress. It is noted in docs/architecture.html.
   ============================================================================ */

const Sync = {
  TABLE: 'progress',
  status: 'local',          // local · syncing · synced · offline · error
  lastError: null,
  _timer: null,
  _pushing: false,
  _pendingWhilePushing: false,

  active() {
    return Auth.available() && Auth.signedIn();
  },

  /* -------------------------------------------------------------- reading */
  async pull() {
    if (!Sync.active()) return;
    Sync._setStatus('syncing');
    try {
      const { data, error } = await Auth.client
        .from(Sync.TABLE)
        .select('completed, team, team_updated_at, placement, updated_at')
        .eq('user_id', Auth.user().id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        /* First sign-in on a brand-new account: nothing upstream yet, so this
           browser's state becomes the starting point. */
        await Sync.push();
        return;
      }

      const merged = mergeProgress(Store.read(), fromRow(data));
      Store.write(merged, { sync: false });
      Sync._setStatus('synced');
      Sync._announce();
    } catch (err) {
      Sync._fail(err);
    }
  },

  /* -------------------------------------------------------------- writing */
  async push() {
    if (!Sync.active()) return;

    /* Collapse overlapping pushes: if one is already in flight, note that
       another is wanted and let the current one re-run when it lands. */
    if (Sync._pushing) { Sync._pendingWhilePushing = true; return; }
    Sync._pushing = true;
    Sync._setStatus('syncing');

    try {
      const state = Store.read();
      const { error } = await Auth.client
        .from(Sync.TABLE)
        .upsert(toRow(state, Auth.user().id), { onConflict: 'user_id' });

      if (error) throw error;
      Sync._setStatus('synced');
    } catch (err) {
      Sync._fail(err);
    } finally {
      Sync._pushing = false;
      if (Sync._pendingWhilePushing) {
        Sync._pendingWhilePushing = false;
        Sync.push();
      }
    }
  },

  /* Local writes are frequent (every lesson tick). Batch them so a learner
     clicking through a module doesn't generate a request per click. */
  schedulePush() {
    if (!Sync.active()) return;
    clearTimeout(Sync._timer);
    Sync._timer = setTimeout(() => Sync.push(), 800);
  },

  /* ------------------------------------------------------- sign-in / -out */

  /* Fold anonymous work into the account being signed into. */
  async adopt() {
    if (!Sync.active()) return;
    await Sync.pull();   // pull already unions, then…
    await Sync.push();   // …make the union authoritative upstream.
  },

  /* Signing out clears the local cache. Not only for privacy on a shared
     machine — it is a correctness requirement. Leftover progress would be
     unioned into the *next* account signed in on this browser, quietly
     handing one learner another learner's completions. */
  stop() {
    clearTimeout(Sync._timer);
    Store.reset({ remote: false });
    Sync._setStatus('local');
    Sync._announce();
  },

  /* Wipe the account's progress upstream as well as locally. */
  async resetRemote() {
    if (!Sync.active()) return;
    try {
      const { error } = await Auth.client
        .from(Sync.TABLE)
        .delete()
        .eq('user_id', Auth.user().id);
      if (error) throw error;
    } catch (err) {
      Sync._fail(err);
    }
  },

  /* ------------------------------------------------------------- plumbing */
  _setStatus(status) {
    Sync.status = status;
    if (status !== 'error') Sync.lastError = null;
    document.dispatchEvent(new CustomEvent('cybersprouts:sync', { detail: { status } }));
  },

  /* Sync failures are never fatal — the local copy is still authoritative and
     the learner keeps working. Surface it quietly and move on. */
  _fail(err) {
    Sync.lastError = err;
    Sync._setStatus(navigator.onLine === false ? 'offline' : 'error');
    console.warn('[Cybersprouts] sync failed:', err && err.message ? err.message : err);
  },

  /* Tell whichever page is open that the state underneath it changed. */
  _announce() {
    document.dispatchEvent(new CustomEvent('cybersprouts:progress'));
  }
};

/* ------------------------------------------------------------ row mapping */
function toRow(state, userId) {
  return {
    user_id: userId,
    completed: state.completed || [],
    team: state.team,
    team_updated_at: state.teamUpdatedAt,
    placement: state.placement,
    updated_at: new Date().toISOString()
  };
}

function fromRow(row) {
  return {
    completed: row.completed || [],
    team: row.team || null,
    teamUpdatedAt: row.team_updated_at || null,
    placement: row.placement || null,
    updatedAt: row.updated_at || null
  };
}

/* ---------------------------------------------------------------- merging */
const newer = (a, b) => {
  if (!a) return false;
  if (!b) return true;
  return new Date(a) > new Date(b);
};

function mergeProgress(local, remote) {
  return {
    /* Additive: nobody loses a finished lesson to a sync. */
    completed: Array.from(new Set([...(local.completed || []), ...(remote.completed || [])])),

    /* A chosen specialization is a single value, so the most recent choice
       wins. Timestamps are only written when the team actually changes. */
    ...pickTeam(local, remote),

    /* Keep the more recent sitting of the placement test. */
    placement: pickPlacement(local.placement, remote.placement),

    updatedAt: newer(local.updatedAt, remote.updatedAt) ? local.updatedAt : remote.updatedAt
  };
}

function pickTeam(local, remote) {
  if (local.team === remote.team) {
    return { team: local.team, teamUpdatedAt: local.teamUpdatedAt || remote.teamUpdatedAt };
  }
  /* An explicit choice beats "never chosen", whichever side it came from. */
  if (!local.teamUpdatedAt && remote.teamUpdatedAt) {
    return { team: remote.team, teamUpdatedAt: remote.teamUpdatedAt };
  }
  if (local.teamUpdatedAt && !remote.teamUpdatedAt) {
    return { team: local.team, teamUpdatedAt: local.teamUpdatedAt };
  }
  return newer(local.teamUpdatedAt, remote.teamUpdatedAt)
    ? { team: local.team,  teamUpdatedAt: local.teamUpdatedAt }
    : { team: remote.team, teamUpdatedAt: remote.teamUpdatedAt };
}

function pickPlacement(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return newer(a.takenAt, b.takenAt) ? a : b;
}
