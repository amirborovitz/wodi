import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { openaiClient, PARSE_MODEL, PARSE_REASONING_EFFORT } from '../openai';
import type { ChatTurn } from '../tellWodiReader';
import { findWorkouts, personalRecords, trainingTotals, type FoundWorkout, type TrainingContext } from './trainingFacts';
import { toIsoDate } from '../../utils/workoutDate';
import { swapHabits } from './athleteHabits';
import { notesForPrompt } from './athleteNotes';
import type { WodiNote } from '../../types';

/**
 * Ask Wodi — the athlete texts a question about their own training and Wodi answers it.
 *
 * The model decides WHAT to look up and how to say it; the app owns every number. It can reach
 * the athlete's log only through the tools below, which read the same saved data the Gallery,
 * Records and recap read (trainingFacts.ts). It may compare numbers the tools returned; it may
 * never produce one they didn't.
 *
 * A message that is a workout rather than a question ("Fran 5:40", a pasted board) isn't answered
 * here: the model calls `log_workout` and the chat hands the words to the same board reading the
 * forms use. Which of the two a message is, is the model's call — there is no keyword list.
 */

export type AskWodiReply =
  /** `proposedNote`: something lasting they said, for the chat to OFFER to remember — never saved here. */
  /** `receipts`: ids of the workouts the answer quotes, so the chat can attach their posters. */
  | { kind: 'answer'; text: string; proposedNote: string | null; receipts: string[] }
  | { kind: 'log' };

/** One model turn. Injectable so the loop can be tested without the network. */
export type CompleteFn = (
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
  mustAnswer: boolean,
) => Promise<ChatCompletionMessage>;

const MAX_LOOKUPS = 4;

const nullableString = { type: ['string', 'null'] };
const dateField = { type: ['string', 'null'], description: 'YYYY-MM-DD, the day trained; null = open-ended.' };

const tool = (name: string, description: string, properties: Record<string, unknown>): ChatCompletionTool => ({
  type: 'function',
  function: {
    name,
    description,
    strict: true,
    parameters: { type: 'object', additionalProperties: false, required: Object.keys(properties), properties },
  },
});

export const TOOLS: ChatCompletionTool[] = [
  tool('find_workouts', 'The athlete\'s logged workouts, newest first, with what they actually did (weights, reps, time) and the board\'s prescription. Filter by dates, a movement, or the workout\'s name.', {
    from: dateField,
    to: dateField,
    movement: { ...nullableString, description: 'A movement, e.g. "deadlift", "wall ball". Only sessions with it are returned, showing only it.' },
    title: { ...nullableString, description: 'Part of the workout\'s name, e.g. "Fran".' },
    limit: { type: ['integer', 'null'], description: 'Max workouts to return (default 10, max 25).' },
  }),
  tool('personal_records', 'The athlete\'s records — heaviest lifts and best named-benchmark times — with the history that moved each one. Exactly what the Records screen shows.', {
    movement: { ...nullableString, description: 'One lift or benchmark; null for all of them.' },
  }),
  tool('training_totals', 'How much they trained over a period: workout count, EP, volume, reps, distance, calories, and the days trained.', {
    from: dateField,
    to: dateField,
  }),
  tool('athlete_habits', 'What the athlete usually does instead of what the board says — swaps they make most times ("Run → Echo Bike", "Double Unders → Single Unders"), with how often, over their recent sessions.', {}),
  tool('propose_note', 'They told you something lasting about themselves that should shape future advice — an injury or niggle, a goal or event, the kit they have at home, how they like to train or be talked to. Propose ONE short note in the third person ("Left shoulder sore — avoiding overhead"). The athlete is asked to confirm it; it is not saved yet, so never say it is.', {
    text: { type: 'string' },
  }),
  tool('log_workout', 'The athlete\'s message is a workout to log — a board, or what they did ("Fran 5:40", "did the ladder, 22 min") — not a question. Call this and nothing else.', {}),
];

function systemPrompt(now: Date, notes: readonly WodiNote[]): string {
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  return `You are Wodi, the athlete's CrossFit buddy, texting with them. Today is ${weekday} ${toIsoDate(now)}. Weeks start on Monday.

If their message is a workout to log rather than a question, call log_workout and nothing else.

Otherwise answer from their own training log, which you can only see through the tools:
- Every number about THEIR training — a weight, a time, a date, a count, EP, a record — must come from a tool result. Never invent one, never estimate one, never do your own EP or volume maths; training_totals has it. Comparing two numbers the tools gave you is fine ("up 20kg since August").
- Look things up before answering. If the tools come back empty, say plainly that you don't see it in their log — don't fill the gap.
- Turn "last month", "this week", "since summer" into dates yourself.
- Weights are per implement; "implementCount: 2" means one in each hand.
- You may give a coach's opinion (what to try next, what the numbers suggest), grounded in what you found.

What they've told you to remember (confirmed by them — use it, and never re-propose what's already here):
${notesForPrompt(notes)}

How you text: warm, short, specific — like a friend at the gym. At most 4 short lines. Plain text, no markdown, no bullet symbols. Dates like "24 Sep". Never compare them with anyone else, no lectures, no safety boilerplate.`;
}

function runTool(name: string, rawArgs: string, ctx: TrainingContext): unknown {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || '{}') as Record<string, unknown>;
  } catch {
    return { error: 'arguments were not valid JSON' };
  }
  const str = (key: string): string | null => (typeof args[key] === 'string' && args[key] ? args[key] as string : null);
  const range = { from: str('from'), to: str('to') };
  switch (name) {
    case 'find_workouts':
      return findWorkouts(ctx, {
        ...range,
        movement: str('movement'),
        title: str('title'),
        limit: typeof args.limit === 'number' ? args.limit : null,
      });
    case 'personal_records':
      return personalRecords(ctx, { movement: str('movement') });
    case 'training_totals':
      return trainingTotals(ctx, range);
    case 'athlete_habits':
      return [...swapHabits(ctx.workouts).values()];
    default:
      return { error: `no tool called ${name}` };
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_RECEIPTS = 3;

/**
 * Which looked-up workouts the answer is quoting: one it names by its date ("24 Sep" — the
 * prompt's date style) or by its title. Read off the words, against what the tools returned —
 * the model can't attach a poster it never looked up.
 */
export function receiptsFor(answer: string, found: readonly FoundWorkout[]): string[] {
  const text = answer.toLowerCase();
  const hits: { id: string; at: number }[] = [];
  for (const w of found) {
    const [, m, d] = w.date.split('-').map(Number);
    const day = m && d ? `${d} ${MONTHS[m - 1]}`.toLowerCase() : '';
    const dayAt = day ? text.search(new RegExp(`(^|\\D)${day}\\b`)) : -1;
    const title = w.title.trim().toLowerCase();
    const titleAt = title.length > 3 && title !== 'workout' ? text.indexOf(title) : -1;
    const at = [dayAt, titleAt].filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (at !== undefined && !hits.some((h) => h.id === w.id)) hits.push({ id: w.id, at });
  }
  return hits.sort((a, b) => a.at - b.at).slice(0, MAX_RECEIPTS).map((h) => h.id);
}

function readNoteText(rawArgs: string): string | null {
  try {
    const { text } = JSON.parse(rawArgs || '{}') as { text?: unknown };
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

const defaultComplete: CompleteFn = async (messages, tools, mustAnswer) => {
  const response = await openaiClient.chat.completions.create({
    model: PARSE_MODEL,
    reasoning_effort: PARSE_REASONING_EFFORT,
    temperature: 0.3,
    max_completion_tokens: 600,
    messages,
    tools,
    tool_choice: mustAnswer ? 'none' : 'auto',
  });
  const message = response.choices[0]?.message;
  if (!message) throw new Error('Ask Wodi: empty response');
  return message;
};

export async function askWodi(input: {
  message: string;
  recent: ChatTurn[];
  /** Loaded when first needed — most messages are workouts and never touch the log. */
  loadContext: () => Promise<TrainingContext>;
  /** Their confirmed notes — small and already in memory, so always in the prompt. */
  notes: readonly WodiNote[];
  now?: Date;
  complete?: CompleteFn;
}): Promise<AskWodiReply> {
  const { message, recent, loadContext, notes, now = new Date(), complete = defaultComplete } = input;
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt(now, notes) },
    ...recent.map((turn): ChatCompletionMessageParam => (
      turn.from === 'wodi' ? { role: 'assistant', content: turn.text } : { role: 'user', content: turn.text }
    )),
    { role: 'user', content: message },
  ];

  let ctx: TrainingContext | null = null;
  let proposedNote: string | null = null;
  const found: FoundWorkout[] = [];
  for (let step = 0; ; step += 1) {
    // After MAX_LOOKUPS rounds of looking things up, it answers with what it has.
    const mustAnswer = step === MAX_LOOKUPS;
    const reply = await complete(messages, TOOLS, mustAnswer);
    const calls = mustAnswer ? [] : (reply.tool_calls ?? []).filter((call) => call.type === 'function');
    if (calls.length === 0) {
      const text = reply.content?.trim() ?? '';
      return { kind: 'answer', text, proposedNote, receipts: receiptsFor(text, found) };
    }
    if (calls.some((call) => call.function.name === 'log_workout')) return { kind: 'log' };

    messages.push({ role: 'assistant', content: reply.content ?? null, tool_calls: calls });
    for (const call of calls) {
      let result: unknown;
      if (call.function.name === 'propose_note') {
        proposedNote = readNoteText(call.function.arguments) ?? proposedNote;
        result = { status: 'The athlete will be asked to confirm. Not saved yet.' };
      } else {
        ctx ??= await loadContext();
        result = runTool(call.function.name, call.function.arguments, ctx);
        if (call.function.name === 'find_workouts') found.push(...(result as { workouts: FoundWorkout[] }).workouts);
      }
      console.info('[AskWodi]', call.function.name, call.function.arguments);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
}
