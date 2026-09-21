# SOLace Behavioural Insights — teacher demo

A client-side demo, for teachers, of how student **testing behaviour** and **question topics**
interact across a 40-question multiple-choice practice test. One graph carries the argument: a
per-test timeline with a topic layer and a changepoint layer that each toggle on and off, so you
can see where a slump in behaviour lines up with the topic that preceded it.

Everything in it is **synthetic**. The numbers are generated, seeded and reproducible; they
demonstrate the method, they are not findings about real students.

## Research basis

This is a demo layer on top of published research: the **SOLace** paper by **Vivien Berg and
Jessica Lin (George Mason University)** — [learnsolace.org](https://learnsolace.org). SOLace
encodes each question response into one of six behavioural states and analyses how behavioural
changepoints line up with question topics.

`reference/encode.py` is the authoritative encoding spec, and `reference/SOLace_Paper_IEEE.pdf`
is the paper. [src/encoding/encode.ts](src/encoding/encode.ts) is a direct port: same six states,
same multiple-choice guards, same branch order. The function was not changed.

### How this demo extends the paper

SOLace is **forward-only** — a student never returns to an earlier question — so a blank is
terminal there: BF and BS end the chain. Here a student may leave a question blank and come back
to it later, and that return behaviour feeds the transition analysis directly:

- The Markov sequence runs over each student's **temporal visit path**, not over question order.
- A skip is a genuine BF or BS in the chain.
- A later return is a **separate visit** that emits its own state and its own transition.
- The pair *(blank state → return state)* is also kept as a first-class edge (a `ReturnLink`), on
  top of the two visits' own path transitions, because the two visits are non-adjacent in the path.

One consequence is deliberate and is called out in the UI: **the transition matrix diverges from
the paper's Fig. 3 by design.** The forward-only study could never observe a transition into a
return visit; those transitions are in this matrix.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

| script | what it does |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | typecheck and build to `dist/` |
| `npm run preview` | serve the built output |
| `npm test` | unit tests (encoding port, generator invariants, analysis, baked-in signal) |
| `npm run signal` | print the headline numbers for the current defaults |
| `npm run sweep` | print those numbers across the whole range of every knob |

No backend, no network calls. Vite + React + TypeScript in strict mode, with no `any`. The
timeline is hand-built SVG; so is every other chart, for one consistent set of marks.

## The six states

A state is assigned **per visit**, not per question. A blank visit and its later return each get
their own.

| state | meaning | how it is reached |
| --- | --- | --- |
| **C** | correct, engaged | answered, took a normal amount of time, got it right |
| **W** | wrong, engaged | answered, took a normal amount of time, got it wrong |
| **V** | heavy revision | multiple choice, 3+ answer changes, not rapid — visible uncertainty |
| **R** | rapid | at or under the question's rapid threshold — too fast to have read it |
| **BF** | blank fast | multiple choice, 0 changes, at or under the threshold — a skip |
| **BS** | blank slow | multiple choice, 0 changes, over the threshold — worked it, then gave up |

The branches are evaluated in that order in `encode_state`, and the order matters:

1. **Blank is checked before rapid.** A blank can also be slow — a student can sit with a question
   for two minutes and never pick anything — so the blank branch runs first, and the threshold
   comparison happens *inside* it to split BF from BS.
2. **Rapid outranks revision.** A fast response with many changes is rapid, not revision.
3. **V is multiple-choice only**, like BF and BS: away from MC, `answerChanges` counts something
   other than choice-switching. Every question here is MC, but the guards are kept so the port
   stays faithful.

### Rapid threshold

```
rapidThreshold(q) = min(0.30 × median(durationSeconds over all visits to q across all students), 10)
```

The median is taken over **per-visit** times rather than per-question totals, so the threshold
stays comparable to the duration of a single visit even when a question was visited twice. Times
are integer seconds; at the defaults the thresholds land between about 8 and 10 seconds.

## Modelling decisions

- **Synthetic data, seeded.** A mulberry32 generator; the same seed always rebuilds the same class.
  The seed and every knob live in the URL, so a settings link is shareable.
- **The temporal visit path is the Markov sequence.** Everything downstream — transitions,
  changepoints, position histogram — walks `attempt.path`, which is every visit in the order it
  happened.
- **Returns feed the transitions.** They are not a separate track bolted on the side; they are
  visits in the chain, and the timeline draws the path in temporal order so a return produces a
  connector that loops back along the question axis.
- **The transition matrix diverges from Fig. 3 by design**, as above. Lift also scales inversely
  with how common a state is, so the *absolute* blank-to-blank lift moves as you move the blank-rate
  knob: the rarer blanks get, the higher it climbs. The paper reports 20×+ on real data where blanks
  are rarer than they are here by default.
- **The generator bakes in the paper's findings** so the graphs show signal rather than noise:
  blank stickiness (much the strongest effect), weaker rapid stickiness, topic triggers that fire on
  the trigger question itself, a downward accuracy drift after a behaviour change, late-test fatigue,
  and returns that beat cold first-pass answers. `src/data/signal.test.ts` asserts each of these
  still holds, so a change that flattens one of them fails the suite.
- **Blank and rapid stickiness are two-regime Markov chains** — an entry rate from normal
  answering, and a persistence rate once a run has started. For a chain like that the observed lift
  is roughly `persistence ÷ share`, so persistence is set from a target lift, which keeps the
  headline numbers stable as the rate knobs move.
- **A changepoint is any transition to a different state** between adjacent visits in the path. It
  is *negative* when mean correctness over the k answering visits after it is lower than over the k
  before. Both windows clamp at the ends of the path.
- **Generation and analysis are separate passes.** Moving the changepoint window or the
  blank-handling rule re-measures the same class without reshuffling it.

## Every knob

### Class

| knob | default | what it does |
| --- | --- | --- |
| Random seed | `solace-2026` | Reproduces a class exactly. **Regenerate** picks a new one. |
| Students | 48 | Class size, 4–200. |

### Behaviour

| knob | default | what it does |
| --- | --- | --- |
| Global blank rate | 3% | Baseline chance of going blank on the forward pass. Difficulty, fatigue, topic triggers and blank stickiness all push it up, so the realised share is higher — the panel shows the realised number next to the knob. |
| Rapid-response rate | 7% | Baseline chance of answering at or under the rapid threshold. |
| Revision propensity | 12% | Chance an answering visit turns into 3+ answer changes, which encodes as V. |

### Returns

| knob | default | what it does |
| --- | --- | --- |
| Blank, then return | 55% | Chance a skipped question is answered on a later visit. At 0 there are no returns at all and the chain is forward-only, like the paper. |
| Return timing | End of test | One sweep back after the forward pass, or coming back a few questions later during it. |

### Topics (per topic, 5 of them)

| knob | default | what it does |
| --- | --- | --- |
| Label | *editable* | The name a teacher sees, everywhere. |
| Difficulty | 0.22–0.72 | How much the topic drags accuracy down, and how often it gets skipped. |
| Difficulty trigger | on for two topics | Meeting the topic raises the chance of a negative changepoint on that question and the few visits after it — the coordinate-plane and 2-D-geometry effects in the paper. |

### Changepoint analysis

| knob | default | what it does |
| --- | --- | --- |
| Accuracy window k | 3 | Answering visits compared either side of a changepoint. |
| Blanks in that window | Exclude | Drop blanks from the window, or count them as incorrect. |

Both of these re-measure the same class; neither reshuffles it.

## The views

**Individual student** — the per-test timeline. X axis is the question number, 1 to 40. Each visit
is a marker at its question; a question that was skipped and later answered stacks two markers, the
blank on the lower lane and the return above. The path is drawn in temporal order, so a return
loops back along the axis. Toggles: **topic layer**, **changepoint layer**, **emphasise returns**,
plus a view-mode switch between *by question* (with the back-arcs) and *by visit order* (the same
path straightened left to right, where the return links become dashed arcs). Hovering a marker
gives the question, topic, state, duration, answer changes, whether it was a return, correctness and
the threshold. A **Table** toggle shows the same path as numbers.

**Classroom** — the same two toggles over the whole class, one column per question: the mix of
states its visits encoded to, or the blank and changepoint rates, plus aggregate changepoint
frequency and return rate.

**Supporting panels** — the transition-lift heatmap, the blank-to-return panel, the
changepoint-position histogram (Fig. 4), the accuracy-delta histogram (Fig. 5), the per-topic
negative-changepoint lift (Table III), and the overall state mix.

## Layout

```
reference/           encode.py (the spec) and the SOLace paper
scripts/             dev-only: print the headline numbers, sweep the knobs
src/encoding/        the port of encode.py, and its tests
src/data/            types, seeded PRNG, synthetic generator, generator tests
src/analysis/        thresholds, path, transitions, changepoints, lifts, returns, aggregate
src/components/      Timeline, AggregateTimeline, TransitionHeatmap, Histograms,
                     TopicLiftTable, ReturnsPanel, ControlPanel, ScopeSwitch,
                     StudentPicker, Legend, palette, ui
src/state/           settings (with URL and localStorage persistence) and app state
```

## Colour

Two categorical scales, both checked with a palette validator on the strictest (all-pairs)
comparison, in light and dark, against the surfaces the app actually renders on:

| scale | light | dark |
| --- | --- | --- |
| six states | worst CVD ΔE 8.1, worst normal-vision ΔE 16.9, all ≥ 3:1 contrast | 8.0 / 16.5 / ≥ 3:1 |
| five topics | worst CVD ΔE 8.0, worst normal-vision ΔE 16.2, all ≥ 3:1 contrast | 8.0 / 16.0 / ≥ 3:1 |

Each state keeps one hue across both themes; only the step changes. Colour is never the only
channel: every state also has its own mark shape — filled for an answered visit, hollow for a blank
one — and every legend, table and tooltip names the state in text. Topic colours render as low-alpha
washes wherever they share a chart with state marks, so the locator layer never competes with the
marks on top of it.
