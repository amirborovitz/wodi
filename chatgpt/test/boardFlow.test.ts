import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ParsedWorkout } from '../../src/types/index';
import { answerBoard, boardTurn, deserializeBoard, finishBoard, serializeBoard, startBoard, BoardNotFinished, type AnswerInput, type BoardAthlete } from '../src/boardFlow';

// The real board of 2026-11-19 exactly as the app's recipe reader produced it (the `parsed` half
// of workout 2FbfBeuiVLiEGSw15JUp's loggedJson, byte-exact): A. deadlift 4×3 + LU raises between
// sets; B. every 3:00 × 4 — 200m run, into 2 rounds of 5 T&G power cleans + 5 burpees. Logged
// through the old ChatGPT path it saved 3 deadlifts, 20 cleans and 20 burpees with "estimated"
// totals; logged in the app, 12 / 40 / 40.
const board = JSON.parse(readFileSync(new URL('./fixtures/board-20261119.json', import.meta.url), 'utf8')) as ParsedWorkout;

const athlete: BoardAthlete = { sex: 'male', weightUnit: 'kg', habits: new Map() };

/** How the athlete answered in the app, by what Wodi asks about. */
function answerFor(slot: { slot_id: string; about: string; kind: string }): AnswerInput {
  const about = slot.about.toLowerCase();
  if (slot.kind === 'weight' && about.includes('deadlift')) return { slot_id: slot.slot_id, text: '90 to 120' };
  if (slot.kind === 'weight') return { slot_id: slot.slot_id, text: '45' };
  if (slot.kind === 'unit') return { slot_id: slot.slot_id, unit: 'kg' };
  return { slot_id: slot.slot_id, skipped: true };
}

test('the Nov 19 board, logged through ChatGPT, saves what the app saves', () => {
  let state = startBoard(board, athlete);
  const asked: string[] = [];
  for (let turn = boardTurn(state, athlete); !turn.done; turn = boardTurn(state, athlete)) {
    assert.ok(turn.question, 'an open board always has a next question');
    asked.push(`${turn.question.text} [${turn.question.slots.map((s) => s.kind).join(', ')}]`);
    assert.ok(asked.length < 20, `Wodi keeps asking: ${asked.join(' | ')}`);
    // ChatGPT keeps nothing between calls — the state rides as a JSON draft.
    state = deserializeBoard(serializeBoard(state));
    const out = answerBoard(state, turn.question.slots.map(answerFor), athlete);
    assert.deepEqual(out.not_understood, []);
    state = out.state;
  }
  console.log('Wodi asked:\n  ' + asked.join('\n  '));

  const { document, totals } = finishBoard(state, athlete, { userId: 'u1', date: new Date('2026-11-23T08:00:00Z') });
  const moved = (name: string) => totals.breakdownFromResults.movements.find((m) => m.name.toLowerCase().includes(name));
  assert.equal(moved('deadlift')?.totalReps, 12);
  assert.equal(moved('power clean')?.totalReps, 40);
  assert.equal(moved('burpee')?.totalReps, 40);
  assert.equal(totals.breakdownFromResults.estimated, undefined, 'totals are counted, not estimated — the poster shows them');
  assert.equal(document.date.toISOString(), '2026-11-23T08:00:00.000Z', 'the day it was logged, not a date ChatGPT chose');
  assert.equal(document.userId, 'u1');
});

test("Wodi's answer card: every question at once, answered in ONE call, saves what the app saves", () => {
  const state = startBoard(board, athlete);
  const turn = boardTurn(state, athlete);
  // The card shows them all: the deadlift's start → peak and the cleans' weight, as the app builds them.
  assert.ok(turn.questions.length >= 2, `one question only: ${turn.questions.map((q) => q.text).join(' | ')}`);
  assert.equal(turn.questions[0].text, turn.question?.text, 'the card and the typed path start on the same question');
  assert.ok(turn.questions.every((q) => q.panel || q.chips.length || q.pick), 'every question has a control to tap');
  // The card sends the answers its controls build (the app's panelAnswer), all in one call.
  const cardAnswers = turn.questions.flatMap((q) => q.slotIds.map((id) => {
    const deadlift = q.panel?.groups.some((g) => g.title.toLowerCase().includes('deadlift'));
    return deadlift ? { id, weight: 90, weightEnd: 120 } : { id, weight: 45 };
  }));
  const out = answerBoard(deserializeBoard(serializeBoard(state)), [], athlete, cardAnswers as never);
  assert.deepEqual(out.not_understood, []);
  const after = boardTurn(out.state, athlete);
  assert.ok(after.done, `still asking: ${after.question?.text}`);
  const { totals } = finishBoard(out.state, athlete, { userId: 'u1', date: new Date() });
  const moved = (name: string) => totals.breakdownFromResults.movements.find((m) => m.name.toLowerCase().includes(name));
  assert.deepEqual([moved('deadlift')?.totalReps, moved('power clean')?.totalReps, moved('burpee')?.totalReps], [12, 40, 40]);
  // A card answer for a question Wodi isn't asking is refused, never guessed onto another.
  const stray = answerBoard(state, [], athlete, [{ id: 'made-up', weight: 45 }] as never);
  assert.equal(stray.not_understood.length, 1);
});

test('saving refuses while Wodi still has a question', () => {
  const state = startBoard(board, athlete);
  assert.throws(() => finishBoard(state, athlete, { userId: 'u1', date: new Date() }), BoardNotFinished);
});

test('a sentence Wodi cannot read lands through the value ChatGPT read from it', () => {
  const state = startBoard(board, athlete);
  const question = boardTurn(state, athlete).question!;
  const slot = question.slots[0];
  const out = answerBoard(state, [{ slot_id: slot.slot_id, text: 'I went 90 then worked up to 120 on the deadlifts', weight: 90, weight_end: 120, unit: 'kg' }], athlete);
  assert.deepEqual(out.not_understood, []);
  assert.equal(out.understood.length, 1);
  // An option that isn't one of Wodi's is just words: read like any other answer, not dropped.
  const offList = answerBoard(state, [{ slot_id: slot.slot_id, option: '90 to 120' }], athlete);
  assert.deepEqual(offList.not_understood, []);
});

test('an answer Wodi cannot read is said back, never guessed', () => {
  const state = startBoard(board, athlete);
  const question = boardTurn(state, athlete).question!;
  const out = answerBoard(state, [{ slot_id: question.slots[0].slot_id, text: 'it was pretty heavy honestly' }], athlete);
  assert.equal(out.not_understood.length, 1);
  assert.equal(out.state, state);
  const unknown = answerBoard(state, [{ slot_id: 'made-up', text: '45' }], athlete);
  assert.equal(unknown.not_understood.length, 1);
});
