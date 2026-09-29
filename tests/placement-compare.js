/* Cybersprouts — before / after the recheck fix.
   ==================================================================
   The companion to placement-sim.js. That file analyses whatever rule
   the app currently implements; this one answers a narrower question:
   what did changing the recheck pass mark from 3/3 to 2/3 actually do,
   and did it go too far?

   Each scenario is run as the SAME learner twice:

     BEFORE  the old rule (R.PREVIOUS), through the verified model —
             that code no longer exists to click.
     AFTER   the new rule (R.SHIPPED), through the model AND through
             the real UI, cross-checked. If those two disagree the page
             says so and stops trusting itself.

   Depends on: data.js, app.js, placement.js, placement-rules.js,
   placement-driver.js.
   ================================================================== */

(function () {
'use strict';

const R = PlacementRules;
const D = PlacementDriver;
const { titleOf } = R;
const { runScenario } = D;

const byId = id => document.getElementById(id);
const out  = byId('out');
const say  = m => { byId('status').textContent = m; };
const tick = () => new Promise(r => setTimeout(r, 0));
const esc  = s => String(s).replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
const pct  = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';

let plain = [];
const line = s => plain.push(s);

function section(title, subHtml) {
  out.insertAdjacentHTML('beforeend',
    '<h2>' + esc(title) + '</h2>' + (subHtml ? '<p class="sub">' + subHtml + '</p>' : ''));
  line(''); line('== ' + title.toUpperCase());
}

function table(headers, rows) {
  const head = headers.map(h => '<th class="' + (h.num ? 'num' : '') + '">' + esc(h.label || h) + '</th>').join('');
  const body = rows.map(r => '<tr class="' + (r.cls || '') + '">' +
    r.cells.map((c, i) => '<td class="' + (headers[i].num ? 'num' : '') + '">' + c + '</td>').join('') +
    '</tr>').join('');
  out.insertAdjacentHTML('beforeend',
    '<div class="scroll"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>');
}

const OUTCOME = r => r.blocker ? titleOf(r.blocker) : 'the fork';

/* ------------------------------------------------------------------- main */
async function run(withSweep) {
  out.innerHTML = '';
  plain = [];
  byId('run').disabled = true;
  byId('sweep').disabled = true;

  line('CYBERSPROUTS — PLACEMENT TEST: BEFORE / AFTER THE RECHECK FIX');
  line('Generated ' + new Date().toISOString());
  line('BEFORE = ' + R.RULES[R.PREVIOUS].label + '   (model)');
  line('AFTER  = ' + R.RULES[R.SHIPPED].label + '   (model + the real UI, cross-checked)');

  const problems = R.preflight();
  if (problems.length) {
    out.insertAdjacentHTML('beforeend',
      '<div class="verify bad"><strong>Preflight problems</strong><br>' + problems.map(esc).join('<br>') + '</div>');
    problems.forEach(p => line('PREFLIGHT: ' + p));
  }

  const M = R.matrices();
  say('Driving the fixed UI through every scenario…'); await tick();

  /* The AFTER column is clicked through the real quiz; BEFORE is modelled. */
  const rows = [];
  for (const sc of M.A.concat(M.B, M.C)) {
    const after  = runScenario(sc, R.SHIPPED);            // real UI + model
    const before = R.modelRun(sc.scores, R.RULES[R.PREVIOUS], sc.plan);
    rows.push({ sc, before, after: after.model, dom: after.dom, agree: after.agree, place: after.place });
  }
  const A = rows.filter(r => r.sc.matrix === 'A');
  const B = rows.filter(r => r.sc.matrix === 'B');
  const C = rows.filter(r => r.sc.matrix === 'C');
  const mismatches = rows.filter(r => !r.agree);

  out.insertAdjacentHTML('beforeend', mismatches.length
    ? '<div class="verify bad"><strong>' + mismatches.length + ' of ' + rows.length + ' scenarios disagree</strong> ' +
      'between the rule model and the real UI. The app is not doing what <code>R.SHIPPED</code> claims, so ' +
      'nothing below can be trusted — check <code>RECHECK_MISSES_ALLOWED</code> against ' +
      '<code>placement-rules.js</code>.</div>'
    : '<div class="verify ok"><strong>The fix is live and matches the model.</strong> All ' + rows.length +
      ' “after” scenarios were clicked through the real quiz and agreed with the ' +
      esc(R.RULES[R.SHIPPED].label.toLowerCase()) + ' model on the cleared modules, the score, and every ' +
      'recheck taken.</div>');
  line('');
  line(mismatches.length
    ? 'VERIFICATION FAILED: ' + mismatches.length + '/' + rows.length + ' disagree with the real UI'
    : 'VERIFICATION OK: ' + rows.length + '/' + rows.length + ' matched the real UI');

  /* ---------------- headline ---------------- */
  const rescued = rows.filter(r => r.before.stuck && !r.after.stuck);
  const stillStuck = rows.filter(r => r.after.stuck);
  const lessonsBefore = rows.reduce((n, r) => n + r.before.lessonsDiscarded, 0);
  const lessonsAfter  = rows.reduce((n, r) => n + r.after.lessonsDiscarded, 0);

  section('What changed, in one line',
    'Across all ' + rows.length + ' scenarios in the three matrices.');
  table(
    ['Measure', { label: 'Before', num: true }, { label: 'After', num: true }, { label: 'Change', num: true }],
    [
      { cls: 'fork', cells: ['Learners stranded on a module they were offered a recheck on',
        rows.filter(r => r.before.stuck).length, stillStuck.length,
        '<span class="tag ok">−' + rescued.length + '</span>'] },
      { cls: 'fork', cells: ['Learners reaching the fork',
        rows.filter(r => !r.before.blocker).length, rows.filter(r => !r.after.blocker).length,
        '<span class="tag ok">+' + (rows.filter(r => !r.after.blocker).length -
                                    rows.filter(r => !r.before.blocker).length) + '</span>'] },
      { cls: 'fork', cells: ['Perfectly-answered lessons thrown away',
        lessonsBefore, lessonsAfter,
        '<span class="tag ok">−' + (lessonsBefore - lessonsAfter) + '</span>'] }
    ]);
  line('');
  line('   stranded        ' + rows.filter(r => r.before.stuck).length + '  ->  ' + stillStuck.length);
  line('   reach the fork  ' + rows.filter(r => !r.before.blocker).length + '  ->  ' + rows.filter(r => !r.after.blocker).length);
  line('   lessons lost    ' + lessonsBefore + '  ->  ' + lessonsAfter);

  /* ---------------- the case Luca hit ---------------- */
  section('The exact case that started this: 2/3 on a module, 2/3 on its recheck',
    'One careless answer, then one more on the fresh questions. Every core module, in turn.');
  table(
    ['Slip on', { label: 'Main score', num: true }, 'Before — lands on', 'After — lands on',
     { label: 'Lessons recovered', num: true }],
    A.filter(r => r.sc.recheckScore === 2).map(r => ({
      cls: 'fork',
      cells: [
        esc(titleOf(r.sc.target)),
        r.dom.correctShown + '/' + PLACEMENT_QUESTIONS.length,
        '<span class="tag bad">' + esc(OUTCOME(r.before)) + '</span>',
        '<span class="tag ok">' + esc(OUTCOME(r.after)) + '</span>',
        r.before.lessonsDiscarded - r.after.lessonsDiscarded
      ]
    })));
  line('');
  line('-- 2/3 then 2/3, per module (before -> after):');
  A.filter(r => r.sc.recheckScore === 2).forEach(r =>
    line('   slip on ' + titleOf(r.sc.target).padEnd(26) + ' ' +
         OUTCOME(r.before).padEnd(26) + ' -> ' + OUTCOME(r.after).padEnd(26) +
         ' recovers ' + (r.before.lessonsDiscarded - r.after.lessonsDiscarded) + ' lessons'));

  /* ---------------- full per-scenario ---------------- */
  section('Every scenario, side by side',
    'Matrices A (one slip), B (two slips, so rechecks chain) and C (1/3, no recheck offered). ' +
    'Rows that did not change are the ones to check as carefully as the rows that did.');
  table(
    ['Matrix', 'Slip on', { label: 'Recheck', num: true }, 'Before', 'After', 'Verdict', 'Model vs UI'],
    rows.map(r => {
      const changed = OUTCOME(r.before) !== OUTCOME(r.after);
      return {
        cls: changed ? 'fork' : (r.after.stuck ? 'stuck' : ''),
        cells: [
          r.sc.matrix,
          esc(titleOf(r.sc.target)),
          r.sc.recheckScore === null ? '<span class="tag warn">none</span>' : r.sc.recheckScore + '/3',
          esc(OUTCOME(r.before)),
          esc(OUTCOME(r.after)),
          changed ? '<span class="tag ok">rescued</span>'
                  : (r.after.stuck ? '<span class="tag bad">still stranded</span>'
                                   : '<span class="tag ok">unchanged — already fine</span>'),
          r.agree ? '<span class="tag ok">match</span>' : '<span class="tag bad">MISMATCH</span>'
        ]
      };
    }));

  /* ---------------- did it go too far? ---------------- */
  section('Did it go too far?',
    'The thing to check about a loosened rule is whether it still refuses anyone. These are the ' +
    'scenarios that are <em>supposed</em> to keep the module in the learner’s path.');
  const guardrails = [
    { q: 'A recheck answered 1/3 still keeps the module',
      ok: A.filter(r => r.sc.recheckScore === 1).every(r => r.after.stuck),
      n:  A.filter(r => r.sc.recheckScore === 1).length },
    { q: 'A recheck answered 0/3 still keeps the module',
      ok: A.filter(r => r.sc.recheckScore === 0).every(r => r.after.stuck),
      n:  A.filter(r => r.sc.recheckScore === 0).length },
    { q: '1/3 in the main test still earns no recheck at all',
      ok: C.every(r => r.after.rechecks.length === 0), n: C.length },
    { q: 'Modules still clear as a prefix, never an arbitrary set',
      ok: rows.every(r => r.after.cleared.every((id, i) => id === R.CORE[i])), n: rows.length },
    { q: 'No module is ever cleared without being answered',
      ok: rows.every(r => r.after.cleared.every(id =>
            r.sc.scores[R.idx(id)] === R.PER_MODULE[R.idx(id)] ||
            r.after.passedRechecks.indexOf(id) !== -1)), n: rows.length }
  ];
  table(['Guardrail', { label: 'Scenarios', num: true }, 'Still holds?'],
    guardrails.map(g => ({
      cls: g.ok ? '' : 'stuck',
      cells: [esc(g.q), g.n,
        g.ok ? '<span class="tag ok">yes</span>' : '<span class="tag bad">NO — regression</span>']
    })));
  line('');
  line('-- guardrails:');
  guardrails.forEach(g => line('   [' + (g.ok ? ' ok ' : 'FAIL') + '] ' + g.q + '  (' + g.n + ' scenarios)'));

  /* ---------------- the gauntlet ---------------- */
  section('The gauntlet — a realistic good-but-not-perfect result',
    'A learner who slips once in several modules faces a <em>run</em> of rechecks. Before the fix each ' +
    'one had to be perfect, so the run was only as strong as its weakest link. “Cost of one slip” is what ' +
    'a single 2/3 anywhere in that run used to throw away; “cost of two” is a 1/3, which should still cost ' +
    'something.');
  const gBefore = R.gauntlet(R.RULES[R.PREVIOUS]);
  const gAfter  = R.gauntlet(R.RULES[R.SHIPPED]);
  table(
    [{ label: 'Modules at 2/3', num: true }, { label: 'Main score', num: true },
     { label: 'Rechecks in the run', num: true },
     { label: 'Cost of ONE slip — before', num: true }, { label: '— after', num: true },
     { label: 'Cost of TWO — after', num: true }],
    gBefore.map((g, i) => ({
      cls: 'fork',
      cells: [
        g.nearMissed, g.mainScore + '/' + g.of, g.maxRechecks,
        '<span class="tag bad">avg ' + g.avgLostToOneSlip.toFixed(0) + ' lessons</span>',
        gAfter[i].avgLostToOneSlip
          ? '<span class="tag warn">avg ' + gAfter[i].avgLostToOneSlip.toFixed(0) + '</span>'
          : '<span class="tag ok">nothing</span>',
        gAfter[i].avgLostToTwoSlips
          ? '<span class="tag bad">avg ' + gAfter[i].avgLostToTwoSlips.toFixed(0) + ' lessons</span>'
          : '<span class="tag ok">nothing left to lose</span>'
      ]
    })));
  line('');
  line('-- the gauntlet (cost of one imperfect recheck in the run):');
  gBefore.forEach((g, i) => line('   ' + String(g.nearMissed).padStart(2) + ' modules at 2/3 = ' +
    (g.mainScore + '/' + g.of).padEnd(7) + '  one slip: ' +
    g.avgLostToOneSlip.toFixed(0).padStart(2) + ' lessons -> ' +
    gAfter[i].avgLostToOneSlip.toFixed(0).padStart(2) + '   two slips after: ' +
    gAfter[i].avgLostToTwoSlips.toFixed(0).padStart(2) + ' lessons'));

  /* ---------------- sweep ---------------- */
  if (withSweep) {
    say('Comparing across all 65,536 possible learners…'); await tick();
    section('Every possible learner, before and after',
      'All 4<sup>8</sup> score profiles crossed with every possible first-recheck score. Model only. ' +
      'Enumerated <em>uniformly</em>, so read these as “of everything that can happen, how much ends ' +
      'badly”, not as a prediction of real frequencies.');
    const sB = R.sweep(R.RULES[R.PREVIOUS], 0);
    const sA = R.sweep(R.RULES[R.SHIPPED], 0);
    table(
      ['Measure', { label: 'Before', num: true }, { label: 'After', num: true }, { label: 'Change', num: true }],
      [
        { cls: 'fork', cells: ['Runs where a recheck is offered', sB.offered.toLocaleString(),
          sA.offered.toLocaleString(), 'unchanged — the offer gate did not move'] },
        { cls: 'fork', cells: ['Runs ending stranded', sB.stuck.toLocaleString(), sA.stuck.toLocaleString(),
          '<span class="tag ok">−' + (sB.stuck - sA.stuck).toLocaleString() + ' (' +
          pct(sB.stuck - sA.stuck, sB.stuck) + ')</span>'] },
        { cls: 'fork', cells: ['Stranded after a <em>near miss</em> (2/3 then 2/3)',
          sB.stuckAtNearMiss.toLocaleString(),
          sA.stuckAtNearMiss ? sA.stuckAtNearMiss.toLocaleString() : '<span class="tag ok">0</span>',
          '<span class="tag ok">eliminated</span>'] },
        { cls: '', cells: ['Worst single case, lessons discarded', sB.maxLessonsLost, sA.maxLessonsLost,
          sA.maxLessonsLost === sB.maxLessonsLost
            ? 'unchanged — a genuine 0/3 gap can still cost this'
            : '<span class="tag ok">−' + (sB.maxLessonsLost - sA.maxLessonsLost) + '</span>'] }
      ]);
    line('');
    line('-- exhaustive sweep, before -> after:');
    line('   recheck runs      ' + sB.offered + ' -> ' + sA.offered);
    line('   stranded          ' + sB.stuck + ' -> ' + sA.stuck);
    line('   near-miss strands ' + sB.stuckAtNearMiss + ' -> ' + sA.stuckAtNearMiss);
    line('   worst case        ' + sB.maxLessonsLost + ' -> ' + sA.maxLessonsLost + ' lessons');
  }

  out.insertAdjacentHTML('beforeend',
    '<h2>Copyable report</h2><pre class="report">' + esc(plain.join('\n')) + '</pre>');

  say('Done — ' + rows.length + ' scenarios, each run under both rules.');
  byId('run').disabled = false;
  byId('sweep').disabled = false;
  console.log(plain.join('\n'));
}

byId('run').addEventListener('click', () => run(false));
byId('sweep').addEventListener('click', () => run(true));

const auto = new URLSearchParams(location.search).get('auto');
if (auto) run(auto === 'sweep');

})();
