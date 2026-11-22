import type { ParsedWorkout, WorkloadBreakdown } from '../../src/types';
import type { StoryExerciseResult } from '../../src/components/logging/story/types';
import { boardResults, type BoardAthlete } from '../../src/components/tellWodi/boardResults';
import { openSlots, applyAnswer, nextQuestion, EMPTY_ANSWER, type ChatSlot, type SlotAnswer } from '../../src/components/tellWodi/chatQuestions';
import { buildSavedWorkoutTotals, sessionPartnerScope } from '../../src/services/savedWorkout';

/**
 * An athlete who did the board AS WRITTEN, played through the app's own chat and save.
 *
 * One owner for the corpus (scripts/check-wod.ts) and the save test (src/corpusSave.test.ts): the
 * totals a board is checked against are the totals the app would store, never a second calculator's.
 */

export const ATHLETE: BoardAthlete = { sex: 'male', weightUnit: 'kg' };

/** The answer an athlete who did the board as written gives to each question. */
export function asWritten(slot: ChatSlot): SlotAnswer | null {
  const answer = (fields: Partial<SlotAnswer>): SlotAnswer => ({ id: slot.id, ...EMPTY_ANSWER, ...fields });
  switch (slot.kind) {
    case 'time': return answer({ seconds: slot.cap ?? 1200 });
    case 'rounds': return answer({ count: 5 });
    case 'reps': return answer({ count: 20 });
    case 'distance': return answer({ count: 1000 });
    case 'duration': return answer({ seconds: 60 });
    case 'weight': return answer({ weight: 50 });
    case 'maxset': return answer({ count: 10, weight: 50 });
    // A range or a pair offers the board's own numbers; as written is the middle of them.
    case 'count': return answer({ count: slot.picks?.length ? slot.picks[Math.floor((slot.picks.length - 1) / 2)] : 10 });
    case 'ladder': return slot.rungs?.[2] ? answer({ count: slot.rungs[2] }) : null;
    case 'partial': return slot.options?.[0] ? answer({ choice: slot.options[0] }) : null;
    case 'choice': return slot.options?.[0] ? answer({ choice: slot.options[0] }) : null;
    case 'unit': return answer({ unit: 'kg' });
    default: return null;
  }
}

/**
 * The chat, played to the end by an athlete who did the board as written. `asked` hears each
 * question card as the athlete would see it — what the decisions snapshot records.
 */
export function logAsWritten(
  parsed: ParsedWorkout,
  asked?: (text: string) => void,
  answerFor: (slot: ChatSlot) => SlotAnswer | null = asWritten,
): StoryExerciseResult[] {
  let results = boardResults(parsed, ATHLETE);
  const closed = new Set<string>();
  for (let guard = 0; guard < 60; guard += 1) {
    const slots = openSlots(results, closed, new Map(), parsed.teamSize);
    const question = nextQuestion(slots, results);
    if (!question) break;
    asked?.(question.text);
    // One card can answer several slots at once (a lift's start, peak and max set).
    for (const id of question.slotIds) {
      const slot = slots.find((s) => s.id === id);
      if (!slot) continue;
      const answer = answerFor(slot);
      closed.add(slot.id);
      if (answer) results = applyAnswer(results, slot, answer).results;
    }
    // A card that names no open slot would be asked forever.
    if (!question.slotIds.some((id) => closed.has(id))) throw new Error(`"${question.text}" answers nothing`);
  }
  return results;
}

/** What the app stores for an athlete who logged the board as written. */
export function savedAsWrittenTotals(parsed: ParsedWorkout, results: StoryExerciseResult[] = logAsWritten(parsed)): WorkloadBreakdown {
  return buildSavedWorkoutTotals(parsed, results, sessionPartnerScope(parsed).partnerFactor, ATHLETE.sex).breakdownFromResults;
}
