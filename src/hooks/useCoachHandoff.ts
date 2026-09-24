import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Workout } from '../types';
import { byNewestTrained, getEffectiveWorkoutDate } from '../utils/workoutDate';
import {
  HANDOFF_QUESTIONS,
  HANDOFF_SCOPE_CHOICE_MIN,
  buildHandoffText,
  dominantUnit,
  handoffScopes,
  scopeWorkouts,
  type HandoffQuestion,
  type HandoffQuestionId,
  type HandoffScope,
  type HandoffScopeId,
} from '../services/export/coachHandoff';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "9 Mar – 20 Sep 2026" — the span the log actually covers, not a range anyone chose. */
function spanLabel(workouts: readonly Workout[]): string | null {
  if (workouts.length === 0) return null;
  const sorted = [...workouts].sort(byNewestTrained);
  const last = getEffectiveWorkoutDate(sorted[0]);
  const first = getEffectiveWorkoutDate(sorted[sorted.length - 1]);
  const day = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return first.getFullYear() === last.getFullYear()
    ? `${day(first)} – ${day(last)} ${last.getFullYear()}`
    : `${day(first)} ${first.getFullYear()} – ${day(last)} ${last.getFullYear()}`;
}

export type HandoffCopyState = 'idle' | 'copied' | 'failed';

export interface CoachHandoffData {
  /** Every workout in the log, for the hero count — never the scoped slice. */
  totalWorkouts: number;
  spanLabel: string | null;
  unit: 'kg' | 'lb';

  questions: readonly HandoffQuestion[];
  question: HandoffQuestion;
  chooseQuestion: (id: HandoffQuestionId) => void;

  scopes: readonly HandoffScope[];
  scope: HandoffScope;
  chooseScope: (id: HandoffScopeId) => void;
  /** False for a short log, where the three spans would name nearly the same list. */
  canChooseScope: boolean;

  /** What the scope currently covers — the number the copied screen reports. */
  scopedCount: number;
  /** The log alone — the question is rendered separately so it can carry the accent. */
  bodyText: string;
  words: number;

  copyState: HandoffCopyState;
  copy: () => Promise<void>;
  reset: () => void;
}

/**
 * Everything the handoff screen renders, computed here so the screen only lays it out.
 *
 * The text is rebuilt whenever the question or the scope changes, because the preview IS the
 * promise: what is shown is what lands on the clipboard, and a preview assembled separately from
 * the copy would eventually disagree with it.
 */
export function useCoachHandoff(workouts: readonly Workout[]): CoachHandoffData {
  const { user } = useAuth();
  const [questionId, setQuestionId] = useState<HandoffQuestionId>('next-block');
  const [scopeId, setScopeId] = useState<HandoffScopeId>('season');
  const [copyState, setCopyState] = useState<HandoffCopyState>('idle');

  const total = workouts.length;
  const canChooseScope = total >= HANDOFF_SCOPE_CHOICE_MIN;
  const scopes = useMemo(() => handoffScopes(total), [total]);

  // A short log gets one span and no choice — and the choice it loses is the default, so the
  // athlete never lands on a scope they did not pick.
  const scope = useMemo(
    () => scopes.find((s) => s.id === (canChooseScope ? scopeId : 'all')) ?? scopes[2],
    [scopes, scopeId, canChooseScope],
  );
  const question = useMemo(
    () => HANDOFF_QUESTIONS.find((q) => q.id === questionId) ?? HANDOFF_QUESTIONS[0],
    [questionId],
  );

  const built = useMemo(
    () => buildHandoffText({
      workouts,
      athlete: user?.displayName?.split(' ')[0],
      question,
      scope,
    }),
    [workouts, user?.displayName, question, scope],
  );

  const scopedCount = useMemo(
    () => scopeWorkouts(workouts, scope.id).length,
    [workouts, scope.id],
  );

  const copy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(built.text);
      setCopyState('copied');
    } catch (error) {
      // No fallback file here: this screen's whole promise is "it is on your clipboard", and a
      // download that lands in Files is a different promise silently substituted for it.
      console.error('Handoff copy failed:', error);
      setCopyState('failed');
    }
  }, [built.text]);

  return {
    totalWorkouts: total,
    spanLabel: useMemo(() => spanLabel(workouts), [workouts]),
    unit: useMemo(() => dominantUnit(workouts), [workouts]),
    questions: HANDOFF_QUESTIONS,
    question,
    chooseQuestion: useCallback((id: HandoffQuestionId) => {
      setQuestionId(id);
      setCopyState('idle');
    }, []),
    scopes,
    scope,
    chooseScope: useCallback((id: HandoffScopeId) => {
      setScopeId(id);
      setCopyState('idle');
    }, []),
    canChooseScope,
    scopedCount,
    bodyText: built.body,
    words: built.words,
    copyState,
    copy,
    reset: useCallback(() => setCopyState('idle'), []),
  };
}
