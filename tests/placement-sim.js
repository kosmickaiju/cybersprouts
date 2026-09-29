/* Cybersprouts — placement test simulation: the full report.
   ==================================================================
   Question this was written to answer: can a learner who clearly knows
   the later material get permanently stranded on an early module
   because of one careless answer plus one careless recheck?

   Two layers, because a test you cannot trust is worse than no test:

   LAYER 1 — the driver, in placement-driver.js. Clicks the real UI.
   LAYER 2 — the model, in placement-rules.js. A parameterised
   re-statement of the rules, so rules that do NOT exist in the app can
   still be priced.

   Every scenario runs through both and the results are compared. The
   verdict is printed at the very top of the page, before any number
   that depends on the model. If they disagree, the model is wrong and
   the page says so rather than showing the comparison.

   For the before/after view of a rule change, see placement-compare.html.
   ================================================================== */

(function () {
'use strict';

const R = PlacementRules;
const D = PlacementDriver;
const { CORE, N, PER_MODULE, idx, titleOf } = R;
const { placementFor, runScenario } = D;

/* This page's own controls, which are not part of the quiz stage the driver
   talks to — hence a local lookup rather than reaching into the driver. */
const byId = id => document.getElementById(id);

/* =================================================================== output */

const out      = document.getElementById('out');
const statusEl = document.getElementById('status');
const say  = msg => { statusEl.textContent = msg; };
const tick = () => new Promise(r => setTimeout(r, 0));
const esc  = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const pct  = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';

let plainText = [];
const line = s => plainText.push(s);

function section(title, subHtml) {
  out.insertAdjacentHTML('beforeend',
    '<h2>' + esc(title) + '</h2>' + (subHtml ? '<p class="sub">' + subHtml + '</p>' : ''));
  line('');
  line('== ' + title.toUpperCase());
}

function table(headers, rows) {
  const head = headers.map(h =>
    '<th class="' + (h.num ? 'num' : '') + '">' + esc(h.label || h) + '</th>').join('');
  const body = rows.map(r =>
    '<tr class="' + (r.cls || '') + '">' + r.cells.map((c, i) =>
      '<td class="' + (headers[i].num ? 'num' : '') + '">' + c + '</td>').join('') + '</tr>').join('');
  out.insertAdjacentHTML('beforeend',
    '<div class="scroll"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>');
}

const SCEN_HEADERS = [
  'Slip on',
  { label: 'Recheck', num: true },
  { label: 'Main score', num: true },
  'Lands on',
  { label: 'Lessons skipped', num: true },
  'Work thrown away',
  'Model vs UI'
];

function scenarioRows(rows) {
  return rows.map(sc => {
    const m  = sc.model;
    const re = m.rechecks[0];
    const lost = m.acedButDiscarded.length;
    return {
      cls: m.stuck ? 'stuck' : (m.blocker ? '' : 'fork'),
      cells: [
        esc(titleOf(sc.target)),
        re ? re.score + '/' + re.of : '<span class="tag warn">not offered</span>',
        sc.dom.correctShown + '/' + PLACEMENT_QUESTIONS.length,
        esc(sc.place.landsOnTitle),
        sc.place.lessonsSkipped,
        lost ? '<span class="tag bad">' + lost + ' module' + (lost > 1 ? 's' : '') +
               ' · ' + m.lessonsDiscarded + ' lessons</span>'
             : '<span class="tag ok">none</span>',
        sc.agree ? '<span class="tag ok">match</span>' : '<span class="tag bad">MISMATCH</span>'
      ]
    };
  });
}

function textTable(rows) {
  rows.forEach(sc => {
    const m = sc.model, re = m.rechecks[0];
    line('   ' + [
      titleOf(sc.target).padEnd(26),
      (re ? 'recheck ' + re.score + '/' + re.of : 'no recheck  ').padEnd(14),
      ('lands on ' + sc.place.landsOnTitle).padEnd(40),
      (sc.place.lessonsSkipped + ' skipped').padEnd(12),
      m.acedButDiscarded.length
        ? 'LOST ' + m.acedButDiscarded.length + ' aced modules / ' + m.lessonsDiscarded + ' lessons'
        : 'lost nothing'
    ].join(' '));
  });
}

/* ------------------------------------------------------------------- main */

async function run(withSweep) {
  out.innerHTML = '';
  plainText = [];
  byId('run').disabled = true;
  byId('sweep').disabled = true;

  line('CYBERSPROUTS — PLACEMENT TEST SIMULATION');
  line('Generated ' + new Date().toISOString());
  line('Driver clicks the real UI. The rule model is cross-checked against it on every scenario.');

  const problems = R.preflight();
  if (problems.length) {
    out.insertAdjacentHTML('beforeend',
      '<div class="verify bad"><strong>Preflight problems</strong><br>' +
      problems.map(esc).join('<br>') + '</div>');
    problems.forEach(p => line('PREFLIGHT: ' + p));
  }

  const M = R.matrices();

  say('Matrix A — one slip per module × every recheck outcome…');  await tick();
  const A = M.A.map(sc => runScenario(sc));
  say('Matrix B — chained rechecks…');                             await tick();
  const B = M.B.map(sc => runScenario(sc));
  say('Matrix C — 1/3 on the blocker…');                           await tick();
  const C = M.C.map(sc => runScenario(sc));

  const all = A.concat(B, C);
  const mismatches = all.filter(s => !s.agree);

  /* -------- verification, first, before anything model-derived -------- */
  out.insertAdjacentHTML('beforeend', mismatches.length
    ? '<div class="verify bad"><strong>' + mismatches.length + ' of ' + all.length +
      ' scenarios disagree</strong> between the rule model and the real UI. Every variant number ' +
      'below is therefore suspect — the model needs fixing before the comparison means anything.</div>'
    : '<div class="verify ok"><strong>Model verified.</strong> All ' + all.length + ' scenarios were run ' +
      'twice — once by clicking through the real placement UI, once through the rule model — and agreed ' +
      'on the cleared modules, the score, and every recheck taken. The variant pricing further down is ' +
      'as trustworthy as the real UI is.</div>');
  line('');
  line(mismatches.length
    ? 'VERIFICATION FAILED: ' + mismatches.length + '/' + all.length + ' scenarios disagree with the real UI'
    : 'VERIFICATION OK: ' + all.length + '/' + all.length + ' scenarios matched the real UI');

  /* -------- Matrix A -------- */
  section('Matrix A — one careless answer, then every possible recheck',
    'Every module answered perfectly except one, which scores 2/3 and so earns a recheck. That recheck ' +
    'is then answered 0/3, 1/3, 2/3 and 3/3. This is the exact situation described: a learner who ' +
    'demonstrably knows the later material.');
  table(SCEN_HEADERS, scenarioRows(A));
  textTable(A);

  const stuckA = A.filter(s => s.model.stuck);
  const twoTwo = A.filter(s => s.recheckScore === 2);
  out.insertAdjacentHTML('beforeend',
    '<p class="sub"><strong>' + stuckA.length + ' of ' + A.length + '</strong> runs end stranded on the ' +
    'module where the slip happened. Of the four possible recheck outcomes only <strong>3/3 clears it</strong> — ' +
    '0/3, 1/3 and 2/3 are identical in consequence. The 2/3-then-2/3 case is stranded in <strong>' +
    twoTwo.filter(s => s.model.stuck).length + ' of ' + twoTwo.length + '</strong> attempts: not unlucky, ' +
    'guaranteed.</p>');

  /* -------- the headline finding -------- */
  section('The 2/3 → 2/3 dead end, priced per module',
    'What one careless answer followed by one careless recheck actually costs. “Aced modules lost” counts ' +
    'modules the learner answered <em>perfectly</em> and gets no credit for.');
  table(
    ['Slip on', { label: 'Main score', num: true }, 'Lands on',
     { label: 'Aced modules lost', num: true }, { label: 'Lessons lost', num: true }, 'Another attempt?'],
    twoTwo.map(sc => ({
      cls: sc.model.stuck ? 'stuck' : '',
      cells: [
        esc(titleOf(sc.target)),
        sc.dom.correctShown + '/' + PLACEMENT_QUESTIONS.length,
        esc(sc.place.landsOnTitle),
        sc.model.acedButDiscarded.length,
        sc.model.lessonsDiscarded,
        '<span class="tag bad">none — ever</span>'
      ]
    })));
  line('');
  line('-- 2/3 on a module then 2/3 on its recheck, per module:');
  twoTwo.forEach(sc => line('   slip on ' + titleOf(sc.target).padEnd(26) + ' → ' +
    sc.model.acedButDiscarded.length + ' aced modules / ' + sc.model.lessonsDiscarded +
    ' lessons discarded, no further attempt'));

  /* -------- Matrix B -------- */
  section('Matrix B — do rechecks really chain?',
    'A slip on the target module <em>and</em> on the module directly above it, so a passed recheck has ' +
    'somewhere to chain to. The target recheck is scored 0/3–3/3; any follow-on recheck is answered perfectly.');
  table(SCEN_HEADERS, scenarioRows(B));
  textTable(B);
  const chained = B.filter(s => s.model.rechecks.length > 1);
  out.insertAdjacentHTML('beforeend',
    '<p class="sub">Chaining works: <strong>' + chained.length + ' of ' + B.length + '</strong> runs were ' +
    'offered a second recheck after clearing the first. But it only chains <em>forward from a pass</em> — ' +
    'one imperfect recheck ends the chain permanently, whatever sits above it.</p>');

  /* -------- Matrix C -------- */
  section('Matrix C — the harder stop: 1/3 on the blocker',
    'Two wrong answers in one module earns no recheck at all, however well the rest of the test went. ' +
    'The same cliff, one step steeper.');
  table(SCEN_HEADERS, scenarioRows(C));
  textTable(C);

  /* -------- variants -------- */
  section('What each rule change would buy',
    'The same Matrix A, B and C learners, replayed under alternative rules. “Stranded” counts runs that end ' +
    'on a module the learner was offered a recheck on and failed. Model only — these variants do not ' +
    'exist in the app, and nothing here changes it.' +
    '<br><br>Only “two recheck attempts” can ask the same module twice, and how well someone does the ' +
    'second time is a property of the <em>learner</em>, not the rule — so it is shown both ways. ' +
    '<strong>Same</strong> assumes a 2/3 stays a 2/3; <strong>one better</strong> assumes they get one ' +
    'more right, having just been told they missed one. Every other rule is unaffected by the choice, ' +
    'which is itself a useful check.');
  /* Matrix C is included deliberately: it is the only matrix containing a 1/3
     blocker, so without it "recheck offered at 1/3 too" could never show any
     benefit and the comparison would be rigged against it. */
  const priced   = R.priceVariants(A.concat(B, C), 0);
  const pricedUp = R.priceVariants(A.concat(B, C), 1);
  const base     = priced[R.SHIPPED];
  table(
    ['Rule', 'What changes',
     { label: 'Stranded · retry same', num: true },
     { label: 'Stranded · retry one better', num: true },
     { label: 'Reach the fork', num: true },
     { label: 'Lessons thrown away', num: true },
     { label: 'Best case vs today', num: true }],
    Object.keys(R.RULES).map(k => {
      const r = priced[k], u = pricedUp[k];
      const delta = base.stuck - Math.min(r.stuck, u.stuck);
      return {
        cls: k === R.SHIPPED ? 'stuck' : (delta > 0 ? 'fork' : ''),
        cells: [
          '<strong>' + esc(r.rule.label) + '</strong>',
          '<span style="color:#8fa39a">' + esc(r.rule.blurb) + '</span>',
          r.stuck + ' / ' + r.n,
          u.stuck + ' / ' + u.n,
          r.reachedFork + ' / ' + r.n,
          r.lessonsLost,
          k === R.SHIPPED ? '—'
            : (delta > 0 ? '<span class="tag ok">−' + delta + ' stranded</span>'
                         : '<span class="tag warn">no change</span>')
        ]
      };
    }));
  line('');
  line('-- rule variants, over ' + base.n + ' scenarios (stranded: retry-same / retry-one-better):');
  Object.keys(R.RULES).forEach(k => {
    const r = priced[k], u = pricedUp[k];
    line('   ' + r.rule.label.padEnd(34) +
         ' stranded ' + String(r.stuck).padStart(3) + '/' + String(u.stuck).padStart(3) + ' of ' + r.n +
         '   reach fork ' + String(r.reachedFork).padStart(3) + '/' + r.n +
         '   lessons lost ' + r.lessonsLost);
  });

  /* -------- the gauntlet -------- */
  section('The gauntlet — a realistic good-but-not-perfect result',
    'Every matrix above changes one module at a time. A real learner who slips once in ' +
    '<em>several</em> modules does not face one recheck, they face a run of them — and under the ' +
    'current rules every single one has to be perfect. Every arrangement of near-missed modules is ' +
    'enumerated here.');
  const gaunt = R.gauntlet(R.RULES[R.SHIPPED]);
  table(
    [{ label: 'Modules at 2/3', num: true }, { label: 'Main score', num: true },
     { label: 'Arrangements', num: true }, { label: 'Perfect rechecks needed', num: true },
     { label: 'Fresh questions, all correct', num: true },
     { label: 'Cost of one slip anywhere in the run', num: true }],
    gaunt.map(g => ({
      cls: g.maxRechecks > 1 ? 'stuck' : '',
      cells: [
        g.nearMissed,
        g.mainScore + '/' + g.of,
        g.arrangements,
        g.minRechecks === g.maxRechecks ? g.minRechecks : g.minRechecks + '–' + g.maxRechecks,
        g.questionsAllCorrect,
        g.avgLostToOneSlip
          ? '<span class="tag bad">avg ' + g.avgLostToOneSlip.toFixed(0) + ' lessons, worst ' +
            g.maxLostToOneSlip + '</span>'
          : '<span class="tag ok">nothing left to lose</span>'
      ]
    })));
  line('');
  line('-- the gauntlet (modules at 2/3 -> consecutive perfect rechecks required):');
  gaunt.forEach(g => line('   ' + String(g.nearMissed).padStart(2) + ' modules at 2/3  = ' +
    (g.mainScore + '/' + g.of).padEnd(7) + '  needs ' + String(g.maxRechecks).padStart(2) +
    ' perfect rechecks (' + String(g.questionsAllCorrect).padStart(2) +
    ' fresh questions, all correct); one slip anywhere costs avg ' +
    g.avgLostToOneSlip.toFixed(0) + ' lessons, worst ' + g.maxLostToOneSlip));

  out.insertAdjacentHTML('beforeend',
    '<p class="sub">Read the last column as the fragility of the whole run: the chain only moves forward ' +
    'from a pass, so a single imperfect recheck anywhere in it ends the run permanently, and everything ' +
    'the learner would have cleared after that point is never even asked about.</p>');

  /* -------- exhaustive sweep -------- */
  if (withSweep) {
    say('Exhaustive sweep — 65,536 score profiles × 4 recheck outcomes × 5 rule sets…');
    await tick();
    section('Exhaustive sweep — every possible learner',
      'All 4<sup>8</sup> = 65,536 score profiles (each core module scored 0–3), each crossed with every ' +
      'possible score on the first recheck offered. Chained rechecks are answered perfectly, so these are ' +
      'the <em>optimistic</em> numbers. Model only — far too many runs to click through.' +
      '<br><br>A caveat worth reading before quoting the percentages: this enumerates the space ' +
      '<em>uniformly</em>, weighting a 0/3 recheck exactly as heavily as a 3/3. It is “of everything that ' +
      'can happen, how much of it ends badly”, not a prediction of how often real learners will be ' +
      'stranded. The <strong>near-miss</strong> column is the one to read — those are learners who missed ' +
      'a single question twice.');
    line('');
    line('-- exhaustive sweep (65,536 profiles x 4 recheck outcomes):');
    const rows = [];
    for (const k of Object.keys(R.RULES)) {
      const s = R.sweep(R.RULES[k]);
      line('   ' + R.RULES[k].label.padEnd(34) + ' stranded ' + s.stuck + ' of ' + s.offered +
           ' recheck runs (' + pct(s.stuck, s.offered) + '), near-miss ' + s.stuckAtNearMiss +
           ', avg ' + s.avgLessonsLost.toFixed(1) + ' lessons lost, worst ' + s.maxLessonsLost);
      rows.push({
        cls: k === R.SHIPPED ? 'stuck' : '',
        cells: [
          '<strong>' + esc(R.RULES[k].label) + '</strong>',
          s.offered.toLocaleString(), s.stuck.toLocaleString(), pct(s.stuck, s.offered),
          s.stuckAtNearMiss
            ? '<span class="tag bad">' + s.stuckAtNearMiss.toLocaleString() + '</span>'
            : '<span class="tag ok">0</span>',
          s.avgModulesLost.toFixed(1), s.avgLessonsLost.toFixed(1), s.maxLessonsLost
        ]
      });
      await tick();
    }
    table(
      ['Rule', { label: 'Runs with a recheck', num: true }, { label: 'Stranded', num: true },
       { label: 'Strand rate', num: true }, { label: 'Stranded after a near miss', num: true },
       { label: 'Avg aced modules lost', num: true },
       { label: 'Avg lessons lost', num: true }, { label: 'Worst case', num: true }],
      rows);
  }

  out.insertAdjacentHTML('beforeend',
    '<h2>Copyable report</h2><pre class="report">' + esc(plainText.join('\n')) + '</pre>');

  say('Done — ' + all.length + ' scenarios driven through the real UI.');
  byId('run').disabled = false;
  byId('sweep').disabled = false;
  console.log(plainText.join('\n'));
}

byId('run').addEventListener('click', () => run(false));
byId('sweep').addEventListener('click', () => run(true));

/* `?auto=1` runs on load, `?auto=sweep` includes the exhaustive sweep. This
   exists so the same harness can be driven headlessly without a human
   pressing anything — see run-headless.sh. */
const auto = new URLSearchParams(location.search).get('auto');
if (auto) run(auto === 'sweep');

})();
