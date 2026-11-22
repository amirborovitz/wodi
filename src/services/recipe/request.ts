/**
 * The words sent to the AI to read one part as a recipe — the one builder, so the app and the
 * corpus recorder ask exactly the same question.
 */

import { RECIPE_PROMPT } from './prompt';
import type { TotalsDisagreement } from './totals';

export type RequestText = { type: 'text'; text: string };

export interface RecipeContext {
  /** A correction from the athlete; it outranks the board. */
  athleteNote?: string;
  /** The session's own name, which can say what no line of the part does ("PARTNER WOD"). */
  sessionTitle?: string;
}

/** Lead-in before the part's text. The corpus replay keys on what follows it. */
export const RECIPE_TEXT_LEAD = 'Here is the part:\n\n';

/** Opens the second reading of a part whose totals did not add up. */
export const RECHECK_LEAD = 'Your previous reading of this part did not add up';

// Athlete-supplied context/correction. It outranks the board text: the athlete may state facts
// that were never written down (the coach said "grab a partner" out loud).
export function athleteContextBlock(note: string): RequestText {
  return {
    type: 'text',
    text: 'ATHLETE CONTEXT — the athlete who did this workout added the note below. '
      + 'It is authoritative: it comes from the athlete directly and may state facts that are '
      + 'NOT written in the workout text (e.g. that it was a partner workout, the real time cap, '
      + 'a movement the text got wrong). Apply it even where it contradicts the text.\n\n'
      + note,
  };
}

function recheckBlock(disagreements: TotalsDisagreement[]): RequestText {
  const lines = disagreements.map((d) => `- ${d.movement}${d.side ? ` (${d.side})` : ''}: your total says ${d.stated}, `
    + `but your recipe multiplies out to ${d.fromRecipe ?? 'nothing'}.`);
  return {
    type: 'text',
    text: `${RECHECK_LEAD}:\n${lines.join('\n')}\n`
      + 'Read the part again. Make the recipe say exactly what the board says, and the totals what that recipe adds up to.',
  };
}

export function recipeRequestParts(text: string, context: RecipeContext, recheck?: TotalsDisagreement[]): RequestText[] {
  return [
    { type: 'text', text: RECIPE_PROMPT },
    ...(context.sessionTitle ? [{ type: 'text' as const, text: `The session this part belongs to is titled: ${context.sessionTitle}` }] : []),
    { type: 'text', text: `${RECIPE_TEXT_LEAD}${text}` },
    ...(context.athleteNote ? [athleteContextBlock(context.athleteNote)] : []),
    ...(recheck ? [recheckBlock(recheck)] : []),
  ];
}
