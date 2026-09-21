# Project: SOLace Behavioral Insights (Teacher Demo)

Build a new client-side web application (no backend) that demos, for teachers, how student
testing behavior and question topics interact across a practice test. This is a demo layer on
top of published research: the SOLace paper by Vivien Berg and Jessica Lin (George Mason
University), which encodes each question response into a behavioral state and analyzes how
behavioral changepoints line up with question topics. Use synthetic student data for now.

This demo extends the paper in one key way. SOLace is forward-only (no returning to prior
questions), so blanks (BF/BS) are terminal there. Here, students may leave a question blank and
return to it later, and that return behavior feeds the state-transition analysis directly: the
Markov sequence runs over each student's temporal visit path, not over question order. A skip is
a genuine BF/BS in the chain, and a later return is a separate visit that emits its own state and
its own transition.

Place `encode.py` and the paper PDF in a `/reference` folder. Treat `encode.py` as the
authoritative encoding spec and port it to TypeScript exactly. The function does not change; the
demo simply applies it per visit and builds the sequence temporally.

## Stack
- Vite + React + TypeScript, latest stable, client-side only, no server.
- Strict TypeScript, no `any`.
- Hand-build the primary timeline in SVG/React for full control of the layered overlays and the
  back-arc transition path. A small charting library (Recharts) is acceptable for the standard
  aggregate charts (histograms, heatmap); hand-build those in SVG if you prefer consistency.
- Seeded pseudo-random generator (e.g. mulberry32) so a given seed reproduces a dataset exactly.
- npm scripts: `dev`, `build`, `preview`, `test`. Runnable with `npm install` then `npm run dev`.

## Core encoding: port from encode.py exactly (applied per visit)
Six states: C, W, V, R, BF, BS.
Constants: MC type set {"multiple-choice","multiple_choice","mc","single_select","multiplechoice"};
REVISION_MIN = 3.
`isMc(type)`: true only for a known MC type; null/undefined returns false.
`encodeState(timeSeconds, answerChanges, wasCorrect, questionType, rapidThreshold)`, evaluated in
this order (once a branch matches, stop):
1. If isMc and answerChanges === 0: return "BF" when timeSeconds <= rapidThreshold, else "BS".
   (Blank is checked before rapid, because a blank response can also be slow.)
2. If timeSeconds <= rapidThreshold: return "R".
3. If isMc and answerChanges >= 3: return "V".
4. Else: "C" when wasCorrect, else "W".
Keep the isMc guards so V/BF/BS stay MC-only even though all questions are MC here.

Apply this per visit:
- A blank visit (the student advanced without selecting) has answerChanges = 0, so it encodes to
  BF or BS by time. wasCorrect is irrelevant for a blank visit.
- An answering visit passes that visit's duration, that visit's answerChanges, and whether the
  submitted answer is correct, encoding to R/V/C/W.

Rapid threshold per question, computed from per-visit times so it stays comparable to a single
visit's duration: rapidThreshold(q) = min(0.30 * median(durationSeconds over all visits to
question q across all students), 10). Times are integer seconds.

Write unit tests for the port covering: BF vs BS split by threshold; blank-before-rapid
(answerChanges 0 with a slow time gives BS, not R); R taking precedence over V (fast with >= 3
changes gives R); V only when MC and changes >= 3 and not rapid; C/W fallback by correctness.

## Data model
- Topic: id 0-4, editable label, difficultyWeight (a knob).
- Question: questionNumber 1-40, topicId, intrinsicDifficulty, four choices, correct index.
  Topics dispersed randomly across the 40 positions (seeded).
- Student: id, label, latent ability.
- Visit: questionNumber, pathIndex (temporal order across the whole attempt), durationSeconds,
  answerChangesInVisit, selectedChoice (nullable), leftBlank (bool), wasCorrect (false for a
  blank visit), isReturn (bool: a visit to a question left blank on an earlier visit), state (the
  encoded state for this visit).
- Attempt (one per student): path[] = every visit in temporal order. This is the Markov
  sequence. Also store, per question, its visits and a derived terminalOutcome (final
  correctness) for scoring and display only.
- ReturnLink: for each skipped-then-returned question, the pair (blankState from the first visit,
  returnState from the answering visit). This is a first-class edge for the returns analysis, in
  addition to the visit appearing in the path.

The path is the sequence everything runs on. A blank early visit and its later return are
non-adjacent in the path (real returns happen after the forward sweep), so they connect through
the shared question via ReturnLink, and each still contributes its own path transitions.

## Synthetic data generator: bake in the paper's findings, with knobs
Navigation model per student:
- Forward pass over Q1..Q40. On each question the student either answers it (one visit) or skips
  it blank (a blank visit, BF or BS), with skip probability driven by question difficulty, topic
  trigger, and blank stickiness.
- Return pass after the forward pass over the skipped questions. With the blank-then-return
  probability the student answers the question on a return visit (isReturn true, state R/V/C/W);
  otherwise it stays blank (terminal for this attempt).

Bake in the patterns the paper reports so the graphs show real signal:
- Blank stickiness in the forward pass: once a student enters BF or BS, sharply raise the
  probability of blank on following forward questions (Fig. 3 shows blank-to-blank lifts ~20+).
- Rapid stickiness: R-to-R elevated but weaker than blank (lift ~5).
- Topic-driven negative changepoints: mark a subset of topics as difficulty triggers so
  encountering them raises the chance of a negative changepoint on following visits (mirrors the
  coordinate-plane and 2-D-geometry effects in the paper).
- Post-changepoint accuracy skew: after a changepoint, accuracy trends down more often than up
  (Fig. 5).
- Returns: model a chance that returning improves correctness relative to a first-pass answer, so
  the returns analysis carries real signal.

Control panel (live knobs, all seeded):
- random seed
- number of students (default about 48)
- per-topic difficulty / trigger flags
- global blank rate
- rapid-response rate
- blank-then-return probability
- return timing mode: end-of-test return pass (default) or interleaved returns
- revision propensity
- changepoint accuracy window k (default 3)
- blank handling in the accuracy window: exclude blanks (default) or count them as incorrect
Include a Regenerate button. Persist current settings to the URL query or localStorage (wrap
storage access in try/catch).

## Analysis engine (client-side TS), all over the temporal visit path
- Per-question median per-visit time and rapidThreshold as defined above.
- State per visit via the port.
- Sequence = each attempt's path[] (temporal visit order).
- Transition-lift matrix (6x6): lift(X to Y) = P(next=Y | current=X) / P(next=Y), over adjacent
  visits in the path. Render as a heatmap. Note in the UI that this diverges from the paper's
  Fig. 3 by design, since it now includes return transitions the forward-only study could not.
- Blank-to-return summary (the expansion): from the ReturnLinks, the distribution of return
  outcomes (C/W/V/R) given the originating blank state (BF or BS), plus a blank-to-return
  transition lift. Render this as its own panel.
- Changepoint: a transition to a different state between adjacent path visits.
- Negative changepoint: a changepoint where mean correctness over the k answering visits after is
  lower than over the k before (clamp at path edges; blank handling per the knob). Expose k.
- Position histogram (Fig. 4): position = pathIndex / (path length), so returns land at their
  true temporal position.
- Per-topic negative-changepoint lift (Table III): use the topic of the question at the
  changepoint visit. (rate of that topic's visits coinciding with a negative changepoint) / (rate
  across all visits). Render as a ranked table or bar chart.
- Return metrics: share of blank-first questions later answered, by topic and by student;
  correctness rate of return visits versus first-pass answering visits.

## Views
Two scopes with a clear switch: Individual student and Classroom aggregate.

Primary graph, the per-test timeline, is the single graph the toggles act on. X-axis is question
number 1..40 (teacher-legible). Each visit is a marker at its question; a question with a skip and
a later return stacks two markers in small lanes (first-visit blank lower, return above).
- Behavioral-state track: markers colored by state, with a legend for C/W/V/R/BF/BS.
- Transition path: draw the path following temporal order, so a return visit produces a connector
  that loops back to an earlier question. This is how return behavior feeds the visible
  transitions.
- Topic layer: color bands by topic behind the question axis. Toggle on/off.
- Changepoint layer: markers on the path edges, negative changepoints emphasized. Toggle on/off.
- Returns emphasis: a toggle that highlights the loop-back edges and their blank-to-return pairs.
- View-mode switch: "by question" (default, with back-arcs) or "by visit order" (the path
  straightened left to right).
- Per-visit tooltip: question, topic, state, duration, answer changes, isReturn, correctness,
  threshold.
- The topic and changepoint toggles are the non-negotiable feature: a teacher turns each layer on
  or off over the same timeline to see where topics and behavioral changepoints line up.

Classroom-aggregate timeline: per question, show the state distribution across students (a small
stacked bar) or percent blank and changepoint incidence, with the same topic and changepoint
toggles plus aggregate changepoint frequency and aggregate return rate.

Supporting aggregate panels: transition-lift heatmap, changepoint-position histogram (Fig. 4),
accuracy-delta histogram (Fig. 5), per-topic negative-changepoint lift (Table III), and the
blank-to-return panel described above.

## Project hygiene
- Folder layout: /reference (encode.py, paper), /src/encoding (encode.ts + tests), /src/data
  (types, generator, prng), /src/analysis (thresholds, path, changepoints, transitions, lifts,
  returns), /src/components (Timeline, AggregateTimeline, TransitionHeatmap, Histograms,
  TopicLiftTable, ReturnsPanel, ControlPanel, ScopeSwitch, StudentPicker), /src/state.
- README: what the demo is, its research basis (name the SOLace paper and learnsolace.org), how
  to run, the six states and thresholds, the modeling decisions (synthetic data; the temporal
  visit path as the Markov sequence; returns feeding transitions; the transition matrix diverging
  from Fig. 3 by design), and every knob.
- Colorblind-considerate palette; states visually distinct.

Sequence the build: scaffold the repo, port encode.py with its tests passing, then the data model
and generator, then the path-based analysis, then the timeline with the back-arc path, then the
aggregate views and supporting panels, then the control panel. Commit in logical steps.