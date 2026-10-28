import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import type { ParsedWorkout, Workout } from './types';
import { initStoryResults, type StoryExerciseResult } from './components/logging/story/types';
import { storyTeamSize } from './components/logging/story/StoryLogResults';
import { openSlots, applyAnswer, nextQuestion, panelAnswer, EMPTY_ANSWER, type ChatSlot, type SlotAnswer } from './components/tellWodi/chatQuestions';
import { getExerciseLoggingMode } from './services/exerciseLoggingMode';
import { buildSavedWorkoutTotals, sessionPartnerScope } from './services/savedWorkout';
import { reopenLogged } from './services/loggedRecord';
import { removeUndefined } from './utils/firestoreUtils';

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
    case 'count': return answer({ count: 10 });
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
function logAsWritten(
  parsed: ParsedWorkout,
  asked?: (text: string) => void,
  answerFor: (slot: ChatSlot) => SlotAnswer | null = asWritten,
): StoryExerciseResult[] {
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

/** Every fixed-work part's stored totals, keyed "part:Movement:field" — what expectSaved holds. */
function savedAsWritten(parsed: ParsedWorkout): Record<string, number> {
  const results = logAsWritten(parsed);
  const saved = buildSavedWorkoutTotals(
    parsed,
    results,
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

  // WHAT THE CHAT ASKS, board by board, frozen in a file a person can read. A rule change that
  // alters any board's questions shows up here as a diff — the max-dips board asked "Max set:
  // reps @ weight" on the good mornings for days before anyone saw it (2026-10-21). Update with
  // `npx vitest run src/corpusSave.test.ts -u` and say in the commit why each board changed.
  it('asks every board the questions frozen in chat-decisions.txt', async () => {
    const lines: string[] = [];
    for (const { name, parsed } of boards) {
      lines.push(name);
      const cards: string[] = [];
      const results = logAsWritten(parsed, (text) => cards.push(text));
      results.forEach((r) => {
        const how = r.skipped ? 'skipped' : r.kind;
        lines.push(`  part ${r.exerciseIndex + 1} · ${r.exercise.name} · ${how}`);
      });
      cards.forEach((text) => lines.push(`    asks: ${text}`));
      if (cards.length === 0) lines.push('    asks nothing');
      lines.push('');
    }
    await expect(lines.join('\n')).toMatchFileSnapshot('../fixtures/chat-decisions.txt');
  });

  it('an edit reopens exactly what was logged, and saving it untouched changes nothing', () => {
    // Every board, every kind — AMRAPs and max tests too: the round trip isn't about the totals
    // being right, it's about an edit never turning one log into a different one.
    const drifted: string[] = [];
    let largest = 0;
    for (const { name, parsed } of boards) {
      const answers = logAsWritten(parsed);
      const { partnerFactor } = sessionPartnerScope(parsed);
      const first = buildSavedWorkoutTotals(parsed, answers, partnerFactor);
      largest = Math.max(largest, first.loggedJson.length);

      // Stored as Firestore stores it: undefined dropped, a fresh copy read back.
      const stored = structuredClone(removeUndefined({
        id: 'w', userId: 't', title: parsed.title ?? 'W', type: parsed.type, status: 'completed',
        date: new Date('2026-10-12'), exercises: first.exercises, workloadBreakdown: first.breakdownFromResults,
        loggedJson: first.loggedJson,
      })) as unknown as Workout;
      const reopened = reopenLogged(stored, 'male');
      if (JSON.stringify(reopened.results) !== JSON.stringify(answers)) drifted.push(`${name}: the answers reopened differently`);
      if (JSON.stringify(reopened.parsed) !== JSON.stringify(parsed)) drifted.push(`${name}: the board reopened differently`);

      const again = buildSavedWorkoutTotals(reopened.parsed, reopened.results, partnerFactor);
      if (JSON.stringify(again.exercises) !== JSON.stringify(first.exercises)) drifted.push(`${name}: re-save changed the sets`);
      if (JSON.stringify(again.breakdownFromResults) !== JSON.stringify(first.breakdownFromResults)) drifted.push(`${name}: re-save changed the totals`);
    }
    expect(drifted).toEqual([]);
    // A Firestore doc holds 1 MiB; the record must stay a small part of it.
    expect(largest).toBeLessThan(200_000);
  });

  // ─── Every shape the old screen logged, logged in the chat ─────────────────────────
  // Until 2026-10-22 the chat handed four of these boards to the standard screen ("easier to
  // fill in yourself"). Each test plays the chat with real answers and reads what the SAVE holds.

  /** The chat, played with the given answers by slot kind; anything else as written. */
  const play = (name: string, answers: Partial<Record<ChatSlot['kind'], (slot: ChatSlot) => Partial<SlotAnswer>>>) => {
    const board = boards.find((b) => b.name === name);
    if (!board) throw new Error(`no corpus board ${name}`);
    const cards: string[] = [];
    const results = logAsWritten(board.parsed, (text) => cards.push(text), (slot) => {
      const given = answers[slot.kind];
      return given ? { id: slot.id, ...EMPTY_ANSWER, ...given(slot) } : asWritten(slot);
    });
    const saved = buildSavedWorkoutTotals(board.parsed, results, sessionPartnerScope(board.parsed).partnerFactor);
    const row = (movement: string) => saved.breakdownFromResults.movements.find((m) => m.name === movement);
    return { results, cards, saved, row };
  };

  it('work done for time is never counted: flutter kicks fill their 50 s window, no box', () => {
    // Owner board 2026-10-21: "5. Flutter Kick" in an EMOM 50:10 — nobody counts flutter kicks.
    const counted: string[] = [];
    const { row } = play('station-emom-flutter-kick-time', {
      count: (slot) => {
        counted.push(...(slot.movementNames ?? []));
        return { count: 12 };
      },
    });
    expect(counted).toContain('Echo Bike');
    expect(counted).not.toContain('Flutter Kick');
    expect(row('Flutter Kick')?.totalReps ?? 0).toBe(0);
  });

  it('a swap typed on the station card, off the board\'s own either/or, lands as said', () => {
    // "Did crossovers instead of the double unders, about 25 each round" — the reader answers the
    // station's swap question, with or without the number on its count. Either way: 4 × 25.
    const board = boards.find((b) => b.name === 'station-emom-flutter-kick-time')!;
    const said: Array<Array<Partial<SlotAnswer> & { kind: ChatSlot['kind'] }>> = [
      [{ kind: 'swap', swapTo: 'Crossover', swapAmount: 25, swapUnit: 'reps' }],
      [{ kind: 'swap', swapTo: 'Crossover' }, { kind: 'count', count: 25 }],
      [{ kind: 'count', count: 25 }, { kind: 'swap', swapTo: 'Crossover' }],
    ];
    for (const answers of said) {
      // The card logged with the double-unders box left for the sentence…
      let results = logAsWritten(board.parsed, undefined, (slot) => (
        slot.kind === 'count' && slot.movementNames?.[0] === 'Double Under' ? null : asWritten(slot)
      ));
      // …and the sentence, read: every answer it carries, in the reader's order.
      const slots = openSlots(results, new Set());
      for (const { kind, ...fields } of answers) {
        const slot = slots.find((s) => s.kind === kind && s.movementNames?.[0] === 'Double Under' && s.exerciseIndex === 1)!;
        expect(slot, `${kind} slot for Double Under`).toBeDefined();
        results = applyAnswer(results, slot, { id: slot.id, ...EMPTY_ANSWER, ...fields }).results;
      }
      const rows = buildSavedWorkoutTotals(board.parsed, results, sessionPartnerScope(board.parsed).partnerFactor).breakdownFromResults.movements;
      expect(rows.find((m) => m.name === 'Crossover')?.totalReps, JSON.stringify(answers)).toBe(100);
      expect(rows.find((m) => m.name === 'Double Under')).toBeUndefined();
      // Nothing to convert on a "max" station — the number is the crossovers' own.
      expect(openSlots(results, new Set()).some((s) => s.asked && s.kind === 'amount')).toBe(false);
    }
  });

  it('a max-reps score typed in the chat reaches the save (it was saved as zero)', () => {
    // "Every 3:00 x 5: 400m run, max push-ups. Score = total push-ups."
    const { row, results } = play('board-every-3-max-pushups', { reps: () => ({ count: 87 }) });
    expect(results[0].maxReps).toBe(87);
    expect(row('Push-up')?.totalReps).toBe(87);
  });

  it('"about 15 each round" is fifteen in every window', () => {
    const { row } = play('board-every-3-max-pushups', { reps: () => ({ count: 15, perInterval: true }) });
    expect(row('Push-up')?.totalReps).toBe(75);
  });

  it('a station EMOM asks every station on one card and saves each one', () => {
    // EMOM (50:10) x 25 min, five stations, every one "max" — five visits each.
    const { cards, row } = play('bare-movement-station-emom', { count: () => ({ count: 12 }) });
    expect(cards).toContain('How many at each one, each round?');
    expect(row('Echo Bike')?.totalCalories).toBe(60);
    for (const station of ['Bar Muscle-up', 'Box Jump', 'Renegade Row', 'Burpee']) {
      expect(row(station)?.totalReps).toBe(60);
    }
  });

  it('a station with the board\'s either/or picks its side on the station card', () => {
    // "Bar Muscle-up / Pull-up" is one of the five stations: picked on the card, beside its count.
    const board = boards.find((b) => b.name === 'bare-movement-station-emom')!;
    const context = { format: board.parsed.format, scoreType: board.parsed.scoreType, exerciseCount: board.parsed.exercises.length };
    let results = initStoryResults(board.parsed, board.parsed.exercises.map((e) => getExerciseLoggingMode(e, context)), 'male', storyTeamSize(board.parsed), { blankAnswers: true, weightUnit: 'kg' });
    const closed = new Set<string>();
    let card = null as ReturnType<typeof nextQuestion>;
    for (let guard = 0; guard < 20; guard += 1) {
      const slots = openSlots(results, closed);
      const question = nextQuestion(slots, results);
      if (!question) break;
      if (question.panel?.groups.some((g) => g.choice)) {
        card = question;
        const group = question.panel.groups.find((g) => g.choice)!;
        const values = Object.fromEntries(question.panel.groups.map((g) => [`${g.fields[0].slotId}:count`, 10]));
        const { label, answers } = panelAnswer(question.panel, values, new Set(), { [group.choice!.slotId]: group.choice!.options[1] });
        expect(label).toContain('Pull-up 10 reps');
        // Every station named in the reply, a box left empty said as empty, the pick kept even
        // with no number — the reply is what stays of the card when the chat is reopened.
        const echo = question.panel.groups.find((g) => g.title === 'Echo Bike')!;
        const sparse = panelAnswer(question.panel, { [`${echo.fields[0].slotId}:count`]: 12 }, new Set(), { [group.choice!.slotId]: group.choice!.options[1] });
        expect(sparse.label).toContain('Echo Bike 12 cal');
        expect(sparse.label).toContain('Pull-up —');
        expect(panelAnswer(question.panel, {}, new Set(), { [group.choice!.slotId]: group.choice!.options[1] }).label).toContain('Pull-up —');
        for (const a of answers) {
          const slot = slots.find((s) => s.id === a.id)!;
          results = applyAnswer(results, slot, a).results;
          closed.add(a.id);
        }
        break;
      }
      question.slotIds.forEach((id) => closed.add(id));
    }
    expect(card?.panel?.groups.find((g) => g.choice)?.choice?.labels).toEqual(['Bar Muscle-up', 'Pull-up']);
    // The choice is answered on the card — never asked again on its own.
    expect(openSlots(results, closed).some((s) => s.asked && s.kind === 'choice')).toBe(false);
    // The board wrote no number for the station, so there's nothing to convert: the count typed
    // beside the pick IS the pull-ups — never "how many Pull-up for each Bar Muscle-up?".
    expect(openSlots(results, closed).some((s) => s.asked && s.kind === 'amount')).toBe(false);
    const rows = buildSavedWorkoutTotals(board.parsed, results, sessionPartnerScope(board.parsed).partnerFactor).breakdownFromResults.movements;
    expect(rows.find((m) => m.name === 'Pull-up')?.totalReps).toBe(50);
    expect(rows.find((m) => m.name === 'Bar Muscle-up')).toBeUndefined();
  });

  it('a ladder AMRAP is the rung finished, then how far into the next', () => {
    const { results, cards } = play('board-ascending-ladder-amrap', {
      ladder: (slot) => ({ count: slot.rungs![3] }),
      partial: (slot) => ({ choice: slot.options![0] }),
    });
    expect(cards[0]).toBe('Which rung did you finish?');
    expect(results[0].ladderStep).toBe(4);
    expect(results[0].partialMovements).toHaveLength(1);
  });

  it('a cardio piece scored in calories asks calories, and saves them', () => {
    // "30 min Zone 2, Bike or Row" — the AI reads it as max calories, so the question is calories.
    const { cards, row } = play('board-zone2-bike', { count: () => ({ count: 310 }) });
    expect(cards).toContain('How many calories on the Bike in total?');
    expect(cards.some((text) => text.startsWith('How far'))).toBe(false);
    expect(row('Bike')?.totalCalories).toBe(310);
  });

  it('two separately scored AMRAPs are asked by name and saved as two scores', () => {
    let next = 6;
    const { results, cards } = play('board-two-scored-metcons', { rounds: () => ({ count: next-- }) });
    expect(cards.filter((text) => text.startsWith('How many rounds'))).toEqual([
      'How many rounds did you get on BLOCK A?',
      'How many rounds did you get on BLOCK B?',
    ]);
    expect(results[0].blockScores?.filter(Boolean).map((b) => b!.value)).toEqual([6, 5]);
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

describe('a single lift on a clock ("5 sets every 2:00: 3 push press", 45 → 50 kg)', () => {
  // GRIND, 2026-10-11. The reps per set live on the lift itself (the model's answer), not in a rep
  // scheme. The lift screen didn't read them there, so every set went to the save with no reps —
  // and the save collapsed them into ONE summary set with no weight. Totals stayed right, so a
  // totals-only check passed; the saved SETS, which the poster and the edit screen read, did not.
  const grind = {
    title: 'GRIND', type: 'strength', format: 'emom', scoreType: 'load',
    exercises: [{
      name: '5 Sets Every 2:00', type: 'strength', loggingMode: 'emom', prescription: '5 sets every 2 min: 3 Push Press',
      suggestedSets: 5,
      movements: [{ name: 'Push Press', reps: 3, inputType: 'weight', equipment: 'barbell', countingMode: 'per_round' }],
    }],
  } as unknown as ParsedWorkout;

  it('saves five sets of 3, climbing 45 → 50 — and the totals agree', () => {
    let results = logAsWritten(grind);
    // The athlete's actual answer: 45 → 50, not the as-written default.
    const slot = openSlots(initStoryResults(grind, ['emom'], 'male', undefined, { blankAnswers: true, weightUnit: 'kg' }), new Set()).find((s) => s.kind === 'weight')!;
    results = applyAnswer(results, slot, { id: slot.id, ...EMPTY_ANSWER, weight: 45, weightEnd: 50 }).results;
    const saved = buildSavedWorkoutTotals(grind, results, 1);
    expect(saved.exercises[0].sets.map((s) => `${s.actualReps}@${s.weight ?? '-'}`)).toEqual(['3@45', '3@-', '3@-', '3@-', '3@50']);
    expect(saved.breakdownFromResults.movements[0]).toMatchObject({ totalReps: 15, weightProgression: [45, 50] });
  });
});
