/* Cybersprouts — the driver half of the placement test harness.
   ==================================================================
   Simulates a learner by clicking the real buttons in the real quiz:
   it picks options, presses Next, reads the actual results screen,
   takes rechecks, and reads the final screen. It re-implements no
   grading rule of its own, so it cannot drift from what ships.

   Between runs it presses the app's own "Retake" button, which is a
   genuine full reset (placement.js:244-250). It never presses "Apply",
   so it cannot touch real progress.

   Turning a score into answers:
     - a module scored k/3 has its FIRST k questions answered correctly
     - a wrong answer is always `(correct + 1) % options.length`
   Both are arbitrary but deterministic. Grading only ever counts how
   many are right, never which, so neither choice affects a result.

   Shared by placement-sim.html (the full report) and
   placement-compare.html (the before/after comparison).

   Depends on: data.js, app.js, placement.js, placement-rules.js.
   ================================================================== */

var PlacementDriver = (function () {
'use strict';

const R = PlacementRules;
const { CORE, PER_MODULE, idx, titleOf } = R;

const TITLE_TO_ID = {};
CURRICULUM.forEach(m => { TITLE_TO_ID[m.title] = m.id; });

/* --------------------------------------------------------- roadmap effect */
/* What the learner actually lands on after "Apply". placement.js:225-230
   marks every lesson of every cleared module complete; from there this uses
   the app's own moduleStatus()/branchesUnlocked() rather than guessing. */
function placementFor(clearedIds) {
  const state = Object.assign(Store.blank(), { completed: [] });
  clearedIds.forEach(id => {
    getModule(id).lessons.forEach(l => state.completed.push(key(id, l.id)));
  });
  const landsOn = CORE.find(id => moduleStatus(getModule(id), state) === 'current') || null;
  return {
    landsOn,
    landsOnTitle: landsOn ? titleOf(landsOn) : 'the fork — pick a specialization',
    forkOpen: branchesUnlocked(state),
    lessonsSkipped: state.completed.length
  };
}

/* ------------------------------------------------------------- the driver */
/* Everything below talks to the real UI only. */

const stage = document.getElementById('quiz-root');
const $     = sel => stage.querySelector(sel);
const byId  = id => document.getElementById(id);

const screenKind = () => {
  if (byId('start'))       return 'intro';
  if ($('.qcount'))        return 'question';
  if ($('.result-head'))   return 'results';
  return 'unknown';
};

function readQCount() {
  const raw   = $('.qcount').textContent.trim();
  const m     = raw.match(/QUESTION\s+(\d+)\s*\/\s*(\d+)/i);
  const parts = raw.split('·').map(s => s.trim());
  const isRecheck = parts.length > 1 && /^Recheck/i.test(parts[1]);
  const label = isRecheck ? parts.slice(1).join(' · ').replace(/^Recheck\s*·\s*/i, '')
                          : parts[1];
  return { n: Number(m[1]), total: Number(m[2]), isRecheck, label };
}

function answerCurrentQuestion(correct, question) {
  const want = correct ? question.answer
                       : (question.answer + 1) % question.options.length;
  const opt = stage.querySelector('.option[data-i="' + want + '"]');
  if (!opt) throw new Error('no option button with index ' + want);
  opt.click();            // re-renders the question with the choice recorded
  byId('next').click();   // advances
}

/* Put the app back at question 1 with all state cleared. */
function resetToStart() {
  const kind = screenKind();
  if (kind === 'intro') { byId('start').click(); return; }
  if (kind === 'results' && byId('retake')) { byId('retake').click(); return; }
  throw new Error('cannot reset: screen is "' + kind + '" with no retake button');
}

function readResultsScreen() {
  const rows = Array.prototype.map.call(stage.querySelectorAll('.result-row'), row => {
    const spans = row.querySelectorAll('span');
    const title = spans[0].textContent.trim();
    return {
      title, id: TITLE_TO_ID[title],
      score:  spans[1].textContent.trim(),
      status: spans[2].textContent.trim(),
      cls:    row.className.replace('result-row', '').trim()
    };
  });
  const offered = Boolean(byId('recheck'));
  return {
    score:    $('.score').textContent.trim(),
    headline: stage.querySelector('.result-head h1').textContent.trim(),
    subhead:  stage.querySelector('.result-head p').textContent.trim().replace(/\s+/g, ' '),
    rows,
    cleared:  rows.filter(r => r.cls === 'pass').map(r => r.id),
    recheckOffered: offered,
    recheckFor: offered ? (rows.find(r => r.cls === 'recheck') || {}).id : null
  };
}

function domRun(scores, plan) {
  resetToStart();

  /* --- the main run, in bank order --- */
  for (let i = 0; i < PLACEMENT_QUESTIONS.length; i++) {
    const q    = PLACEMENT_QUESTIONS[i];
    const info = readQCount();
    if (info.n !== i + 1)  throw new Error('expected question ' + (i + 1) + ', UI showed ' + info.n);
    if (info.isRecheck)    throw new Error('unexpected recheck screen during the main run');

    /* how many of this module's questions have already been asked */
    const seen = PLACEMENT_QUESTIONS.slice(0, i).filter(x => x.module === q.module).length;
    answerCurrentQuestion(seen < scores[idx(q.module)], q);
  }
  if (screenKind() !== 'results') throw new Error('expected the results screen after the last question');

  const firstScreen   = readResultsScreen();
  const rechecksTaken = [];
  const attempts      = {};
  let screen = firstScreen;
  let guard  = 0;

  /* --- rechecks, chains included --- */
  while (screen.recheckOffered) {
    if (++guard > 20) throw new Error('recheck loop did not terminate');
    const mod   = screen.recheckFor;
    const tried = attempts[mod] || 0;
    const score = plan(mod, tried);
    if (score === null || score === undefined) break;     // learner declined the offer
    attempts[mod] = tried + 1;

    byId('recheck').click();
    const bank = RECHECK_QUESTIONS[mod];
    for (let j = 0; j < bank.length; j++) {
      const info = readQCount();
      if (!info.isRecheck) throw new Error('expected a recheck screen, got a main question');
      if (TITLE_TO_ID[info.label] !== mod) {
        throw new Error('recheck is for ' + info.label + ', expected ' + titleOf(mod));
      }
      answerCurrentQuestion(j < score, bank[j]);
    }
    rechecksTaken.push({ module: mod, attempt: tried + 1, score, of: bank.length });
    screen = readResultsScreen();
  }

  return {
    firstScreen, finalScreen: screen, rechecksTaken,
    declined: screen.recheckOffered,
    cleared: screen.cleared,
    correctShown: Number(screen.score.split('/')[0])
  };
}

/* ------------------------------------------------- run one scenario twice */
/* Runs one scenario twice — once by clicking the real UI, once through the
   rule model — and reports whether they agreed. `ruleKey` names the rule the
   app is believed to implement; if that belief is wrong, `agree` goes false
   and the report says so instead of publishing numbers built on a bad model. */
function runScenario(sc, ruleKey) {
  const rule  = R.RULES[ruleKey || R.SHIPPED];
  const model = R.modelRun(sc.scores, rule, sc.plan);
  const dom   = domRun(sc.scores, sc.plan);

  const agree =
    model.cleared.join(',') === dom.cleared.join(',') &&
    model.correct === dom.correctShown &&
    model.rechecks.length === dom.rechecksTaken.length &&
    model.rechecks.every((r, i) => dom.rechecksTaken[i] &&
                                   dom.rechecksTaken[i].module === r.module &&
                                   dom.rechecksTaken[i].score === r.score);

  return Object.assign({}, sc, {
    model, dom, agree,
    place: placementFor(dom.cleared)        // derived from the REAL cleared set
  });
}
return { placementFor, domRun, runScenario, screenKind, readResultsScreen };
})();
