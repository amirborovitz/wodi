import type { Workout } from '../../types';
import { getEffectiveWorkoutDate } from '../../utils/workoutDate';
import { buildWorkoutExport, toAgentText } from './workoutExport';

/**
 * COACH HANDOFF — the athlete's log, addressed to someone.
 *
 * The difference between this and an export is the sentence at the top. A log pasted raw into a
 * chat gets a shrug back; the same log under "write my next 4-week block" gets a block. So the
 * question is not a setting on an export screen, it IS the feature — and the athlete picks it
 * before the text is built, never after.
 *
 * Nothing here sends anything. The clipboard is the whole product, which is why the screen shows
 * the text before it leaves and says so out loud.
 */

/** What the athlete wants back. The chip writes the system prompt so they don't have to. */
export type HandoffQuestionId = 'next-block' | 'weak-link' | 'progress' | 'raw';

export interface HandoffQuestion {
  id: HandoffQuestionId;
  /** Written the way an athlete would actually ask — "Find my weak link", never "Identify weaknesses". */
  chip: string;
  /** Echoed back on the copied screen, so they can see what was asked on their behalf. */
  echo: string;
  /** The line that goes at the top of the paste. Empty for the escape hatch. */
  prompt: string;
}

export const HANDOFF_QUESTIONS: readonly HandoffQuestion[] = [
  {
    id: 'next-block',
    chip: 'Write my next block',
    echo: 'Write my next 4-week block.',
    prompt: "You're my strength & conditioning coach. Read my log and write my next 4-week block. "
      + 'Grill me first if you need to.',
  },
  {
    id: 'weak-link',
    chip: 'Find my weak link',
    echo: 'Find my weak link.',
    prompt: "You're my strength & conditioning coach. Read my log and tell me what I have been "
      + 'avoiding, what is lagging, and what it is costing me. Be blunt.',
  },
  {
    id: 'progress',
    chip: "What's getting better?",
    echo: "What's getting better?",
    prompt: "You're my strength & conditioning coach. Read my log and tell me what has actually "
      + 'improved over this period, with the numbers that show it. Ignore anything the log cannot prove.',
  },
  // The escape hatch: a power user pasting into their own prompt does not want ours on top of it.
  { id: 'raw', chip: 'Just the log', echo: 'No question — just the log.', prompt: '' },
] as const;

/** How much of the log goes over. */
export type HandoffScopeId = 'recent' | 'season' | 'all';

export interface HandoffScope {
  id: HandoffScopeId;
  label: string;
  /** Said in the header of the paste, and on the copied screen. */
  phrase: string;
}

export function handoffScopes(total: number): readonly HandoffScope[] {
  return [
    { id: 'recent', label: 'Last 30 days', phrase: 'last 30 days' },
    { id: 'season', label: 'This season', phrase: 'this season' },
    { id: 'all', label: `All ${total}`, phrase: 'all time' },
  ];
}

/**
 * The season is the calendar quarter — the same one the Season Drop recap already uses, so the
 * word means one thing across the app. It is also the span a coach would actually read: all 130
 * workouts is a wall of text the model truncates, and a truncated log is a wrong answer.
 */
function startOfSeason(now: Date): Date {
  return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
}

function startOfRecent(now: Date): Date {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  from.setDate(from.getDate() - 30);
  return from;
}

/** The workouts a scope covers, by the day they were TRAINED — never the day they were logged. */
export function scopeWorkouts(
  workouts: readonly Workout[],
  scope: HandoffScopeId,
  now: Date = new Date(),
): Workout[] {
  if (scope === 'all') return [...workouts];
  const from = scope === 'season' ? startOfSeason(now) : startOfRecent(now);
  return workouts.filter((workout) => getEffectiveWorkoutDate(workout).getTime() >= from.getTime());
}

/**
 * The unit the log is written in, read off the log itself.
 *
 * There is no unit preference on the profile to read, and inventing one would be worse than
 * looking: every weight already carries the unit the coach wrote, and the header's job is only to
 * tell the model which one it is about to see most of.
 */
export function dominantUnit(workouts: readonly Workout[]): 'kg' | 'lb' {
  let lb = 0;
  let kg = 0;
  for (const workout of workouts) {
    for (const movement of workout.workloadBreakdown?.movements ?? []) {
      if (movement.weight == null) continue;
      if (movement.unit === 'lb') lb += 1;
      else kg += 1;
    }
  }
  return lb > kg ? 'lb' : 'kg';
}

export interface HandoffText {
  /** What lands on the clipboard: the question, then the log. */
  text: string;
  /** The log alone, so the preview can colour the question without slicing the string back apart. */
  body: string;
  /** Shown beside the preview, and again on the copied screen. A length, in a unit people have. */
  words: number;
  workoutCount: number;
}

/**
 * The whole paste: the question, then the log.
 *
 * The log body is `toAgentText` — the same serializer the plain export uses, so there is one
 * answer to "what does wodi's log look like" and the preview cannot drift from the file.
 */
export function buildHandoffText(params: {
  workouts: readonly Workout[];
  athlete?: string;
  question: HandoffQuestion;
  scope: HandoffScope;
  now?: Date;
}): HandoffText {
  const { workouts, athlete, question, scope, now = new Date() } = params;
  const scoped = scopeWorkouts(workouts, scope.id, now);
  const body = toAgentText(
    buildWorkoutExport(scoped, athlete, now),
    { scopeLabel: `${scope.phrase} · ${dominantUnit(scoped)}` },
  );
  const text = question.prompt ? `${question.prompt}\n\n${body}` : body;
  return {
    text,
    body,
    words: text.trim().split(/\s+/).filter(Boolean).length,
    workoutCount: scoped.length,
  };
}

/**
 * Below this, the handoff is hidden entirely.
 *
 * Three workouts produce a bad answer, and a bad answer teaches the athlete the feature does not
 * work — which is a more expensive thing to be wrong about than an empty row.
 */
export const HANDOFF_MIN_WORKOUTS = 5;

/**
 * Below this, the scope control collapses to a single "All {n}".
 *
 * With twelve workouts in the log, "last 30 days" and "this season" and "all" are three names for
 * very nearly the same list, and offering them asks the athlete to choose between identical
 * outcomes.
 */
export const HANDOFF_SCOPE_CHOICE_MIN = 20;
