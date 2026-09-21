/**
 * Every knob, live and seeded.
 *
 * The generation knobs reshape the class; the analysis knobs only change how the
 * same class is measured. They are grouped that way so it is obvious which
 * changes are which.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { BlankHandling, ReturnTiming, Settings, TopicSetting } from '../state/settings';
import { LIMITS, shareableUrl } from '../state/settings';
import { percent } from '../analysis/stats';
import { Segmented, Slider } from './ui';
import { topicColor } from './palette';

export function ControlPanel({
  settings,
  onChange,
  onTopicChange,
  onRegenerate,
  onReset,
  observedBlankShare,
  observedRapidShare,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onTopicChange: (topicId: number, patch: Partial<TopicSetting>) => void;
  onRegenerate: () => void;
  onReset: () => void;
  observedBlankShare: number;
  observedRapidShare: number;
}): ReactNode {
  const [copied, setCopied] = useState(false);

  const copyLink = (): void => {
    const url = shareableUrl(settings);
    const done = (): void => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    };
    try {
      void navigator.clipboard.writeText(url).then(done, () => undefined);
    } catch {
      // Clipboard unavailable; the URL bar already carries the same settings.
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>Controls</h2>
      </div>

      <div className="button-row">
        <button type="button" className="button button-primary" onClick={onRegenerate}>
          Regenerate
        </button>
        <button type="button" className="button" onClick={copyLink}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <button type="button" className="button" onClick={onReset}>
          Reset
        </button>
      </div>

      <fieldset className="control-group">
        <legend>Class</legend>
        <div className="field">
          <label className="field-label" htmlFor="seed">
            <span>Random seed</span>
          </label>
          <input
            id="seed"
            type="text"
            value={settings.seed}
            onChange={(event) => onChange({ seed: event.currentTarget.value })}
          />
          <p className="field-hint">The same seed always rebuilds the same class.</p>
        </div>
        <Slider
          label="Students"
          value={settings.studentCount}
          min={LIMITS.studentCount.min}
          max={LIMITS.studentCount.max}
          step={LIMITS.studentCount.step}
          onChange={(value) => onChange({ studentCount: value })}
        />
      </fieldset>

      <fieldset className="control-group">
        <legend>Behaviour</legend>
        <Slider
          label="Global blank rate"
          value={settings.blankRate}
          min={LIMITS.blankRate.min}
          max={LIMITS.blankRate.max}
          step={LIMITS.blankRate.step}
          format={(value) => percent(value, 1)}
          hint={`Baseline chance of going blank. Difficulty, fatigue, topic triggers and blank stickiness all push it up — ${percent(
            observedBlankShare,
            1,
          )} of visits actually came out blank.`}
          onChange={(value) => onChange({ blankRate: value })}
        />
        <Slider
          label="Rapid-response rate"
          value={settings.rapidRate}
          min={LIMITS.rapidRate.min}
          max={LIMITS.rapidRate.max}
          step={LIMITS.rapidRate.step}
          format={(value) => percent(value, 1)}
          hint={`Baseline chance of answering at or under the rapid threshold — ${percent(
            observedRapidShare,
            1,
          )} of visits landed there.`}
          onChange={(value) => onChange({ rapidRate: value })}
        />
        <Slider
          label="Revision propensity"
          value={settings.revisionPropensity}
          min={LIMITS.revisionPropensity.min}
          max={LIMITS.revisionPropensity.max}
          step={LIMITS.revisionPropensity.step}
          format={(value) => percent(value, 0)}
          hint="Chance an answering visit turns into 3+ answer changes, which encodes as V."
          onChange={(value) => onChange({ revisionPropensity: value })}
        />
      </fieldset>

      <fieldset className="control-group">
        <legend>Returns</legend>
        <Slider
          label="Blank, then return"
          value={settings.blankThenReturnProbability}
          min={LIMITS.blankThenReturnProbability.min}
          max={LIMITS.blankThenReturnProbability.max}
          step={LIMITS.blankThenReturnProbability.step}
          format={(value) => percent(value, 0)}
          hint="Chance a skipped question gets answered on a later visit."
          onChange={(value) => onChange({ blankThenReturnProbability: value })}
        />
        <div className="field">
          <span className="field-label">
            <span>Return timing</span>
          </span>
          <Segmented<ReturnTiming>
            label="Return timing"
            value={settings.returnTiming}
            options={[
              { value: 'end-of-test', label: 'End of test' },
              { value: 'interleaved', label: 'Interleaved' },
            ]}
            onChange={(value) => onChange({ returnTiming: value })}
          />
          <p className="field-hint">
            One sweep back at the end, or coming back a few questions later during the test.
          </p>
        </div>
      </fieldset>

      <fieldset className="control-group">
        <legend>Topics</legend>
        {settings.topics.map((topic) => (
          <div key={topic.id} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <span
                className="legend-swatch"
                style={{ background: topicColor(topic.id), width: 11, height: 11 }}
              />
              <input
                type="text"
                aria-label={`Topic ${topic.id + 1} label`}
                value={topic.label}
                onChange={(event) => onTopicChange(topic.id, { label: event.currentTarget.value })}
              />
            </div>
            <Slider
              label="Difficulty"
              value={topic.difficultyWeight}
              min={LIMITS.difficultyWeight.min}
              max={LIMITS.difficultyWeight.max}
              step={LIMITS.difficultyWeight.step}
              format={(value) => value.toFixed(2)}
              onChange={(value) => onTopicChange(topic.id, { difficultyWeight: value })}
            />
            <label className="toggle">
              <input
                type="checkbox"
                checked={topic.isTrigger}
                onChange={(event) =>
                  onTopicChange(topic.id, { isTrigger: event.currentTarget.checked })
                }
              />
              <span>Difficulty trigger</span>
            </label>
          </div>
        ))}
        <p className="field-hint">
          A trigger topic raises the chance of a negative changepoint on the question itself and the
          few visits after it.
        </p>
      </fieldset>

      <fieldset className="control-group">
        <legend>Changepoint analysis</legend>
        <Slider
          label="Accuracy window k"
          value={settings.changepointWindowK}
          min={LIMITS.changepointWindowK.min}
          max={LIMITS.changepointWindowK.max}
          step={LIMITS.changepointWindowK.step}
          hint="Answering visits compared either side of a changepoint. Clamped at the ends of the path."
          onChange={(value) => onChange({ changepointWindowK: value })}
        />
        <div className="field">
          <span className="field-label">
            <span>Blanks in that window</span>
          </span>
          <Segmented<BlankHandling>
            label="Blank handling"
            value={settings.blankHandling}
            options={[
              { value: 'exclude', label: 'Exclude' },
              { value: 'incorrect', label: 'Count as wrong' },
            ]}
            onChange={(value) => onChange({ blankHandling: value })}
          />
          <p className="field-hint">
            These two knobs re-measure the same class; they never reshuffle it.
          </p>
        </div>
      </fieldset>
    </section>
  );
}
