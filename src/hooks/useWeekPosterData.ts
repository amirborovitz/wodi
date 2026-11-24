/**
 * useWeekPosterData — RecapData → the one shape the week poster renders.
 *
 * The poster is a surface: it picks colour, texture and rhythm, never what the
 * week says. Every string and number it prints is decided here once.
 *
 * Same truth standard as the WOD poster: everything below is either a number the
 * athlete entered or one derived from those. A week with no logged durations,
 * no cardio or no tonnage drops the element rather than inventing a figure.
 */

import { useMemo } from 'react';
import type { RecapData, RecapEngineCell, RecapLift, RecapMoveStat } from './useRecapData';
import { isLoadedImplement } from '../data/movementRegistry';
import { BODY_AREAS, bodyWorked, type BodyWorked } from '../data/bodyAreas';

/** Rows in the body page's list — what fits under the figure. */
const MAX_BODY_ROWS = 5;

/**
 * Three rows is a ranking; six is a spreadsheet.
 *
 * Three and not four because the lift block has to fit under it: at four rows
 * Hazard's content runs 56px past its own canvas, and the canvas clips silently —
 * the footer and the wordmark would just be gone from the shared PNG.
 */
const MAX_BOARD_MOVES = 3;
/** The tile grid is two columns wide; a third figure would set all of them shrinking. */
const MAX_TILES = 2;

export interface WeekPosterMove {
  name: string;
  reps: number;
  /**
   * Done with a barbell, dumbbell or kettlebell. The board lists lifted work first on
   * purpose (96 cleans outrank 150 step-ups), and the poster labels the two groups so
   * that order reads as a rule rather than a mistake.
   */
  weighted: boolean;
}

/** One figure in one unit: "23" + "KM". */
export interface WeekPosterTilePart {
  /** "30" · "280" — formatted, because the unit it was formatted for travels with it. */
  value: string;
  /** "KM" · "M" · "CAL" */
  unit: string;
}

/**
 * One machine's week — ONE tile per machine, never two.
 *
 * A bike ridden for metres on some days and for calories on others used to get a
 * tile per unit, and "5.1 KM · ECHO BIKE" beside "707 CAL · ECHO BIKE" reads as one
 * ride: that far, and that much burned doing it. Now the machine gets one tile with
 * both figures at equal weight, "23 KM + 108 CAL", and the session count under them
 * says it was the whole week on that machine. Each figure keeps its own unit —
 * never converted into the other.
 */
export interface WeekPosterTile {
  /** Hero-first. One part for a machine measured one way; two when it was measured both. */
  parts: WeekPosterTilePart[];
  /** "ECHO BIKE" · "ECHO BIKE · 6 SESSIONS" — the count only on a tile with both units. */
  source: string;
}

/** Which page of the week to draw: the work, or the body it worked. */
export type WeekPage = 'week' | 'body';

export interface WeekPosterData {
  /** The pages this week fills, in swipe order: the work always, the body when anything resolved to a body part. */
  pages: WeekPage[];
  /** "WEEK 34" — set big, because it has to survive a story thumbnail. */
  weekNo: string;
  /** "AUG 17 — 23" — the quiet half of the masthead. */
  dates: string;
  /** "2:26" — the biggest legible thing the week did. */
  hero: string;
  /** "HRS MOVING" — sits above the hero as its label. */
  heroUnit: string;
  /**
   * The second hero number: how many times you showed up.
   *
   * A digit rather than "FIVE SESSIONS" whispered under the clock — two numbers
   * of the same weight is what makes the poster readable in one glance. Null when
   * the session count IS the hero, so it is never printed twice.
   */
  sessions: { count: number; unit: string } | null;
  /** Ranked, biggest first. Never includes whatever the hero already said. */
  moves: WeekPosterMove[];
  /**
   * The week's two heaviest barbell moments — overhead, and off the floor.
   *
   * Empty on a week that never picked up a bar, which is a week the block simply
   * doesn't draw rather than one it fills with zeroes.
   */
  lifts: RecapLift[];
  /**
   * Machine totals, each in the unit it was measured in. Never summed, never
   * converted, never compared to each other — the lift block above carries the
   * heavy numbers, and these are the engine ones.
   */
  tiles: WeekPosterTile[];
  /** Every session the week held — the body page says what they added up to. */
  sessionCount: number;
  /** The body the week worked: the figure and its list, for the body page. Null when nothing resolved to a body part. */
  body: BodyWorked | null;
  /** How many body parts the week trained — all of them, not just the rows the list has room for. */
  partsWorked: number;
  /** The one handwritten line. Null when the week has nothing to brag with. */
  brag: string | null;
  ep: number;
}

/**
 * Minutes as the athlete would say them: "2:26" past the hour, plain minutes below it.
 */
export function formatMoveTime(minutes: number): { value: string; unit: string } {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return { value: `${h}:${String(m).padStart(2, '0')}`, unit: 'HRS MOVING' };
  }
  return { value: String(minutes), unit: minutes === 1 ? 'MIN MOVING' : 'MINS MOVING' };
}

/**
 * The moves that get the board.
 *
 * Featured families lead — the category ladder exists precisely so 300 double-unders
 * can't outrank 118 cleans.
 *
 * Conditioning comes after all of it, so it reaches the board only when featured
 * work runs out. Burpees and step-ups come in hundreds while cleans come in dozens,
 * and a board that let them in on rep count answered "what did you do most of?"
 * when the athlete reads it as "what did you do best?". A week that really was
 * burpees and skipping still fills the board, because there is nothing above them
 * to push them off.
 */
function pickBoard(data: RecapData): RecapMoveStat[] {
  const featured = data.families;
  const rest = data.conditioning.filter((m) => !featured.includes(m));
  return [...featured, ...rest];
}

/**
 * The rows that fit, with the last slot reserved for the biggest unloaded movement.
 *
 * Ordering by load is what puts the barbell on top, but as the only rule it made
 * load absolute: any loaded movement beat any bodyweight one by any margin, so a
 * 74-rep squat took the last slot from 150 step-ups and the biggest thing in the
 * week vanished off the board. That is the original complaint inverted — first the
 * easy movements crowded out the hard ones, then the hard ones crowded out
 * everything else.
 *
 * So the board is "your loaded work, and the most you did of anything else". The
 * reservation costs one row and only fires when a bodyweight movement would
 * otherwise be missing entirely.
 */
function takeBoardRows(candidates: RecapMoveStat[]): RecapMoveStat[] {
  const shown = candidates.slice(0, MAX_BOARD_MOVES);
  if (shown.length < MAX_BOARD_MOVES || shown.some((m) => !isLoadedImplement(m.implement))) {
    return shown;
  }
  const topUnloaded = candidates.find((m) => !isLoadedImplement(m.implement));
  if (!topUnloaded) return shown;
  return [...shown.slice(0, MAX_BOARD_MOVES - 1), topUnloaded];
}

/**
 * The engine cells, folded to one tile per machine.
 *
 * The cells arrive hero-first, so machines keep the engine card's order and a
 * machine's own figures keep it too (kilometres before calories).
 */
function buildTiles(cells: RecapEngineCell[]): WeekPosterTile[] {
  const byMachine = new Map<string, RecapEngineCell[]>();
  for (const cell of cells) byMachine.set(cell.machine, [...(byMachine.get(cell.machine) ?? []), cell]);

  return [...byMachine.values()].slice(0, MAX_TILES).map((group) => {
    const { machine, machineSessions } = group[0];
    const count = group.length > 1 ? ` · ${machineSessions} ${machineSessions === 1 ? 'SESSION' : 'SESSIONS'}` : '';
    return {
      parts: group.map((c) => ({ value: c.value, unit: c.unit })),
      source: `${machine.toUpperCase()}${count}`,
    };
  });
}

/**
 * The pure builder behind the hook.
 *
 * Split out for the same reason `buildRecaps` is: every question this file answers
 * is "which row belongs on the board", and that is worth testing without mounting
 * a component to ask it.
 */
export function buildWeekPosterData(data: RecapData): WeekPosterData {
  const board = pickBoard(data);
  const [lead, ...rest] = board;

  // Time leads whenever it exists — it's the most legible number Wodi has to
  // someone who has never used Wodi. `moveMinutes` is a floor built from entered
  // durations, so a week that logged none of them hands the hero to the biggest
  // move, and a week with no movements at all falls back to showing up.
  const time = formatMoveTime(data.moveMinutes);
  const heroIsSessions = data.moveMinutes === 0 && !lead;
  const hero =
    data.moveMinutes > 0
      ? { value: time.value, unit: time.unit }
      : lead
        ? { value: lead.reps.toLocaleString(), unit: lead.name.toUpperCase() }
        : { value: String(data.workouts), unit: data.workouts === 1 ? 'SESSION' : 'SESSIONS' };

  const sessions = heroIsSessions
    ? null
    : { count: data.workouts, unit: data.workouts === 1 ? 'SESSION' : 'SESSIONS' };

  // When the biggest move is already the hero the board starts at the next one,
  // rather than printing the same fact twice.
  const moves = takeBoardRows(data.moveMinutes > 0 ? board : rest)
    .map((m) => ({ name: m.name, reps: m.reps, weighted: isLoadedImplement(m.implement) }))
    // Lifted rows, then bodyweight rows, each keeping the board's order — the poster
    // labels the two groups, so a group must never be split by a row of the other.
    .sort((a, b) => Number(b.weighted) - Number(a.weighted));

  const tiles = buildTiles(data.aerobic?.cells ?? []);

  // One handwritten line, and tonnage owns it when there was any. A cardio-only
  // week gets the aerobic comparison there instead of an empty slot — never both,
  // because two brag lines is a paragraph.
  const brag =
    data.tonnage > 0
      ? `${data.tonnage.toLocaleString()} kg — ${data.tonnageComp}`
      : (data.aerobic?.compare ?? null);

  const body = bodyWorked(data.bodyAreas, MAX_BODY_ROWS);

  return {
    pages: body ? ['week', 'body'] : ['week'],
    weekNo: data.period,
    dates: data.periodSub,
    hero: hero.value,
    heroUnit: hero.unit,
    sessions,
    moves,
    lifts: data.lifts,
    sessionCount: data.workouts,
    body,
    partsWorked: BODY_AREAS.filter((a) => data.bodyAreas[a] > 0).length,
    tiles,
    brag,
    ep: data.epTotal,
  };
}

export function useWeekPosterData(data: RecapData): WeekPosterData {
  return useMemo(() => buildWeekPosterData(data), [data]);
}
