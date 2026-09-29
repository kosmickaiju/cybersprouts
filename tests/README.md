# tests/ — placement test simulation

Written to answer one question: **can a learner who clearly knows the later
material get permanently stranded on an early module because of one careless
answer, plus one careless recheck?**

## Running it

```sh
open report-comparison.html                   # what the recheck fix changed
open report-before-fix.html                   # the findings that prompted it
open report-after-fix.html                    # the same analysis, post-fix

open placement-compare.html                   # run the before/after live
open placement-sim.html                       # run the full analysis live

./run-headless.sh --compare --sweep --save    # regenerate report-comparison.*
./run-headless.sh --sweep --save              # regenerate report.* (rename it)
```

The `report-*.html` files are snapshots with the scripts stripped out, so
opening one shows the findings rather than re-running anything. They are only
as current as the last `--save`; the two `placement-*.html` pages are live.

`report-before-fix.*` is deliberately frozen — it is the evidence the change
was made on, and regenerating it would overwrite the "before" with an "after".

`run-headless.sh` exits non-zero if the model and the real UI disagree, so it
works as a regression check if the grading rules are ever changed.

Nothing here writes to your progress — the harness never presses "Apply".

## The files

| File | What it is |
|---|---|
| `placement-driver.js` | **The driver.** Simulates a learner by clicking the real buttons in the real quiz. Re-implements no grading rule, so it cannot drift from what ships. |
| `placement-rules.js` | **The model.** A pure re-statement of the grading rules with the fixed constants turned into knobs, so rules the app does *not* implement can still be priced. |
| `placement-sim.html` / `.js` | Full analysis of whatever rule the app currently implements. |
| `placement-compare.html` / `.js` | Before/after one rule change: the same learner run under both rules. |
| `run-headless.sh` | Drives either page through headless Chrome and prints the report. |
| `report-*.html` / `.txt` | Saved runs, readable without running anything. |

## The change this was used to make

The recheck used to require **3 of 3** fresh questions, which made a 2/3
indistinguishable from a 0/3 and stranded learners who had clearly earned the
skip. It now tolerates **one miss** — `RECHECK_MISSES_ALLOWED` in
`assets/js/placement.js`. `report-comparison.txt` has the numbers.

`placement-rules.js` exports `SHIPPED`, naming which rule set the app is
believed to implement. Both harnesses read it rather than hard-coding a rule,
so if `placement.js` changes again and nobody updates that line, the
cross-check against the real UI fails loudly instead of quietly lying. That is
not theoretical — it is exactly what happened when the fix landed, and the
harness reported 15/68 disagreements before anything was updated.

## Why there are two layers

The driver is trustworthy but can only test rules that already exist — it
clicks real buttons, so it can only observe what the app already does.
The model can test rules that *don't* exist yet, which is the whole point of
asking "would 2-of-3 be better?", but a re-statement of a rule is exactly the
kind of thing that quietly drifts from the original.

So every scenario is run through **both**, and the results compared on the
cleared modules, the score, and every recheck taken. The page prints that
verdict at the very top, before any number that depends on the model. If the
two ever disagree, the variant comparison is worthless and the page says so
instead of showing it.

## What the scenarios cover

- **Matrix A** — every module answered perfectly except one, which scores 2/3
  and so earns a recheck. That recheck is then answered 0/3, 1/3, 2/3 and 3/3.
  Eight modules x four outcomes.
- **Matrix B** — the same, but with a slip on the module above as well, so a
  passed recheck has somewhere to chain to.
- **Matrix C** — 1/3 on the blocker, which earns no recheck at all.
- **Guardrails** (comparison page only) — the checks that a *loosened* rule
  must still fail: 1/3 and 0/3 rechecks still keep the module, 1/3 in the main
  test still earns no recheck, modules still clear as a prefix, and nothing is
  ever cleared without being answered.
- **The gauntlet** — every matrix above moves one module at a time, which is
  not what a real result looks like. This enumerates every arrangement of *k*
  near-missed modules and reports how many consecutive perfect rechecks stand
  between that learner and the fork. A 19/24 needs five in a row, 15 fresh
  questions with no margin anywhere.
- **Exhaustive sweep** — all 4^8 score profiles crossed with every possible
  first-recheck score. Model only; far too many to click through.

## Two assumptions worth knowing about

1. **Which questions are answered wrong.** A module scored k/3 has its first k
   questions right. Grading only ever counts how many are correct, never which,
   so this cannot affect a result.
2. **How a learner performs on a retry.** Only relevant to the "two recheck
   attempts" variant, and it is a property of the learner rather than the rule,
   so the report shows it both ways: the retry going the same, and the retry
   going one question better. Every other rule is unaffected by the choice,
   which is itself a check that the knob is wired up correctly.

The sweep enumerates the space *uniformly* — a 0/3 recheck is weighted exactly
as heavily as a 3/3. Read its percentages as "of everything that can happen,
how much ends badly", not as a prediction of how often real learners will be
stranded. The near-miss column is the honest one.
