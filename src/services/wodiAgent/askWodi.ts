import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { PARSE_MODEL, PARSE_REASONING_EFFORT } from '../openai';
import { modelClient } from '../modelClient';
import type { ChatTurn } from '../tellWodiReader';
import { findWorkouts, personalRecords, trainingTotals, type FoundWorkout, type TrainingContext } from './trainingFacts';
import { toIsoDate } from '../../utils/workoutDate';
import { swapHabits } from './athleteHabits';
import { notesForPrompt } from './athleteNotes';
import { recentLoadLines, RECENT_DAYS } from './recentLoad';
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
 *
 * It is the chat's one brain (docs/plans/2026-11-05-wodi-assistant.md). Besides answering, it can
 * write the athlete a workout (`create_workout`); the app then reads it like any board, so it logs
 * and gets a poster like a coach's. And it says plainly what it can't do yet, recording the request
 * (`note_gap`), so what people actually ask decides what Wodi learns next.
 */

/**
 * A workout they're about to do — the board, and the app's own lookup of their loads on its
 * movements. With one, the answer is a game plan for it: a target and pacing reasoned from their
 * past results on similar work, and a weight per loaded movement.
 */
export interface UpcomingWorkout {
  board: string;
  /** The app's reading of the board — its parts, clocks, windows, open stations (boardReading.ts). */
  reading: string;
  /** Their logged loads on the board's movements, in words (the chat's load card). Empty = none. */
  loads: string;
  sex?: string;
}

/** What Wodi knows about the athlete's body from their profile. */
export interface AthleteBody {
  /** Kilograms, as the profile stores it. Null = not in their profile. */
  bodyweightKg: number | null;
  /** How they read weights. */
  weightUnit: 'kg' | 'lb';
}

export type AskWodiReply =
  /** `proposedNote`: something lasting they said, for the chat to OFFER to remember — never saved here. */
  /** `receipts`: ids of the workouts the answer quotes, so the chat can attach their posters. */
  /** `gap`: something they asked for that Wodi can't do yet, for the chat to record (agentGaps). */
  /** `bodyweightKg`: they told Wodi their body weight — for the chat to write to their profile. */
  | { kind: 'answer'; text: string; proposedNote: string | null; receipts: string[]; gap: string | null; bodyweightKg: number | null }
  | { kind: 'log' }
  /** A workout Wodi wrote for them: the board in whiteboard words, and one line on why this one. */
  | { kind: 'workout'; board: string; why: string; gap: string | null };

/** Where the athlete is when they ask. It decides which tools make sense. */
export type AskSituation =
  /** No board open: anything goes. A question, a workout to log, a workout to write. */
  | { kind: 'between' }
  /** Mid-log, an aside ("what did I squat last time?"): answered, then the logging carries on. */
  | { kind: 'logging'; board: string }
  /** Heading into this workout: the answer is its game plan. */
  | { kind: 'upcoming'; workout: UpcomingWorkout };

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
  tool('save_body_weight', 'They told you their own current body weight — often answering your question ("70", "I\'m 154 lb"). Saves it to their profile, where all your advice reads it from. Only their body weight, said by them: never a lift, a kettlebell, or a guess.', {
    value: { type: 'number' },
    unit: { type: 'string', enum: ['kg', 'lb'], description: 'The unit they said; when they gave a bare number, their usual unit.' },
  }),
  tool('log_workout', 'The athlete\'s message is a workout to log — a board, or what they did ("Fran 5:40", "did the ladder, 22 min") — not a question. Call this and nothing else.', {}),
  tool('create_workout', 'They asked you for a workout to do ("give me an open gym WOD", "20 min, dumbbells only", "something for my weak spot"). Look at their recent training first, then write ONE session the way a coach writes a whiteboard. It is shown to them as their board; they can take it or ask for another. Calling this ends your turn.', {
    board: { type: 'string', description: 'The whiteboard: a title on the first line, then each part with its clock ("AMRAP 15:", "For time, 20 min cap:", "EMOM 12:", "5x5 heavy") and its movements with reps; loads only as a standard Rx male/female pair ("22.5/15kg"). Plain lines, no markdown.' },
    why: { type: 'string', description: 'One short sentence on why this one, from what you found ("No pulling since Monday, and your squat has been 100kg twice"). Numbers only from the tools.' },
  }),
  tool('note_gap', 'They asked for something you can\'t do yet (set a reminder, plan several days, change a past log, change a setting, anything outside training). Record it in a few words, then still answer them.', {
    request: { type: 'string' },
  }),
];

/** What a game plan is made of — only when there's a workout ahead of them. */
function upcomingSection(upcoming: UpcomingWorkout, recent: readonly string[]): string {
  const sex = upcoming.sex === 'female' ? 'female' : upcoming.sex === 'male' ? 'male' : 'not specified';
  return `

They are about to do this workout — they haven't done it yet:
"""
${upcoming.board.trim()}
"""
How the app read it — trust this for the structure (the parts, the clock, the windows, which work is open-ended) over your own reading of the text above:
${upcoming.reading.trim() || '(not read — work from the text)'}
Athlete: ${sex} (female = the lighter number when the board writes two).
Their logged loads on its movements, looked up by the app: ${upcoming.loads.trim() || '(none logged)'}
What they trained in the last ${RECENT_DAYS} days, from their log (newest first):
${recent.length ? recent.map((line) => `- ${line}`).join('\n') : '(nothing — they come in fresh)'}

Answer what they asked, like a coach who knows their log. Asked for a game plan (or nothing specific), give the whole plan; asked one thing ("which weight?", "how should I pace it?"), answer that thing first and fully.
- First look up their past workouts with the same movements (find_workouts by movement — a few calls is fine). Note what they swapped (insteadOf) — that's what they'll likely do again.
- The board's totals are yours to count: "6 rounds of 20 lunges" is 120 lunges. Say the totals that decide the plan — they are what make a weight heavy.
- A weight for each loaded movement, as a coach would pick it, in three: the one to start with, one for a tired day, one for a strong day — one line per movement ("- **Goblet lunges:** 16 kg · tired 12 · strong 20"). Kettlebells and dumbbells step by the next bell or pair; a barbell by about 5–10%. Reason it from their own log — the heaviest they've used on that movement or a close one, and how many reps it was for — against this board's total reps and what else is in it. Name the day you anchored on, so its poster comes with the answer. With nothing close in their log, start from the board's Rx (and their body weight, if you know it), say plainly it's a starting point, and give the sign that it's right ("swings unbroken, lunges in no more than two sets").
- Fatigue decides the one to start with. Read the last ${RECENT_DAYS} days above: the same body areas worked yesterday or the day before, a long session, or heavy loads on the same lifts mean they start nearer the tired weight — say so in a few words and name the day ("legs from yesterday's squats — start at 16"). Fresh, or other areas worked, and they start at the plain weight. If they said how they feel ("I'm wrecked", "feeling strong"), that outranks the log: lead with that weight.
- The ceiling on any weight you name — the strong weight too, checked before you say it: look up their record on that lift (personal_records) and what they've used on it (find_workouts). Never at or above their record for anything but a single. For work done for reps or under a clock, stay well under it — the more total reps and the longer the piece, the further under. Never above the board's Rx unless their log shows them doing more on that movement. A barbell lift with no record and nothing logged: give no number — say to build to a weight they can move for the reps unbroken, and ask what they've done on it.
- A target for each part, in the units that part is scored in: a finish time (a range no wider than 10 minutes, tighter when their log is close) for work done for time; rounds + reps for an AMRAP; for open-ended work inside a window (max reps or calories in each interval or station), a number to aim for at each station in each window ("box jumps: 12–14 every 1:15", "echo bike: 14–16 cal"). Never turn windows of open work into a round time to beat.
- Reason each target from their own numbers on the same movement — reps or calories in a window of similar length, a time on a similar piece — and name the day you anchored on. Only anchor on a piece of the same shape: a for-time result says nothing about an interval's windows.
- What they told you to remember shapes the plan: an injury is named where it matters ("with your lower back, don't go up if the swings start pulling on it").
- Where to hold back and where to push — one line.
- If nothing in their log is close enough, say so in a few words. Never make up a past time or a past weight.
This answer may run to 12 short lines, with a "- " line per movement.`;
}

/** Writing them a workout. Only between workouts. */
const CREATE_SECTION = `
If they ask you for a workout to do, call create_workout:
- First look at their last 10 days (find_workouts from 10 days ago) so it balances what they've done. Don't hand them heavy squats the day after heavy squats.
- Fit what they asked (time, equipment, focus) and what they told you to remember (injuries, kit at home).
- One session, written like a CrossFit coach's board. Loads only as a standard Rx pair ("22.5/15kg"), never a weight of your own for them: the app shows their logged loads beside the board.
- "why" is one short sentence grounded in what you found.`;

/** A question asked while they're logging a board. */
function loggingSection(board: string): string {
  return `

They're in the middle of logging this workout:
"""
${board.trim()}
"""
Their message is an aside, not an answer to the logging questions. Answer it in 1–2 short lines; the logging carries on after you.`;
}

/** Their body weight as their profile has it — or the one question worth asking for it. */
function bodySection(body: AthleteBody): string {
  if (body.bodyweightKg == null) {
    return `Their body weight: not in their profile. When an answer would be better for it (picking a weight, sizing a target), ask for it in one short question at the end of your answer ("What do you weigh? I'll keep it for next time."). Ask at most once in a conversation. When they tell you, call save_body_weight.`;
  }
  const shown = body.weightUnit === 'lb' ? `${Math.round(body.bodyweightKg * 2.20462)} lb` : `${Math.round(body.bodyweightKg * 10) / 10} kg`;
  return `Their body weight: ${shown} (their profile). They read weights in ${body.weightUnit}. If they tell you a new body weight, call save_body_weight.`;
}

function systemPrompt(now: Date, notes: readonly WodiNote[], situation: AskSituation, body: AthleteBody, recent: readonly string[]): string {
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  return `You are Wodi, the athlete's CrossFit buddy, texting with them. Today is ${weekday} ${toIsoDate(now)}. Weeks start on Monday.
${situation.kind === 'between' ? `
If their message is a workout to log rather than a question, call log_workout and nothing else.
${CREATE_SECTION}
` : ''}
What you can't do yet: set reminders, plan several days at once, change a past log, change settings, anything outside training. Asked for one of those, call note_gap, say so plainly in a few words, and offer the closest thing you can.

Answer from their own training log, which you can only see through the tools:
- Every number about what they HAVE done — a weight, a time, a date, a count, EP, a record — must come from a tool result. Never invent one, never estimate one, never do your own EP or volume maths on their log; training_totals has it. Comparing two numbers the tools gave you is fine ("up 20kg since August").
- A weight or a target you recommend for what they're ABOUT to do is advice, not a fact about their log — give it, and say what it's based on.
- Look things up before answering. If the tools come back empty, say plainly that you don't see it in their log — don't fill the gap.
- Turn "last month", "this week", "since summer" into dates yourself.
- Weights are per implement; "implementCount: 2" means one in each hand.
- You may give a coach's opinion (what to try next, what the numbers suggest), grounded in what you found.

What they've told you to remember (confirmed by them — use it, and never re-propose what's already here):
${notesForPrompt(notes)}

${bodySection(body)}

How you text: warm, short, specific — like a friend at the gym who tells the truth. At most 4 short lines unless told otherwise below. The chat shows two marks and nothing else: **bold** for the one or two things to take away, and a line starting "- " for a list item. No headings, no other markdown. Dates like "24 Sep". When you mention a workout, name its day ("yesterday, 3 Oct", "24 Sep") — that is how its poster gets attached to your answer. Never generic praise ("nice work", "great job"). Never compare them with anyone else, no lectures, no safety boilerplate.${situation.kind === 'upcoming' ? upcomingSection(situation.workout, recent) : situation.kind === 'logging' ? loggingSection(situation.board) : ''}`;
}

/**
 * Between workouts, every tool. With a board open (logging it or heading into it) the message is
 * never a new workout to log or to write: the open board stays the one board.
 */
function toolsFor(situation: AskSituation): ChatCompletionTool[] {
  if (situation.kind === 'between') return TOOLS;
  return TOOLS.filter((t) => t.type !== 'function' || (t.function.name !== 'log_workout' && t.function.name !== 'create_workout'));
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
export function receiptsFor(answer: string, found: readonly FoundWorkout[], now: Date = new Date()): string[] {
  const text = answer.toLowerCase();
  const hits: { id: string; at: number }[] = [];
  // "yesterday" / "today" name a day too — the way people ask for a workout back.
  const relative: Record<string, string> = {
    [toIsoDate(now)]: 'today',
    [toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))]: 'yesterday',
  };
  for (const w of found) {
    const [, m, d] = w.date.split('-').map(Number);
    const day = m && d ? `${d} ${MONTHS[m - 1]}`.toLowerCase() : '';
    const dayAt = day ? text.search(new RegExp(`(^|\\D)${day}\\b`)) : -1;
    const title = w.title.trim().toLowerCase();
    const titleAt = title.length > 3 && title !== 'workout' ? text.indexOf(title) : -1;
    const word = relative[w.date];
    const wordAt = word ? text.search(new RegExp(`\\b${word}\\b`)) : -1;
    const at = [dayAt, titleAt, wordAt].filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (at !== undefined && !hits.some((h) => h.id === w.id)) hits.push({ id: w.id, at });
  }
  return hits.sort((a, b) => a.at - b.at).slice(0, MAX_RECEIPTS).map((h) => h.id);
}

/** One string argument of a tool call, trimmed. Null when missing or empty. */
function readArg(rawArgs: string, key: string): string | null {
  try {
    const value = (JSON.parse(rawArgs || '{}') as Record<string, unknown>)[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

/**
 * One model turn. A coach's call before a workout — weights against a board's totals, a target from
 * their log — is worth thinking about, so `upcoming` reasons; everything else answers at once.
 * With reasoning on the model takes no temperature, and its thinking counts against the output cap.
 */
function completeFor(situation: AskSituation): CompleteFn {
  const thinks = situation.kind === 'upcoming';
  return async (messages, tools, mustAnswer) => {
    const response = await modelClient.chat.completions.create({
      model: PARSE_MODEL,
      ...(thinks
        ? { reasoning_effort: 'low' as const, max_completion_tokens: 4000 }
        : { reasoning_effort: PARSE_REASONING_EFFORT, temperature: 0.3, max_completion_tokens: 600 }),
      messages,
      tools,
      tool_choice: mustAnswer ? 'none' : 'auto',
    });
    const message = response.choices[0]?.message;
    if (!message) throw new Error('Ask Wodi: empty response');
    return message;
  };
}

/** A body weight anyone could have: anything else is a misread, and is asked again. */
const BODYWEIGHT_KG = { min: 30, max: 250 };

function readBodyweightKg(rawArgs: string): number | null {
  try {
    const { value, unit } = JSON.parse(rawArgs || '{}') as { value?: unknown; unit?: unknown };
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const kg = unit === 'lb' ? value / 2.20462 : value;
    return kg >= BODYWEIGHT_KG.min && kg <= BODYWEIGHT_KG.max ? Math.round(kg * 10) / 10 : null;
  } catch {
    return null;
  }
}

export async function askWodi(input: {
  message: string;
  recent: ChatTurn[];
  /** Loaded when first needed — most messages are workouts and never touch the log. */
  loadContext: () => Promise<TrainingContext>;
  /** Their confirmed notes — small and already in memory, so always in the prompt. */
  notes: readonly WodiNote[];
  /** Where they are: between workouts (the default), logging a board, or heading into one. */
  situation?: AskSituation;
  /** Their body weight from the profile. Omitted = not known. */
  body?: AthleteBody;
  now?: Date;
  complete?: CompleteFn;
}): Promise<AskWodiReply> {
  const { message, recent, loadContext, notes, situation = { kind: 'between' }, body = { bodyweightKg: null, weightUnit: 'kg' }, now = new Date() } = input;
  const complete = input.complete ?? completeFor(situation);
  const tools = toolsFor(situation);
  const offered = new Set(tools.flatMap((t) => (t.type === 'function' ? [t.function.name] : [])));
  // Before a workout, fatigue is part of the question: the last few days are read up front.
  let ctx: TrainingContext | null = situation.kind === 'upcoming' ? await loadContext().catch(() => null) : null;
  const recentDays = ctx ? recentLoadLines(ctx.workouts, now) : [];
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt(now, notes, situation, body, recentDays) },
    ...recent.map((turn): ChatCompletionMessageParam => (
      turn.from === 'wodi' ? { role: 'assistant', content: turn.text } : { role: 'user', content: turn.text }
    )),
    { role: 'user', content: message },
  ];

  let proposedNote: string | null = null;
  let gap: string | null = null;
  let bodyweightKg: number | null = null;
  const found: FoundWorkout[] = [];
  for (let step = 0; ; step += 1) {
    // After MAX_LOOKUPS rounds of looking things up, it answers with what it has.
    const mustAnswer = step === MAX_LOOKUPS;
    const reply = await complete(messages, tools, mustAnswer);
    const calls = mustAnswer ? [] : (reply.tool_calls ?? []).filter((call) => call.type === 'function');
    if (calls.length === 0) {
      const text = reply.content?.trim() ?? '';
      return { kind: 'answer', text, proposedNote, receipts: receiptsFor(text, found, now), gap, bodyweightKg };
    }
    // A tool it wasn't offered is never acted on: no workout logged or written over an open board.
    if (calls.some((call) => call.function.name === 'log_workout' && offered.has('log_workout'))) return { kind: 'log' };
    const created = calls.find((call) => call.function.name === 'create_workout' && offered.has('create_workout'));
    const board = created ? readArg(created.function.arguments, 'board') : null;
    if (created && board) return { kind: 'workout', board, why: readArg(created.function.arguments, 'why') ?? '', gap };

    messages.push({ role: 'assistant', content: reply.content ?? null, tool_calls: calls });
    for (const call of calls) {
      let result: unknown;
      if (call.function.name === 'propose_note') {
        proposedNote = readArg(call.function.arguments, 'text') ?? proposedNote;
        result = { status: 'The athlete will be asked to confirm. Not saved yet.' };
      } else if (call.function.name === 'save_body_weight') {
        const kg = readBodyweightKg(call.function.arguments);
        bodyweightKg = kg ?? bodyweightKg;
        result = kg != null
          ? { status: 'Saved to their profile. Say so in a few words (they can change it under Me), then answer with it.' }
          : { error: "That doesn't read as a body weight. Ask them again in a few words." };
      } else if (call.function.name === 'note_gap') {
        gap = readArg(call.function.arguments, 'request') ?? gap;
        result = { status: 'Noted. Now answer them: say plainly you can\'t do that yet, and offer the closest thing you can.' };
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
