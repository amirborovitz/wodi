/**
 * useWeekPosterData — RecapData → the one shape every week skin renders.
 *
 * The skins are surfaces: they pick colour, texture and rhythm, never what the
 * week says. Every string and number a poster prints is decided here once, so
 * Slab and Hazard can't disagree about how many sessions there were.
 *
 * Same truth standard as the WOD poster: everything below is either a number the
 * athlete entered or one derived from those. A week with no logged durations,
 * no cardio or no tonnage drops the element rather than inventing a figure.
 */

import { useMemo } from 'react';
import type { RecapData, RecapLift, RecapMoveStat } from './useRecapData';
import { isLoadedImplement } from '../data/movementRegistry';

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
}

export interface WeekPosterTile {
  /** "30" · "280" — formatted, because the unit it was formatted for travels with it. */
  value: string;
  /** "KM" · "M" · "CAL" */
  unit: string;
  /** "ECHO BIKE" — the machine that put the figure up. */
  source: string;
}

export interface WeekPosterData {
  /** "THE WEEK" — the week's answer to FOR TIME, so the poster says what it is. */
  tag: string;
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
  /** The one handwritten line. Null when the week has nothing to brag with. */
  brag: string | null;
  ep: number;
}

/**
 * Minutes as the athlete would say them: "2:26" past the hour, plain minutes below it.
 */
function formatMoveTime(minutes: number): { value: string; unit: string } {
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
    .map((m) => ({ name: m.name, reps: m.reps }));

  const tiles = (data.aerobic?.cells ?? []).slice(0, MAX_TILES).map((c) => ({
    value: c.value,
    unit: c.unit,
    source: c.machine.toUpperCase(),
  }));

  // One handwritten line, and tonnage owns it when there was any. A cardio-only
  // week gets the aerobic comparison there instead of an empty slot — never both,
  // because two brag lines is a paragraph.
  const brag =
    data.tonnage > 0
      ? `${data.tonnage.toLocaleString()} kg — ${data.tonnageComp}`
      : (data.aerobic?.compare ?? null);

  return {
    tag: data.label,
    weekNo: data.period,
    dates: data.periodSub,
    hero: hero.value,
    heroUnit: hero.unit,
    sessions,
    moves,
    lifts: data.lifts,
    tiles,
    brag,
    ep: data.epTotal,
  };
}

export function useWeekPosterData(data: RecapData): WeekPosterData {
  return useMemo(() => buildWeekPosterData(data), [data]);
}
