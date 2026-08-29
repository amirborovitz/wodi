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
import type { PosterVibeKey } from '../types';
import type { RecapData, RecapMoveStat } from './useRecapData';
import { VIBE } from '../components/celebration/faces/HandwrittenFace/brand';

/** Three rows is a ranking. Five is a spreadsheet, and the canvas is cut for three. */
const MAX_BOARD_MOVES = 3;
/** The tile grid is two columns wide; a third figure would set all of them shrinking. */
const MAX_TILES = 2;

const SESSION_WORDS = ['NO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'];
const TIMES_WORDS = ['', 'ONCE', 'TWICE'];

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
  /** "WEEK 34 · AUG 17 — 23" */
  range: string;
  /** "2:26" — the biggest legible thing the week did. */
  hero: string;
  /** "HRS MOVING" — rides the hero's baseline, so it has to read as a suffix. */
  heroUnit: string;
  /** "FIVE SESSIONS". Null when the session count IS the hero — never said twice. */
  sessions: string | null;
  /** "COOKED TWICE". Null when no session carried a logged vibe. */
  feltNote: string | null;
  /** The two above on one line — what five of the six skins set under the hero. */
  subline: string | null;
  /** Drives the FELT stamp. Null leaves the stamp off entirely. */
  vibe: PosterVibeKey | null;
  /** Ranked, biggest first. Never includes whatever the hero already said. */
  moves: WeekPosterMove[];
  /** The top row's reps — every bar is a share of the week's own leader, not an absolute. */
  maxReps: number;
  /** Machine totals, each in the unit it was measured in. Never summed, never converted. */
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

function sessionsPhrase(n: number): string {
  const word = n < SESSION_WORDS.length ? SESSION_WORDS[n] : String(n);
  return `${word} SESSION${n === 1 ? '' : 'S'}`;
}

/**
 * How the week felt, said as a count rather than an average.
 *
 * "MOSTLY COOKED" claims something about every session; "COOKED TWICE" claims
 * exactly the two that were logged that way, which is the only version the
 * athlete's own data supports.
 */
function feltPhrase(vibe: PosterVibeKey, count: number): string {
  const label = VIBE[vibe].label;
  if (count < 1) return label;
  return count <= 2 ? `${label} ${TIMES_WORDS[count]}` : `${label} ×${count}`;
}

/**
 * The moves that get the board.
 *
 * Featured families lead — the category ladder exists precisely so 300 double-unders
 * can't outrank 118 cleans. Conditioning is appended rather than dropped, so a week
 * that really was skipping and burpees still gets a board instead of a blank one.
 */
function pickBoard(data: RecapData): RecapMoveStat[] {
  const featured = data.families;
  const rest = data.conditioning.filter((m) => !featured.includes(m));
  return [...featured, ...rest];
}

export function useWeekPosterData(data: RecapData): WeekPosterData {
  return useMemo(() => {
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

    const sessions = heroIsSessions ? null : sessionsPhrase(data.workouts);
    const felt = data.felt[0] ?? null;
    const feltNote = felt ? feltPhrase(felt.vibe, felt.count) : null;
    const subline = [sessions, feltNote].filter((s): s is string => !!s).join(' · ') || null;

    // When the biggest move is already the hero the board starts at the next one,
    // rather than printing the same fact twice.
    const moves = (data.moveMinutes > 0 ? board : rest)
      .slice(0, MAX_BOARD_MOVES)
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
      range: `${data.period} · ${data.periodSub}`,
      hero: hero.value,
      heroUnit: hero.unit,
      sessions,
      feltNote,
      subline,
      vibe: felt?.vibe ?? null,
      moves,
      maxReps: moves[0]?.reps ?? 1,
      tiles,
      brag,
      ep: data.epTotal,
    };
  }, [data]);
}
