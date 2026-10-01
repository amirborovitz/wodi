import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletionMessage, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { Workout } from '../../types';
import { askWodi, type CompleteFn } from './askWodi';
import type { TrainingContext } from './trainingFacts';

// The loop is tested against a scripted model — never the network.
vi.mock('../openai', () => ({ openaiClient: {}, PARSE_MODEL: 'test', PARSE_REASONING_EFFORT: 'none' }));

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
    expect(reply).toEqual({ kind: 'answer', text: '140kg for 15 on 24 Sep.', proposedNote: null });

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
    expect(reply).toEqual({ kind: 'answer', text: 'You trained once.', proposedNote: null });
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

  it('an unknown tool gets an error back, not a crash', async () => {
    const { complete, seen } = scripted(calls({ name: 'book_class' }), said('Can\'t do that yet.'));
    await askWodi({ message: 'book me in', recent: [], notes: [], loadContext: async () => CTX, complete });
    const toolResult = seen[1].messages.find((m) => m.role === 'tool');
    expect(JSON.parse(String(toolResult?.content))).toEqual({ error: 'no tool called book_class' });
  });
});
