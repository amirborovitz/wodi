import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import type { ParsedWorkout } from './types';
import { initStoryResults, type StoryExerciseResult } from './components/logging/story/types';
import { storyTeamSize, toLegacyResult } from './components/logging/story/StoryLogResults';
import { openSlots, applyAnswer, EMPTY_ANSWER, type ChatSlot, type SlotAnswer } from './components/tellWodi/chatQuestions';
import { getExerciseLoggingMode } from './services/exerciseLoggingMode';
import { buildSavedWorkoutTotals, sessionPartnerScope } from './services/savedWorkout';
import type { ExerciseResult } from './services/workloadFromResults';

/**
 * WHAT THE ATHLETE ENDS UP SEEING — every corpus board, logged through the chat and saved.
 *
 * The parse corpus checks how a board is READ. It passed on a typed VOLT board whose save then
 * stored 1,800 m of bike where the athlete rode 7,200 (2026-10-11): the bug lived after the
 * reading. This plays the athlete instead — the app's own parse, its own chat seeding and
 * questions, its own save (buildSavedWorkoutTotals, the function AddWorkoutScreen calls) — and
 * checks the stored totals, which are what the poster, the stats and EP read.
 *
 * Each fixed-work board carries `expectSaved`: what an athlete who did it AS WRITTEN must end up
 * with — every total traced to the board (4 sets × 1,800 m = 7,200 m; 10/10 per side × 3 sets =
 * 60). Not the parse-time calculator's numbers: it disagrees with the save in places, and where
 * they disagree the board decides. AMRAPs and max tests are skipped — there the score IS the work.
 */

const FIXED_WORK_KINDS = new Set<StoryExerciseResult['kind']>(['score_time', 'intervals', 'load', 'reps']);

/** The answer an athlete who did the board as written gives to each question. */
function asWritten(slot: ChatSlot): SlotAnswer | null {
  const answer = (fields: Partial<SlotAnswer>): SlotAnswer => ({ id: slot.id, ...EMPTY_ANSWER, ...fields });
  switch (slot.kind) {
    case 'time': return answer({ seconds: slot.cap ?? 1200 });
    case 'rounds': return answer({ count: 5 });
    case 'reps': return answer({ count: 20 });
    case 'distance': return answer({ count: 1000 });
    case 'duration': return answer({ seconds: 60 });
    case 'weight': return answer({ weight: 50 });
    case 'maxset': return answer({ count: 10, weight: 50 });
    case 'choice': return slot.options?.[0] ? answer({ choice: slot.options[0] }) : null;
    case 'unit': return answer({ unit: 'kg' });
    default: return null;
  }
}

/** The chat, played to the end by an athlete who did the board as written. */
function logAsWritten(parsed: ParsedWorkout): StoryExerciseResult[] {
  const context = { format: parsed.format, scoreType: parsed.scoreType, exerciseCount: parsed.exercises.length };
  let results = initStoryResults(
    parsed,
    parsed.exercises.map((exercise) => getExerciseLoggingMode(exercise, context)),
    'male',
    storyTeamSize(parsed),
    { blankAnswers: true, weightUnit: 'kg' },
  );
  const closed = new Set<string>();
  for (let guard = 0; guard < 60; guard += 1) {
    const slot = openSlots(results, closed, new Map(), parsed.teamSize).find((s) => s.asked);
    if (!slot) break;
    const answer = asWritten(slot);
    closed.add(slot.id);
    if (answer) results = applyAnswer(results, slot, answer).results;
  }
  return results;
}

/** Every fixed-work part's stored totals, keyed "part:Movement:field" — what expectSaved holds. */
function savedAsWritten(parsed: ParsedWorkout): Record<string, number> {
  const results = logAsWritten(parsed);
  const saved = buildSavedWorkoutTotals(
    parsed,
    results.map(toLegacyResult) as unknown as ExerciseResult[],
    sessionPartnerScope(parsed).partnerFactor,
  ).breakdownFromResults;
  const out: Record<string, number> = {};
  results.forEach((result, part) => {
    if (!FIXED_WORK_KINDS.has(result.kind)) return;
    for (const row of saved.movements.filter((m) => m.exerciseIndex === part)) {
      for (const field of ['totalReps', 'totalDistance', 'totalCalories'] as const) {
        if ((row[field] ?? 0) > 0) out[`${part}:${row.name}:${field}`] = Math.round(row[field]!);
      }
    }
  });
  return out;
}

interface CorpusBoard {
  name: string;
  parsed: ParsedWorkout;
  expectSaved?: Record<string, number>;
}

describe('what the athlete ends up seeing — every corpus board, logged and saved', () => {
  const boards: CorpusBoard[] = [];

  beforeAll(async () => {
    // The corpus replays recorded AI answers; no request leaves the machine.
    process.env.OPENAI_API_KEY ??= 'replay-only';
    const { installReplay, restoreOpenAI } = await import('../scripts/aiReplay');
    const { parseWorkoutSession } = await import('./services/openai');
    const quiet = { info: console.info, warn: console.warn, log: console.log, table: console.table };
    console.info = () => {}; console.warn = () => {}; console.log = () => {}; console.table = () => {};
    try {
      const dir = path.resolve('fixtures/wods');
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
        const fixture = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8').replace(/^﻿/, ''));
        installReplay(fixture.aiResponses);
        try {
          boards.push({ name: fixture.name, parsed: await parseWorkoutSession(fixture.rawText), expectSaved: fixture.expectSaved });
        } finally {
          restoreOpenAI();
        }
      }
    } finally {
      Object.assign(console, quiet);
    }
  }, 300_000);

  it.runIf(!!process.env.SAVE_DUMP)('dumps what is saved today (to seed a new board\'s expectSaved)', () => {
    const dump: Record<string, Record<string, number>> = {};
    for (const { name, parsed } of boards) {
      const saved = savedAsWritten(parsed);
      if (Object.keys(saved).length > 0) dump[name] = saved;
    }
    fs.writeFileSync(process.env.SAVE_DUMP!, JSON.stringify(dump, null, 1));
  });

  it('stores what the board says, for an athlete who did it as written', () => {
    expect(boards.length).toBeGreaterThan(40);
    const wrong: string[] = [];
    for (const { name, parsed, expectSaved } of boards) {
      const saved = savedAsWritten(parsed);
      if (!expectSaved) {
        // A fixed-work board must say what it stores — otherwise it isn't being checked at all.
        if (Object.keys(saved).length > 0) wrong.push(`${name}: has fixed work but no expectSaved`);
        continue;
      }
      for (const key of new Set([...Object.keys(expectSaved), ...Object.keys(saved)])) {
        if (expectSaved[key] !== saved[key]) {
          wrong.push(`${name} — ${key}: the board says ${expectSaved[key] ?? 'nothing'}, saved ${saved[key] ?? 'nothing'}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('a typed log ("I did … 4 sets of 1800 echo bike …")', () => {
  // The owner's VOLT, 2026-10-11, exactly as parsed from the chat: the model labelled every
  // movement "entered as a total" — "I did" read as a report of totals. The board's own 1,800 m
  // was then taken for a total the athlete gave, and never multiplied by the 4 sets.
  const volt = {
    title: 'VOLT', type: 'for_time', format: 'for_time', scoreType: 'time',
    exercises: [{
      name: '4 Sets For Time', type: 'wod', loggingMode: 'for_time', prescription: '4 sets for time: 1800 Echo Bike, 15 Deadlifts, 10 Burpee to Pull-ups',
      suggestedSets: 4, rounds: 4,
      movements: [
        { name: 'Echo Bike', distance: 1800, unit: 'm', inputType: 'none', equipment: 'none', countingMode: 'per_round', scoreEntryMode: 'total' },
        { name: 'Deadlift', reps: 15, inputType: 'weight', equipment: 'barbell', countingMode: 'per_round', scoreEntryMode: 'total' },
        { name: 'Burpee to Pull-up', reps: 10, inputType: 'none', equipment: 'none', countingMode: 'per_round', scoreEntryMode: 'total' },
      ],
    }],
  } as unknown as ParsedWorkout;

  it('stores 7,200 m of bike — the board\'s 1,800 per set is not something the athlete typed', () => {
    expect(savedAsWritten(volt)).toEqual({
      '0:Echo Bike:totalDistance': 7200,
      '0:Deadlift:totalReps': 60,
      '0:Burpee to Pull-up:totalReps': 40,
    });
  });
});
