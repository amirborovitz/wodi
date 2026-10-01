import { openaiClient, PARSE_MODEL, PARSE_REASONING_EFFORT } from './openai';
import type { PosterVibeKey, WodiNote } from '../types';
import { notesForPrompt } from './wodiAgent/athleteNotes';
import type { ChatSlot, SlotAnswer } from '../components/tellWodi/chatQuestions';

/**
 * Reads one chat message from the athlete against the questions the app still has open.
 *
 * The model does LANGUAGE only. It is handed the list of open slots (built by the app from the
 * workout — see chatQuestions.ts) and may answer those ids and nothing else: it cannot add a
 * movement, change the board, or invent a field. Anything the athlete didn't say stays null, and
 * the app asks for it — a blank is an answer, never a guess.
 *
 * It also writes Wodi's short reaction, which is what makes the chat feel like a person, and maps
 * how the athlete said it felt onto the poster's FELT vibe.
 */

export interface ChatReading {
  reaction: string;
  /** They haven't done it yet — they're asking ahead of the workout, not reporting on it. */
  beforeWorkout: boolean;
  vibe: PosterVibeKey | null;
  answers: SlotAnswer[];
  /** Something lasting they said about themselves, for the chat to OFFER to remember. Never saved here. */
  remember: string | null;
}

export interface ChatTurn {
  from: 'wodi' | 'me';
  text: string;
}

const VIBES: PosterVibeKey[] = ['chill', 'solid', 'sweaty', 'cooked', 'smoked', 'wrecked'];

const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };

const READING_SCHEMA = {
  name: 'tell_wodi_reading',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['reaction', 'beforeWorkout', 'vibe', 'answers', 'remember'],
    properties: {
      reaction: { type: 'string' },
      beforeWorkout: { type: 'boolean' },
      vibe: { anyOf: [{ type: 'string', enum: VIBES }, { type: 'null' }] },
      remember: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      answers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'skipped', 'seconds', 'count', 'extraReps', 'weight', 'weightEnd', 'choice', 'swapTo', 'swapAmount'],
          properties: {
            id: { type: 'string' },
            skipped: { type: 'boolean' },
            seconds: nullableNumber,
            count: nullableNumber,
            extraReps: nullableNumber,
            weight: nullableNumber,
            weightEnd: nullableNumber,
            choice: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            swapTo: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            swapAmount: nullableNumber,
          },
        },
      },
    },
  },
} as const;

const PROMPT = `You are Wodi, a CrossFit buddy who turns an athlete's workout into a poster. The athlete
just finished a workout and is texting you about it. Your job has two parts.

1. READ their message against the OPEN QUESTIONS listed below and answer the ones their message
   actually answers. Return one entry per question you can answer, using its exact id.
   - Only answer what they SAID. Never guess, never fill a question from the board's prescription,
     never assume they did it as written. If they didn't say it, leave that question out.
   - "time": seconds. "22 min" = 1320, "18:45" = 1125, "under 20" is not an answer.
   - "rounds": count = full rounds, extraReps = extra reps ("7 rounds + 12" → count 7, extraReps 12).
   - "reps", "distance" (metres), "sets": count.
   - "duration": seconds.
   - "weight": the load in the question's unit. A build like "deadlift 100 105 110" or "40-60" is
     weight = first, weightEnd = last. "same dumbbell for both", "17.5 for everything" answers every
     open weight question it covers. "Rx" / "as prescribed" is NOT a number — don't answer it.
   - "choice": copy one of the question's options exactly. "singles" picks the singles option.
   - "score": whichever fits — seconds, count, or weight.
   - "swap": they did a DIFFERENT movement instead of this one ("switched the run to echo bike",
     "did singles instead", "rowed instead of running"). swapTo = what they did, in plain words
     ("Echo Bike"). swapAmount = how much of it for ONE occurrence, in that movement's own unit
     (metres, calories or reps), ONLY if they said it ("600m on the bike" → 600); otherwise null.
     Only answer the swap question of the movement they replaced.
     A swap question with "usually" was ASKED ("Echo Bike again instead of the Run?"): "yes",
     "same", "as usual" → swapTo = the "usually" value; "no, I ran" / did it as written →
     skipped = true.
   - A choice question with "usually": "yes" / "same as always" picks the "usually" option.
   - If they say they don't know / didn't track / want to skip a question, answer it with
     skipped = true.
   - Every field you don't use is null.

2. REACT like a friend at the gym would — one short line, max 8 words, warm and a little playful.
   Match their energy ("almost died" → something like "Brutal one. Respect."). Never compare them to
   anyone, never judge the score, never coach. No emojis unless they used one. If the message is
   just an answer ("singles"), a tiny acknowledgement is enough ("Got it.").

Set "beforeWorkout" to true ONLY when the message makes clear they haven't done the workout yet —
they're heading in, asking what weight to use, planning ("what should I go with today?", "about to
do this", "later tonight"). Reporting anything they did ("22 min", "singles", "it was brutal") is
false. When it's true, answer no questions and react like a friend wishing them luck.

Also set "vibe" if they said how it felt, mapping to the closest of:
chill (easy, relaxed) · solid (good, strong) · sweaty (worked hard) · cooked (tired, spent) ·
smoked (really hard) · wrecked (destroyed, "almost died"). Otherwise null.

Set "remember" ONLY when they tell you something lasting about themselves that should shape future
workouts — an injury or niggle ("my shoulder's been bad"), a goal or event, the kit they have at home,
how they like to train. One short note in the third person ("Left shoulder sore — avoiding overhead").
Today's numbers, how today felt, and anything already in WHAT THEY'VE ASKED YOU TO REMEMBER are never
a note. Otherwise null. They'll be asked to confirm it.`;

export async function readAthleteMessage(input: {
  boardText: string;
  slots: ChatSlot[];
  recent: ChatTurn[];
  message: string;
  /** Their confirmed notes, so a note already kept isn't offered again. */
  notes: readonly WodiNote[];
}): Promise<ChatReading> {
  const questions = input.slots.map((s) => ({
    id: s.id,
    kind: s.kind,
    about: s.subject,
    ...(s.movementNames ? { movements: s.movementNames } : {}),
    ...(s.options ? { options: s.options } : {}),
    ...(s.unit ? { unit: s.unit } : {}),
    ...(s.usually ? { usually: s.usually } : {}),
  }));
  const conversation = input.recent
    .map((t) => `${t.from === 'wodi' ? 'Wodi' : 'Athlete'}: ${t.text}`)
    .join('\n');

  const response = await openaiClient.chat.completions.create({
    model: PARSE_MODEL,
    reasoning_effort: PARSE_REASONING_EFFORT,
    temperature: 0,
    max_completion_tokens: 1200,
    messages: [
      { role: 'system', content: PROMPT },
      {
        role: 'user',
        content: [
          `THE BOARD:\n${input.boardText.trim() || '(no board text)'}`,
          `OPEN QUESTIONS:\n${JSON.stringify(questions, null, 2)}`,
          conversation ? `CONVERSATION SO FAR:\n${conversation}` : '',
          `WHAT THEY'VE ASKED YOU TO REMEMBER:\n${notesForPrompt(input.notes)}`,
          `THE ATHLETE'S NEW MESSAGE:\n${input.message}`,
        ].filter(Boolean).join('\n\n'),
      },
    ],
    response_format: { type: 'json_schema', json_schema: READING_SCHEMA },
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  console.info('[TellWodi] reading', raw);
  const data = JSON.parse(raw) as Partial<ChatReading>;
  const known = new Set(input.slots.map((s) => s.id));
  return {
    reaction: typeof data.reaction === 'string' ? data.reaction.trim() : '',
    beforeWorkout: data.beforeWorkout === true,
    vibe: data.vibe && VIBES.includes(data.vibe) ? data.vibe : null,
    // Only ids the app asked about — the model answering a question nobody asked is dropped.
    answers: (data.answers ?? []).filter((a): a is SlotAnswer => !!a && known.has(a.id)),
    remember: typeof data.remember === 'string' && data.remember.trim() ? data.remember.trim() : null,
  };
}
