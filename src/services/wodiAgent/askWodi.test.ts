import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletionMessage, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { Workout } from '../../types';
import { askWodi, receiptsFor, TOOLS, type CompleteFn } from './askWodi';
import type { TrainingContext } from './trainingFacts';

// The loop is tested against a scripted model — never the network.
vi.mock('../openai', () => ({ PARSE_MODEL: 'test', PARSE_REASONING_EFFORT: 'none' }));
vi.mock('../modelClient', () => ({ modelClient: {} }));

const DAY = new Date(2026, 8, 24);
const DEADLIFT_DAY: Workout = {
  id: 'w1',
  userId: 'u1',
  date: DAY,
  title: 'Deadlift day',
  type: 'strength',
  status: 'completed',
  exercises: [],
  workloadBreakdown: { movements: [{ name: 'Deadlift', totalReps: 15, weight: 140, unit: 'kg' }], grandTotalReps: 15, grandTotalVolume: 2100 },
  createdAt: DAY,
  updatedAt: DAY,
};
const CTX: TrainingContext = { workouts: [DEADLIFT_DAY], prs: [], bodyweight: 80 };

const said = (content: string): ChatCompletionMessage => ({ role: 'assistant', content, refusal: null });
const calls = (...list: { name: string; args?: object }[]): ChatCompletionMessage => ({
  role: 'assistant',
  content: null,
  refusal: null,
  tool_calls: list.map((c, i) => ({
    id: `call${i}`,
    type: 'function',
    function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
  })),
});

/** A model that plays its turns in order, recording what it was shown each time. */
function scripted(...turns: ChatCompletionMessage[]): { complete: CompleteFn; seen: { messages: ChatCompletionMessageParam[]; mustAnswer: boolean }[] } {
  const seen: { messages: ChatCompletionMessageParam[]; mustAnswer: boolean }[] = [];
  let i = 0;
  const complete: CompleteFn = async (messages, _tools, mustAnswer) => {
    seen.push({ messages: [...messages], mustAnswer });
    return turns[Math.min(i++, turns.length - 1)];
  };
  return { complete, seen };
}

describe('askWodi', () => {
  it('a workout is handed to logging, without reading the log', async () => {
    const loadContext = vi.fn(async () => CTX);
    const { complete } = scripted(calls({ name: 'log_workout' }));
    await expect(askWodi({ message: 'Fran 5:40', recent: [], notes: [], loadContext, complete })).resolves.toEqual({ kind: 'log' });
    expect(loadContext).not.toHaveBeenCalled();
  });

  it('a question is answered from what the tools returned', async () => {
    const { complete, seen } = scripted(
      calls({ name: 'find_workouts', args: { from: null, to: null, movement: 'deadlift', title: null, limit: null } }),
      said('140kg for 15 on 24 Sep.'),
    );
    const reply = await askWodi({ message: 'what did I deadlift last?', recent: [], notes: [], loadContext: async () => CTX, complete });
    expect(reply).toEqual({ kind: 'answer', text: '140kg for 15 on 24 Sep.', proposedNote: null, receipts: ['w1'], gap: null, bodyweightKg: null });

    const toolResult = seen[1].messages.find((m) => m.role === 'tool');
    expect(JSON.parse(String(toolResult?.content))).toMatchObject({
      matched: 1,
      workouts: [{ date: '2026-09-24', movements: [{ name: 'Deadlift', weight: 140 }] }],
    });
  });

  it('keeps the conversation so a follow-up makes sense', async () => {
    const { complete, seen } = scripted(said('Yep.'));
    await askWodi({
      message: 'and before that?',
      recent: [{ from: 'me', text: 'last deadlift?' }, { from: 'wodi', text: '140kg on 24 Sep.' }],
      notes: [],
      loadContext: async () => CTX,
      complete,
    });
    expect(seen[0].messages.slice(1).map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('stops looking things up after four rounds and answers', async () => {
    const lookup = calls({ name: 'training_totals', args: { from: null, to: null } });
    const { complete, seen } = scripted(lookup, lookup, lookup, lookup, said('You trained once.'));
    const reply = await askWodi({ message: 'how much?', recent: [], notes: [], loadContext: async () => CTX, complete });
    expect(reply).toEqual({ kind: 'answer', text: 'You trained once.', proposedNote: null, receipts: [], gap: null, bodyweightKg: null });
    expect(seen.map((s) => s.mustAnswer)).toEqual([false, false, false, false, true]);
  });

  it('something lasting they said comes back as a note to OFFER — the model is told it is not saved', async () => {
    const { complete, seen } = scripted(
      calls({ name: 'propose_note', args: { text: 'Left shoulder sore — avoiding overhead' } }),
      said('Noted on the shoulder — want me to remember it?'),
    );
    const loadContext = vi.fn(async () => CTX);
    const reply = await askWodi({ message: 'my shoulder is wrecked, no overhead for a bit', recent: [], notes: [], loadContext, complete });
    expect(reply).toMatchObject({ kind: 'answer', proposedNote: 'Left shoulder sore — avoiding overhead' });
    expect(String(seen[1].messages.find((m) => m.role === 'tool')?.content)).toContain('Not saved yet');
    expect(loadContext).not.toHaveBeenCalled();
  });

  it('what they already asked Wodi to remember is in front of it', async () => {
    const { complete, seen } = scripted(said('Go light.'));
    await askWodi({
      message: 'what should I do today?',
      recent: [],
      notes: [{ id: 'n1', text: 'Training for a Hyrox in March', createdAt: '2026-09-01' }],
      loadContext: async () => CTX,
      complete,
    });
    expect(String(seen[0].messages[0].content)).toContain('- Training for a Hyrox in March (noted 2026-09-01)');
  });

  it('attaches only workouts it looked up and named, in the order it named them', () => {
    const found = [
      { id: 'a', date: '2026-09-22', title: 'Back Squat 5x5', parts: [], movements: [] },
      { id: 'b', date: '2026-09-10', title: 'The Ladder', parts: [], movements: [] },
      { id: 'c', date: '2026-08-02', title: 'Workout', parts: [], movements: [] },
    ];
    expect(receiptsFor('The Ladder was 22:00, and you squatted 100kg × 5 on 22 Sep.', found)).toEqual(['b', 'a']);
    expect(receiptsFor('Nothing like that in your log.', found)).toEqual([]);
    // "yesterday" and "today" name a day too.
    expect(receiptsFor('Yesterday you did 100kg × 5.', found, new Date(2026, 8, 23))).toEqual(['a']);
    expect(receiptsFor('Nothing today yet.', found, new Date(2026, 8, 23))).toEqual([]);
    // "2 Aug" must not match inside "22 Aug".
    expect(receiptsFor('That was 22 Aug.', found)).toEqual([]);
  });

  it('an unknown tool gets an error back, not a crash', async () => {
    const { complete, seen } = scripted(calls({ name: 'book_class' }), said('Can\'t do that yet.'));
    await askWodi({ message: 'book me in', recent: [], notes: [], loadContext: async () => CTX, complete });
    const toolResult = seen[1].messages.find((m) => m.role === 'tool');
    expect(JSON.parse(String(toolResult?.content))).toEqual({ error: 'no tool called book_class' });
  });
  it('ahead of a workout it plans from the board and the log, and is never offered to log it', async () => {
    const { complete, seen } = scripted(
      calls({ name: 'find_workouts', args: { from: null, to: null, movement: 'deadlift', title: null, limit: null } }),
      said('Last time on 24 Sep: 140kg for 15. Hold 120kg today.'),
    );
    const tools: string[][] = [];
    const reply = await askWodi({
      message: 'how should I pace it?',
      recent: [],
      notes: [],
      situation: {
        kind: 'upcoming',
        workout: {
          board: '3 RFT: 10 Deadlift @100/140kg, 400m run',
          reading: 'Part 1 · 3 RFT (wod) — 3 sets/rounds, scored by time',
          loads: 'Deadlift · last time 140kg (24 Sep)',
          sex: 'male',
        },
      },
      loadContext: async () => CTX,
      complete: async (messages, offered, mustAnswer) => {
        tools.push(offered.map((t) => (t.type === 'function' ? t.function.name : '')));
        return complete(messages, offered, mustAnswer);
      },
    });
    expect(reply).toMatchObject({ kind: 'answer', receipts: ['w1'] });
    const system = String(seen[0].messages[0].content);
    expect(system).toContain('3 RFT: 10 Deadlift @100/140kg, 400m run');
    expect(system).toContain('Deadlift · last time 140kg (24 Sep)');
    // The structure comes from the app's reading: an interval piece was planned as a round time.
    expect(system).toContain('Part 1 · 3 RFT (wod) — 3 sets/rounds, scored by time');
    expect(system).toContain('Never turn windows of open work into a round time to beat');
    // It names a weight now (2026-11-16, the owner's call: "which weight?" deserves an answer) —
    // under a ceiling, because a run on 2026-10-10 told an athlete to clean 60 kg for 2-minute
    // sprints, above their one-rep max. The record caps every weight; no log on a lift, no number.
    expect(system).toContain('Never at or above their record for anything but a single');
    expect(system).toContain('A barbell lift with no record and nothing logged: give no number');
    expect(system).toContain('120 lunges');
    expect(system).not.toContain('call log_workout');
    expect(tools[0]).not.toContain('log_workout');
    expect(tools[0]).not.toContain('create_workout');
    expect(tools[0]).toContain('find_workouts');
  });

  it('their body weight, said in the chat, comes back for the profile — in kg', async () => {
    const { complete, seen } = scripted(
      calls({ name: 'save_body_weight', args: { value: 154, unit: 'lb' } }),
      said('Saved — 154 lb. Change it under Me anytime.'),
    );
    const reply = await askWodi({ message: '154', recent: [{ from: 'wodi', text: 'What do you weigh?' }], notes: [], loadContext: async () => CTX, complete });
    expect(reply).toMatchObject({ kind: 'answer', bodyweightKg: 69.9 });
    expect(String(seen[1].messages.find((m) => m.role === 'tool')?.content)).toContain('Saved to their profile');
  });

  it('a number that is no body weight is never saved — Wodi asks again', async () => {
    const { complete, seen } = scripted(
      calls({ name: 'save_body_weight', args: { value: 7, unit: 'kg' } }),
      said('Sorry — what do you weigh?'),
    );
    const reply = await askWodi({ message: '7', recent: [], notes: [], loadContext: async () => CTX, complete });
    expect(reply).toMatchObject({ kind: 'answer', bodyweightKg: null });
    expect(String(seen[1].messages.find((m) => m.role === 'tool')?.content)).toContain('Ask them again');
  });

  it('knows their body weight from the profile, or asks for it once', async () => {
    const known = scripted(said('ok'));
    await askWodi({ message: 'hi', recent: [], notes: [], loadContext: async () => CTX, complete: known.complete, body: { bodyweightKg: 70, weightUnit: 'kg' } });
    expect(String(known.seen[0].messages[0].content)).toContain('Their body weight: 70 kg (their profile)');
    const unknown = scripted(said('ok'));
    await askWodi({ message: 'hi', recent: [], notes: [], loadContext: async () => CTX, complete: unknown.complete });
    expect(String(unknown.seen[0].messages[0].content)).toContain('Ask at most once in a conversation');
  });

  it('before a workout it reads the last days for fatigue, and gives a tired and a strong weight', async () => {
    const { complete, seen } = scripted(said('ok'));
    await askWodi({
      message: 'which weight?', recent: [], notes: [], now: new Date(2026, 8, 25, 18),
      situation: { kind: 'upcoming', workout: { board: '5 RFT: 10 Deadlift', reading: '', loads: '', sex: 'male' } },
      loadContext: async () => CTX, complete,
    });
    const system = String(seen[0].messages[0].content);
    expect(system).toContain('- yesterday: Deadlift day');
    expect(system).toContain('loads Deadlift 140kg ×15');
    expect(system).toContain('tired 12 · strong 20');
    expect(system).toContain('that outranks the log');
    expect(system).toContain('the strong weight too');
  });

  it('asked for a workout, it writes one as a board, with why', async () => {
    const { complete, seen } = scripted(
      calls({ name: 'find_workouts', args: { from: '2026-09-14', to: null, movement: null, title: null, limit: null } }),
      calls({ name: 'create_workout', args: { board: 'Open Gym Grind\nAMRAP 15:\n10 DB Snatch 22.5/15kg\n10 Pull-ups', why: 'Deadlifts on 24 Sep, so no hinge today.' } }),
    );
    const reply = await askWodi({ message: 'give me an open gym wod', recent: [], notes: [], loadContext: async () => CTX, complete, now: DAY });
    expect(reply).toEqual({
      kind: 'workout',
      board: 'Open Gym Grind\nAMRAP 15:\n10 DB Snatch 22.5/15kg\n10 Pull-ups',
      why: 'Deadlifts on 24 Sep, so no hinge today.',
      gap: null,
    });
    expect(String(seen[0].messages[0].content)).toContain('call create_workout');
  });

  it('says what it can\'t do yet, and hands the request back to be recorded', async () => {
    const { complete } = scripted(
      calls({ name: 'note_gap', args: { request: 'remind me Friday to do deadlifts' } }),
      said("I can't set reminders yet. Want me to write you a deadlift session for Friday?"),
    );
    const reply = await askWodi({ message: 'remind me Friday to do deadlifts', recent: [], notes: [], loadContext: async () => CTX, complete });
    expect(reply).toMatchObject({ kind: 'answer', gap: 'remind me Friday to do deadlifts' });
  });

  it('mid-log, an aside is answered — never logged or written over the open board', async () => {
    const tools: string[][] = [];
    const { complete, seen } = scripted(
      // A model that reaches for a tool it wasn't offered is not obeyed.
      calls({ name: 'create_workout', args: { board: 'Something else', why: '' } }),
      said('140kg on 24 Sep.'),
    );
    const reply = await askWodi({
      message: 'what did I deadlift last time?',
      recent: [],
      notes: [],
      situation: { kind: 'logging', board: 'Fran: 21-15-9 thrusters, pull-ups' },
      loadContext: async () => CTX,
      complete: async (messages, offered, mustAnswer) => {
        tools.push(offered.map((t) => (t.type === 'function' ? t.function.name : '')));
        return complete(messages, offered, mustAnswer);
      },
    });
    expect(reply).toMatchObject({ kind: 'answer', text: '140kg on 24 Sep.' });
    expect(tools[0]).not.toContain('create_workout');
    expect(tools[0]).not.toContain('log_workout');
    expect(String(seen[0].messages[0].content)).toContain('the logging carries on after you');
  });

  it('without a workout ahead, a logged workout is still handed to logging', () => {
    // The plan section is only in the prompt when there's a board to plan.
    expect(TOOLS.map((t) => (t.type === 'function' ? t.function.name : ''))).toContain('log_workout');
  });
});
