/* Cybersprouts — a pure, parameterised model of the placement test rules.
   ==================================================================
   This file contains NO DOM code, so it runs anywhere: in the browser
   alongside the harness, or headlessly (see run-headless.sh).

   It is a re-statement of the grading in assets/js/placement.js, with
   the three fixed constants turned into knobs:

       placement.js:132-137   canRecheck   -> maxMisses, maxAttempts
       placement.js:102       perfect      -> passMark

   A re-statement is only worth trusting if it agrees with the original,
   so placement-sim.js runs every scenario through BOTH this model and
   the real UI and reports any disagreement before showing any numbers.
   Nothing here is used for a conclusion until that check passes.

   Depends on: data.js (CURRICULUM, CORE_ORDER, PLACEMENT_QUESTIONS,
   RECHECK_QUESTIONS) and app.js (getModule).
   ================================================================== */

var PlacementRules = (function () {
'use strict';

const CORE = CORE_ORDER.slice();
const N = CORE.length;

/* Read from the real banks rather than assumed, so a curriculum change
   shows up as a preflight failure instead of a wrong number. */
const PER_MODULE  = CORE.map(id => PLACEMENT_QUESTIONS.filter(q => q.module === id).length);
const RECHECK_LEN = CORE.map(id => (RECHECK_QUESTIONS[id] || []).length);

const idx       = id => CORE.indexOf(id);
const titleOf   = id => getModule(id).title;
const lessonsIn = id => getModule(id).lessons.length;

const SHIPPED  = 'lenient2of3';
const PREVIOUS = 'strict3of3';

function preflight() {
  const problems = [];
  /* A renamed rule key used to surface as an undefined-property crash halfway
     through rendering. Fail here instead, with a sentence that says why. */
  if (!RULES[SHIPPED])  problems.push(`SHIPPED names "${SHIPPED}", which is not a rule in RULES`);
  if (!RULES[PREVIOUS]) problems.push(`PREVIOUS names "${PREVIOUS}", which is not a rule in RULES`);
  CORE.forEach((id, i) => {
    if (PER_MODULE[i] === 0)  problems.push(`${id} has no placement questions — the prefix loop breaks here`);
    if (RECHECK_LEN[i] === 0) problems.push(`${id} has no recheck bank — it can never be rechecked`);
  });
  if (new Set(PER_MODULE).size > 1) {
    problems.push(`core modules do not all have the same question count: ${PER_MODULE.join(',')}`);
  }
  if (PLACEMENT_QUESTIONS.length !== PER_MODULE.reduce((a, b) => a + b, 0)) {
    problems.push('the question bank contains questions for modules outside CORE_ORDER');
  }
  return problems;
}

/* ------------------------------------------------------------ rule sets */
/* `current` is exactly what ships today. The others are the one-knob
   changes worth pricing before deciding anything. */
const RULES = {
  strict3of3: {
    label: 'Strict — recheck must be 3/3',
    blurb: 'Recheck offered only at 2/3, and must then be answered perfectly. One attempt, ever.',
    passMark: 3, maxMisses: 1, maxAttempts: 1
  },
  lenient2of3: {
    label: 'Tolerant — recheck passes at 2/3',
    blurb: 'Same offer, but 2 of the 3 fresh questions is enough to clear the module.',
    passMark: 2, maxMisses: 1, maxAttempts: 1
  },
  secondChance: {
    label: 'Two recheck attempts',
    blurb: 'Still needs 3/3, but a failed recheck can be retried once on the same module.',
    passMark: 3, maxMisses: 1, maxAttempts: 2
  },
  widerGate: {
    label: 'Recheck offered at 1/3 too',
    blurb: 'Missing two questions also earns a recheck. Still must be answered 3/3.',
    passMark: 3, maxMisses: 2, maxAttempts: 1
  },
  both: {
    label: 'Offered at 1/3 AND passes at 2/3',
    blurb: 'The most forgiving variant: both knobs turned at once.',
    passMark: 2, maxMisses: 2, maxAttempts: 1
  }
};

/* Which rule set the app actually implements right now, and which one it
   implemented before. Both harnesses read SHIPPED rather than hard-coding a
   rule, so if placement.js changes again and nobody updates this line, the
   cross-check against the real UI fails loudly instead of quietly lying.

   SHIPPED tracks RECHECK_MISSES_ALLOWED in assets/js/placement.js. */
/* --------------------------------------------------------------- the model
   scores: array of N ints — how many of that module's questions were right.
   plan(moduleId, attemptIndex) -> the score on that recheck, or null to
   decline the offer.                                                       */
function modelRun(scores, rule, plan) {
  const eff = scores.slice();
  const attempts = {};
  const failed = [];
  const passed = [];
  const rechecks = [];

  for (;;) {
    /* Modules clear as a prefix — placement.js:122-127 breaks at the first
       module that is not a clean sweep, and so does this. */
    let clearedCount = 0;
    while (clearedCount < N && eff[clearedCount] === PER_MODULE[clearedCount]) clearedCount++;
    if (clearedCount === N) return done(clearedCount);

    const bi      = clearedCount;
    const blocker = CORE[bi];
    const misses  = PER_MODULE[bi] - eff[bi];
    const tried   = attempts[blocker] || 0;

    const canRecheck =
      misses >= 1 && misses <= rule.maxMisses &&
      failed.indexOf(blocker) === -1 &&
      tried < rule.maxAttempts &&
      RECHECK_LEN[bi] > 0;

    if (!canRecheck) return done(clearedCount);

    const score = plan(blocker, tried);
    if (score === null || score === undefined) return done(clearedCount);   // declined

    attempts[blocker] = tried + 1;
    rechecks.push({ module: blocker, attempt: tried + 1, score, of: RECHECK_LEN[bi] });

    if (score >= rule.passMark) {
      eff[bi] = PER_MODULE[bi];          // placement.js:120 — a pass is a clean sweep
      passed.push(blocker);
    } else if (attempts[blocker] >= rule.maxAttempts) {
      failed.push(blocker);
    }
  }

  function done(clearedCount) {
    const cleared = CORE.slice(0, clearedCount);
    const blocker = clearedCount < N ? CORE[clearedCount] : null;

    /* Modules answered perfectly that earn no credit, because they sit
       above the blocker. This is what a slip actually costs. */
    const acedButDiscarded = [];
    for (let i = clearedCount; i < N; i++) {
      if (scores[i] === PER_MODULE[i]) acedButDiscarded.push(CORE[i]);
    }

    return {
      cleared, blocker,
      correct: scores.reduce((a, b) => a + b, 0),
      rechecks, passedRechecks: passed, failedRechecks: failed,
      acedButDiscarded,
      lessonsDiscarded: acedButDiscarded.reduce((n, id) => n + lessonsIn(id), 0),
      /* "Stranded" = a recheck was offered on the blocker, taken, failed,
         and that is where the learner now has to start. */
      stuck: Boolean(blocker && failed.indexOf(blocker) !== -1)
    };
  }
}

/* ------------------------------------------------------- scenario plans */
const fixedPlan = score => () => score;
const perModulePlan = (targetId, score, otherScore) =>
  mod => (mod === targetId ? score : otherScore);

/* ------------------------------------------------------------ matrices
   Scenario definitions only — nothing is executed here, so the browser
   harness and the headless runner test exactly the same learners. */
function matrices() {
  const A = [], B = [], C = [];

  /* A — one careless answer on a different module each time, then every
     possible recheck outcome. Everything else answered perfectly: the
     "I clearly know the other things" case. */
  for (let t = 0; t < N; t++) {
    for (let s = 0; s <= 3; s++) {
      const scores = PER_MODULE.slice();
      scores[t] = PER_MODULE[t] - 1;
      A.push({ matrix: 'A', target: CORE[t], targetIndex: t, recheckScore: s, scores,
               plan: fixedPlan(s), label: `${CORE[t]} · 2/3 → recheck ${s}/3` });
    }
  }

  /* B — a slip on the target AND on the module above it, so a passed
     recheck has somewhere to chain to. Follow-on rechecks are aced. */
  for (let t = 0; t < N - 1; t++) {
    for (let s = 0; s <= 3; s++) {
      const scores = PER_MODULE.slice();
      scores[t] = PER_MODULE[t] - 1;
      scores[t + 1] = PER_MODULE[t + 1] - 1;
      B.push({ matrix: 'B', target: CORE[t], targetIndex: t, recheckScore: s, scores,
               plan: perModulePlan(CORE[t], s, 3), label: `${CORE[t]} · recheck ${s}/3 → chain` });
    }
  }

  /* C — 1/3 on the blocker: no recheck is offered at all. */
  for (let t = 0; t < N; t++) {
    const scores = PER_MODULE.slice();
    scores[t] = PER_MODULE[t] - 2;
    C.push({ matrix: 'C', target: CORE[t], targetIndex: t, recheckScore: null, scores,
             plan: fixedPlan(3), label: `${CORE[t]} · 1/3, no recheck offered` });
  }

  return { A, B, C };
}

/* ------------------------------------------------- the retry assumption
   Only one variant ("two recheck attempts") can ask a learner the same
   module twice, and how well they do the second time is a property of the
   LEARNER, not of the rule — so it cannot be left implicit.

   retryDelta = 0  the learner scores the same on the retry as the first
                   time. Pessimistic: a 2/3 stays a 2/3.
   retryDelta = 1  the learner does one question better, having just been
                   told they missed one. Optimistic but plausible.

   Every number produced below is reported under both. */
function withRetry(plan, retryDelta) {
  return function (moduleId, attempt) {
    const base = plan(moduleId, attempt);
    if (base === null || base === undefined || attempt === 0) return base;
    return Math.min(base + retryDelta * attempt, RECHECK_LEN[idx(moduleId)]);
  };
}

/* --------------------------------------------------- variant comparison */
function priceVariants(scenarios, retryDelta) {
  const out = {};
  Object.keys(RULES).forEach(k => {
    let stuck = 0, reachedFork = 0, lessonsLost = 0, modulesLost = 0, offered = 0;
    scenarios.forEach(sc => {
      const r = modelRun(sc.scores, RULES[k], withRetry(sc.plan, retryDelta || 0));
      if (r.stuck) stuck++;
      if (!r.blocker) reachedFork++;
      if (r.rechecks.length) offered++;
      lessonsLost += r.lessonsDiscarded;
      modulesLost += r.acedButDiscarded.length;
    });
    out[k] = { rule: RULES[k], stuck, reachedFork, offered, lessonsLost, modulesLost,
               n: scenarios.length, retryDelta: retryDelta || 0 };
  });
  return out;
}

/* ---------------------------------------------------- the recheck gauntlet
   A learner who slips once in several modules does not face one recheck,
   they face a RUN of them, and every single one has to be perfect. This
   enumerates every arrangement of k near-missed modules and reports how
   many consecutive clean rechecks stand between that learner and the fork.

   This is the shape of a realistic good-but-not-perfect result — 19/24 with
   five modules at 2/3, say — which none of the matrices above cover, because
   each of those changes only one module at a time. */
function gauntlet(rule) {
  const rows = [];
  const bank = RECHECK_LEN[0] || 3;

  for (let k = 1; k <= N; k++) {
    const needs = [];
    for (let mask = 0; mask < (1 << N); mask++) {
      let bits = 0;
      for (let i = 0; i < N; i++) if (mask & (1 << i)) bits++;
      if (bits !== k) continue;

      /* k modules at one-below-perfect, the rest aced. */
      const scores = PER_MODULE.map((v, i) => (mask & (1 << i)) ? v - 1 : v);

      /* Best possible case: every recheck offered is answered perfectly. */
      const best = modelRun(scores, rule, fixedPlan(3));

      /* Fragility: the same learner, but the FIRST recheck goes imperfectly.
         Everything after it would have been perfect and now never gets asked.
         Measured twice — one miss (a slip) and two (a genuine gap) — because
         a rule change should rescue the first without rescuing the second. */
      const imperfect = misses => {
        let first = null;
        return modelRun(scores, rule, mod => {
          if (first === null) { first = mod; return bank - misses; }
          return bank;
        });
      };
      const slipOnce = imperfect(1);
      const slipTwice = imperfect(2);

      needs.push({
        n: best.rechecks.length,
        reached: !best.blocker,
        lostToOneSlip: slipOnce.lessonsDiscarded,
        modulesLostToOneSlip: slipOnce.acedButDiscarded.length,
        lostToTwoSlips: slipTwice.lessonsDiscarded
      });
    }

    const ns = needs.map(x => x.n);
    rows.push({
      nearMissed: k,
      mainScore: PLACEMENT_QUESTIONS.length - k,
      of: PLACEMENT_QUESTIONS.length,
      arrangements: needs.length,
      minRechecks: Math.min.apply(null, ns),
      maxRechecks: Math.max.apply(null, ns),
      questionsAllCorrect: Math.max.apply(null, ns) * bank,
      allReachFork: needs.every(x => x.reached),
      avgLostToOneSlip: needs.reduce((a, x) => a + x.lostToOneSlip, 0) / needs.length,
      maxLostToOneSlip: Math.max.apply(null, needs.map(x => x.lostToOneSlip)),
      avgLostToTwoSlips: needs.reduce((a, x) => a + x.lostToTwoSlips, 0) / needs.length,
      maxLostToTwoSlips: Math.max.apply(null, needs.map(x => x.lostToTwoSlips))
    });
  }
  return rows;
}

/* ------------------------------------------------------ exhaustive sweep
   Every possible learner: all 4^8 score profiles, each crossed with every
   possible score on the FIRST recheck offered. Any chained recheck after
   that is answered perfectly, so these are the optimistic numbers. */
function sweep(rule, retryDelta) {
  const total = Math.pow(4, N);
  let offered = 0, stuck = 0, stuckAtNearMiss = 0;
  let lessonsWhenStuck = 0, modulesWhenStuck = 0, maxLessons = 0, worst = null;
  const scores = new Array(N).fill(0);

  for (let p = 0; p < total; p++) {
    let v = p;
    for (let i = 0; i < N; i++) { scores[i] = v & 3; v >>= 2; }

    for (let s = 0; s <= 3; s++) {
      /* The learner scores `s` on the module they were FIRST offered a
         recheck on — on every attempt at it, adjusted by retryDelta.
         Rechecks chained onto later modules are answered perfectly, so
         these numbers are the optimistic case.

         Keying this on the module rather than on call order matters: with
         call order, a second attempt at the SAME module fell through to
         the "aced" branch and the two-attempts variant looked flawless. */
      let target = null;
      const plan = mod => {
        if (target === null) target = mod;
        return mod === target ? s : RECHECK_LEN[idx(mod)];
      };
      const r = modelRun(scores, rule, withRetry(plan, retryDelta || 0));
      if (r.rechecks.length) offered++;
      if (r.stuck) {
        stuck++;
        const re = r.rechecks[0];
        if (re && re.score === re.of - 1) stuckAtNearMiss++;
        lessonsWhenStuck += r.lessonsDiscarded;
        modulesWhenStuck += r.acedButDiscarded.length;
        if (r.lessonsDiscarded > maxLessons) {
          maxLessons = r.lessonsDiscarded;
          worst = { scores: scores.slice(), blocker: r.blocker,
                    aced: r.acedButDiscarded.slice(), recheckScore: s };
        }
      }
    }
  }

  return {
    total, offered, stuck, stuckAtNearMiss, retryDelta: retryDelta || 0,
    avgLessonsLost: stuck ? lessonsWhenStuck / stuck : 0,
    avgModulesLost: stuck ? modulesWhenStuck / stuck : 0,
    maxLessonsLost: maxLessons, worst
  };
}

return {
  CORE, N, PER_MODULE, RECHECK_LEN,
  idx, titleOf, lessonsIn,
  preflight, RULES, SHIPPED, PREVIOUS, modelRun, matrices, priceVariants, sweep, gauntlet,
  fixedPlan, perModulePlan, withRetry
};
})();
