/**
 * Table III: per-topic negative-changepoint lift.
 *
 *     lift(topic) = (rate of that topic's visits coinciding with a negative
 *                    changepoint) / (rate across all visits)
 *
 * The topic is taken from the question at the changepoint visit -- the visit
 * the new state starts on -- so a topic gets credit for the behaviour that
 * follows meeting it.
 *
 * Only visits that *could* be a changepoint anchor count in the denominator:
 * the first visit of an attempt has nothing before it.
 */
import type { Attempt, Question, Topic } from '../data/types';
import { questionAt } from '../data/types';
import type { Changepoint } from './changepoints';

export interface TopicLift {
  topicId: number;
  label: string;
  isTrigger: boolean;
  difficultyWeight: number;
  /** Visits of this topic eligible to be a changepoint anchor. */
  eligibleVisits: number;
  negativeChangepoints: number;
  /** negativeChangepoints / eligibleVisits. */
  rate: number;
  /** The same rate across all topics. */
  overallRate: number;
  /** rate / overallRate; null when the topic has no eligible visits. */
  lift: number | null;
}

export function topicNegativeChangepointLift(
  attempts: readonly Attempt[],
  questions: readonly Question[],
  topics: readonly Topic[],
  changepoints: readonly Changepoint[],
): TopicLift[] {
  const eligibleByTopic = new Map<number, number>();
  let eligibleTotal = 0;
  for (const topic of topics) eligibleByTopic.set(topic.id, 0);

  for (const attempt of attempts) {
    for (const visit of attempt.path) {
      // A visit can only anchor a changepoint if something came before it.
      if (visit.pathIndex === 0) continue;
      const topicId = questionAt(questions, visit.questionNumber).topicId;
      eligibleByTopic.set(topicId, (eligibleByTopic.get(topicId) ?? 0) + 1);
      eligibleTotal += 1;
    }
  }

  const negativeByTopic = new Map<number, number>();
  let negativeTotal = 0;
  for (const changepoint of changepoints) {
    if (!changepoint.isNegative) continue;
    negativeByTopic.set(changepoint.topicId, (negativeByTopic.get(changepoint.topicId) ?? 0) + 1);
    negativeTotal += 1;
  }

  const overallRate = eligibleTotal > 0 ? negativeTotal / eligibleTotal : 0;

  return topics
    .map((topic) => {
      const eligibleVisits = eligibleByTopic.get(topic.id) ?? 0;
      const negativeChangepoints = negativeByTopic.get(topic.id) ?? 0;
      const rate = eligibleVisits > 0 ? negativeChangepoints / eligibleVisits : 0;
      return {
        topicId: topic.id,
        label: topic.label,
        isTrigger: topic.isTrigger,
        difficultyWeight: topic.difficultyWeight,
        eligibleVisits,
        negativeChangepoints,
        rate,
        overallRate,
        lift: eligibleVisits === 0 || overallRate === 0 ? null : rate / overallRate,
      };
    })
    .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0));
}
