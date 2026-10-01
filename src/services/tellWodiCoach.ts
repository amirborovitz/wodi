import { openaiClient, PARSE_MODEL, PARSE_REASONING_EFFORT } from './openai';
import type { LoadSuggestion } from '../components/tellWodi/loadSuggestions';
import type { LoggedLoad } from '../utils/lastLoadHistory';
import type { WodiNote } from '../types';
import { notesForPrompt } from './wodiAgent/athleteNotes';

/**
 * Wodi's answer to "which weight should I use?" before a workout.
 *
 * The facts are the app's: the board, the athlete's own logged loads (saved breakdowns only), the
 * Rx. The judgement — what those facts suggest for THIS piece, at this rep count, on this clock — is
 * the model's, and it may reason from nothing else: no invented history, no invented maxes. With no
 * history to go on it says so and works from the board's Rx.
 */

export interface WeightAdviceInput {
  boardText: string;
  question: string;
  sex?: string;
  movements: LoadSuggestion[];
  history: LoggedLoad[];
  /** What they've asked Wodi to remember — a sore shoulder changes the advice. */
  notes: readonly WodiNote[];
}

const PROMPT = `You are Wodi, a friendly CrossFit coach-buddy. The athlete is about to do the workout on
the board and asked about weights. Answer like a good coach texting back: short, warm, specific.

Rules:
- For EACH loaded movement, suggest one weight (or a tight range) and give the reason in a few words.
- Reason ONLY from the numbers given: the board's Rx, and the athlete's logged loads. Never invent a
  past lift, a max or a percentage of a max you weren't given.
- Use related lifts sensibly: a hang power clean or a clean & jerk load tells you about a power clean;
  a heavy strength-day single is heavier than what you'd cycle for many reps on a clock.
- Consider the piece: reps per round, rounds, time cap. Touch-and-go reps under fatigue → lighter
  than a strength-day load.
- If there's no history for a movement, say so plainly and anchor on the Rx for their sex (female =
  the lighter number when the board writes two), with a scaled option.
- Respect what they've asked you to remember (an injury, the kit they have): a recent niggle changes the
  suggestion for the movements it touches — say so in a few words.
- Never compare them to anyone else. No lectures, no safety boilerplate.
- Plain text, max 4 short lines. One line per movement is ideal. No markdown, no bullet symbols.`;

const fmtDate = (d: Date): string => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export async function adviseWeights(input: WeightAdviceInput): Promise<string> {
  const movements = input.movements.map((m) => ({
    movement: m.movement,
    board_rx: m.rx ?? null,
    last_time_same_lift: m.last ? `${m.last.load} on ${fmtDate(m.last.date)}` : null,
    related_lifts: m.related.map((r) => `${r.movement} ${r.load} on ${fmtDate(r.date)}`),
  }));
  const history = input.history.map((h) => `${h.movement}: ${h.load} (${fmtDate(h.date)})`);

  const response = await openaiClient.chat.completions.create({
    model: PARSE_MODEL,
    reasoning_effort: PARSE_REASONING_EFFORT,
    temperature: 0.3,
    max_completion_tokens: 400,
    messages: [
      { role: 'system', content: PROMPT },
      {
        role: 'user',
        content: [
          `THE BOARD:\n${input.boardText.trim()}`,
          `ATHLETE: ${input.sex === 'female' ? 'female' : input.sex === 'male' ? 'male' : 'not specified'}`,
          `LOADED MOVEMENTS TODAY:\n${JSON.stringify(movements, null, 2)}`,
          `ALL THEIR RECENT LOGGED LOADS (newest first):\n${history.length ? history.join('\n') : '(none logged yet)'}`,
          `WHAT THEY'VE ASKED YOU TO REMEMBER:\n${notesForPrompt(input.notes)}`,
          `THEIR QUESTION:\n${input.question || 'What weights should I use?'}`,
        ].join('\n\n'),
      },
    ],
  });
  return response.choices[0]?.message?.content?.trim() ?? '';
}
