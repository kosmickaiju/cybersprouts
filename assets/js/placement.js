/* Cybersprouts — optional placement test.
   Covers the five core modules only; the fork is never skippable.

   Modules clear as a prefix: you skip a run of modules from the start, not an
   arbitrary set. A near miss on the module that blocks the prefix earns a
   recheck on fresh questions, so one careless answer does not cost a learner
   every module above it. */

const root = document.getElementById('quiz-root');
const LETTERS = ['A', 'B', 'C', 'D'];

const answers = new Array(PLACEMENT_QUESTIONS.length).fill(null);
let step = -1;                    // -1 intro · 0..n-1 questions · n results

/* recheck state */
let recheckModule = null;         // module currently being rechecked
let recheckAnswers = [];
let recheckStep = 0;
const rechecked = { passed: [], failed: [] };

const modulesInTest = CORE_ORDER.filter(id => PLACEMENT_QUESTIONS.some(q => q.module === id));
const QUESTIONS_PER_MODULE = PLACEMENT_QUESTIONS.filter(q => q.module === modulesInTest[0]).length;
const MINUTES = Math.round(PLACEMENT_QUESTIONS.length * 0.5);

/* ------------------------------------------------------------------- intro */
function intro() {
  root.innerHTML = `
    <div style="text-align:center">
      <span class="eyebrow">Optional · ~${MINUTES} minutes</span>
      <h1 style="font-size:36px;margin-bottom:14px">Skip what you already know</h1>
      <p style="color:var(--text-dim);font-size:16.5px;max-width:54ch;margin:0 auto 30px">
        ${PLACEMENT_QUESTIONS.length} questions — ${QUESTIONS_PER_MODULE} per core module. Any module you
        clear gets marked complete, so you land further up the vine, closer to choosing a specialization.
      </p>
      <p style="color:var(--text-faint);font-size:13px;margin-bottom:30px;font-family:var(--mono)">
        Near miss on one module? You'll get a recheck instead of losing your place.
      </p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" id="start">Begin the test</button>
        <a class="btn btn-ghost" href="roadmap.html">Start from the seed instead</a>
      </div>
    </div>`;
  document.getElementById('start').addEventListener('click', () => { step = 0; render(); });
}

/* --------------------------------------------------------------- questions */
function questionScreen(opts) {
  const { q, index, total, chosen, label, onPick, onPrev, onNext, nextText } = opts;
  root.innerHTML = `
    <div class="quiz-progress"><i style="width:${(index / total) * 100}%"></i></div>
    <div class="quiz">
      <div class="qcount">QUESTION ${index + 1} / ${total} · ${label}</div>
      <h2>${q.q}</h2>
      <div class="options">
        ${q.options.map((opt, i) => `
          <button class="option ${chosen === i ? 'chosen' : ''}" data-i="${i}">
            <span class="key">${LETTERS[i]}</span><span>${opt}</span>
          </button>`).join('')}
      </div>
      <div class="quiz-foot">
        <button class="btn btn-ghost" id="prev" ${index === 0 ? 'disabled' : ''}>← Back</button>
        <button class="btn btn-primary" id="next" ${chosen === null ? 'disabled' : ''}>${nextText} →</button>
      </div>
    </div>`;

  root.querySelectorAll('.option').forEach(btn => {
    btn.addEventListener('click', () => onPick(Number(btn.dataset.i)));
  });
  document.getElementById('prev').addEventListener('click', onPrev);
  document.getElementById('next').addEventListener('click', onNext);
}

function mainQuestion() {
  const q = PLACEMENT_QUESTIONS[step];
  questionScreen({
    q,
    index: step,
    total: PLACEMENT_QUESTIONS.length,
    chosen: answers[step],
    label: getModule(q.module).title,
    nextText: step === PLACEMENT_QUESTIONS.length - 1 ? 'See results' : 'Next',
    onPick: i => { answers[step] = i; render(); },
    onPrev: () => { step--; render(); },
    onNext: () => { step++; render(); }
  });
}

function recheckQuestion() {
  const bank = RECHECK_QUESTIONS[recheckModule];
  const q = bank[recheckStep];
  questionScreen({
    q,
    index: recheckStep,
    total: bank.length,
    chosen: recheckAnswers[recheckStep],
    label: `Recheck · ${getModule(recheckModule).title}`,
    nextText: recheckStep === bank.length - 1 ? 'See result' : 'Next',
    onPick: i => { recheckAnswers[recheckStep] = i; render(); },
    onPrev: () => { recheckStep--; render(); },
    onNext: () => {
      if (recheckStep < bank.length - 1) { recheckStep++; render(); return; }
      const perfect = bank.every((qq, i) => recheckAnswers[i] === qq.answer);
      (perfect ? rechecked.passed : rechecked.failed).push(recheckModule);
      recheckModule = null;
      render();
    }
  });
}

/* ----------------------------------------------------------------- grading */
function grade() {
  const byModule = {};
  PLACEMENT_QUESTIONS.forEach((q, i) => {
    if (!byModule[q.module]) byModule[q.module] = { right: 0, total: 0 };
    byModule[q.module].total++;
    if (answers[i] === q.answer) byModule[q.module].right++;
  });

  /* A passed recheck counts as a clean sweep of that module. */
  rechecked.passed.forEach(id => { byModule[id].right = byModule[id].total; });

  const cleared = [];
  for (const id of CORE_ORDER) {
    const r = byModule[id];
    if (r && r.right === r.total) cleared.push(id);
    else break;
  }

  /* The module standing between the learner and more skipping. */
  const blocker = CORE_ORDER.find(id => !cleared.includes(id)) || null;
  const br = blocker ? byModule[blocker] : null;
  const canRecheck = Boolean(
    blocker &&
    br.right === br.total - 1 &&                 // missed exactly one
    !rechecked.failed.includes(blocker) &&
    RECHECK_QUESTIONS[blocker]
  );

  const correct = PLACEMENT_QUESTIONS.filter((q, i) => answers[i] === q.answer).length;
  return { byModule, cleared, blocker, canRecheck, correct };
}

/* ----------------------------------------------------------------- results */
function rowStatus(id, g) {
  if (g.cleared.includes(id)) {
    return { cls: 'pass', text: rechecked.passed.includes(id) ? '✓ Cleared on recheck' : '✓ Marked complete' };
  }
  if (id === g.blocker && g.canRecheck) return { cls: 'recheck', text: '▸ Recheck available' };
  /* Aced, but stuck behind a blocker the learner can still clear. */
  const r = g.byModule[id];
  if (g.canRecheck && r && r.right === r.total) return { cls: 'pending', text: 'Pending recheck' };
  return { cls: 'fail', text: 'Keep in path' };
}

function headline(g) {
  if (g.cleared.length === CORE_ORDER.length) return 'You can go straight to the fork.';
  if (g.canRecheck) return `One answer away from skipping ${getModule(g.blocker).title}.`;
  if (g.cleared.length === 0) return "Let's start at the seed.";
  return `You can skip ahead to ${getModule(g.blocker).title}.`;
}

function subhead(g) {
  if (g.cleared.length === CORE_ORDER.length) {
    return 'Every core module is cleared. Pick red team or blue team and start specializing.';
  }
  if (g.canRecheck) {
    return `You missed one question in ${getModule(g.blocker).title}. Answer ${RECHECK_QUESTIONS[g.blocker].length} more
            on that module and, if they're clean, everything below the fork that you aced clears with it.`;
  }
  return 'Modules are skipped in order, so the first one you did not clear is where you start.';
}

function results() {
  const g = grade();
  const justFailed = rechecked.failed[rechecked.failed.length - 1];

  root.innerHTML = `
    <div class="result-head">
      <div class="score">${g.correct}/${PLACEMENT_QUESTIONS.length}</div>
      <h1 style="font-size:28px;margin-top:8px">${headline(g)}</h1>
      <p style="color:var(--text-dim);max-width:56ch;margin:0 auto">${subhead(g)}</p>
    </div>

    ${justFailed && !rechecked.passed.includes(justFailed) ? `
      <p style="text-align:center;color:var(--text-faint);font-size:13.5px;margin:-18px 0 26px">
        Recheck on ${getModule(justFailed).title} didn't come back clean — it stays in your path.
        You'll move quickly through it.
      </p>` : ''}

    <div class="result-list">
      ${CORE_ORDER.map(id => {
        const r = g.byModule[id] || { right: 0, total: 0 };
        const s = rowStatus(id, g);
        return `
          <div class="result-row ${s.cls}">
            <span class="name">${getModule(id).title}</span>
            <span style="color:var(--text-faint);font-family:var(--mono);font-size:12px">${r.right}/${r.total}</span>
            <span class="status">${s.text}</span>
          </div>`;
      }).join('')}
    </div>

    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
      ${g.canRecheck
        ? `<button class="btn btn-primary" id="recheck">
             Answer ${RECHECK_QUESTIONS[g.blocker].length} more ${getModule(g.blocker).title} questions →
           </button>
           <button class="btn btn-ghost" id="apply">Skip the recheck, apply as is</button>`
        : `<button class="btn btn-primary" id="apply">Apply and open my roadmap →</button>
           <button class="btn btn-ghost" id="retake">Retake</button>`}
    </div>`;

  const recheckBtn = document.getElementById('recheck');
  if (recheckBtn) {
    recheckBtn.addEventListener('click', () => {
      recheckModule = g.blocker;
      recheckAnswers = new Array(RECHECK_QUESTIONS[g.blocker].length).fill(null);
      recheckStep = 0;
      render();
    });
  }

  document.getElementById('apply').addEventListener('click', () => {
    Store.update(s => {
      g.cleared.forEach(id => {
        getModule(id).lessons.forEach(l => {
          const k = key(id, l.id);
          if (!s.completed.includes(k)) s.completed.push(k);
        });
      });
      s.placement = {
        correct: g.correct,
        of: PLACEMENT_QUESTIONS.length,
        cleared: g.cleared,
        rechecked: rechecked.passed,
        takenAt: new Date().toISOString()
      };
    });
    location.href = 'roadmap.html';
  });

  const retakeBtn = document.getElementById('retake');
  if (retakeBtn) {
    retakeBtn.addEventListener('click', () => {
      answers.fill(null);
      rechecked.passed.length = 0;
      rechecked.failed.length = 0;
      step = 0;
      render();
    });
  }
}

/* ------------------------------------------------------------------ router */
function render() {
  if (recheckModule) recheckQuestion();
  else if (step < 0) intro();
  else if (step < PLACEMENT_QUESTIONS.length) mainQuestion();
  else results();
  window.scrollTo({ top: 0 });
}

initChrome('placement');
render();
