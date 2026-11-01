import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardReading } from './boardReading';
import type { ParsedWorkout } from '../../types';

/** A corpus board, parsed from its recorded AI answers — no request leaves the machine. */
async function parsedBoard(name: string): Promise<ParsedWorkout> {
  process.env.OPENAI_API_KEY ??= 'replay-only';
  const { installReplay, restoreOpenAI } = await import('../../../scripts/aiReplay');
  const { parseWorkoutSession } = await import('../openai');
  const fixture = JSON.parse(fs.readFileSync(path.resolve('fixtures/wods', `${name}.json`), 'utf8').replace(/^﻿/, ''));
  const quiet = { info: console.info, warn: console.warn, log: console.log, table: console.table };
  console.info = () => {}; console.warn = () => {}; console.log = () => {}; console.table = () => {};
  installReplay(fixture.aiResponses);
  try {
    return await parseWorkoutSession(fixture.rawText);
  } finally {
    restoreOpenAI();
    Object.assign(console, quiet);
  }
}

describe('the game plan reads the board as the app parsed it', () => {
  it('a station interval says its clock, its windows and which stations are open-ended', async () => {
    const reading = boardReading(await parsedBoard('station-emom-flutter-kick-time'));
    if (process.env.READING_DUMP) fs.writeFileSync(process.env.READING_DUMP, reading);
    expect(reading).toMatch(/a new window every/);
    expect(reading).toMatch(/Part 1/);
  }, 60_000);

  it('no parse, no reading — never a guess', () => {
    expect(boardReading(null)).toBe('');
    expect(boardReading({ exercises: [] } as unknown as ParsedWorkout)).toBe('');
  });
});
