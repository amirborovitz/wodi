import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMilestone } from './useMilestone';
import { useChase } from './useChase';
import { usePosterPayload } from './usePosterPayload';
import type { WorkoutWithStats } from './useWorkouts';
import { buildWodiMessage, type WodiMessage } from '../services/wodiAgent/wodiMessage';
import { pickOccasion, whenWord, type OccasionWorkout, type WodiOccasion } from '../services/wodiAgent/wodiOccasion';
import { writeWodiLine } from '../services/wodiAgent/wodiLine';
import { appendThread, fetchRecentThread } from '../services/wodiAgent/threadStore';
import type { ThreadMessage } from '../services/wodiAgent/threadItems';
import { firstMeasured } from '../services/wodiAgent/wodiVoice';
import { getEffectiveWorkoutDate, toIsoDate } from '../utils/workoutDate';
import { liftFamilyKey } from '../utils/lastLoadHistory';

export interface WodiMessageData extends WodiMessage {
  /** The poster the message's day points at — tapping that word opens it. */
  dayWorkout: WorkoutWithStats | null;
  /** Wodi is still finding its words — show "typing", not a line that's about to change. */
  pending: boolean;
  /** The thread message these words are kept as, when they're Wodi's own line. */
  threadId: string | null;
  /** The workout this line cheers — a poster just logged, drawn big under the line with Share. */
  cheered: WorkoutWithStats | null;
}

/** How far back "already said" looks. Wodi says a line or two a day; questions add a few more. */
const SAID_LOOKBACK = 200;

/**
 * One write per occasion, even when Today and the chat both ask at once — and it finishes even if
 * the screen that asked is gone, so the line is kept either way.
 */
const writing = new Map<string, Promise<ThreadMessage>>();

function sayOnce(userId: string, occasion: WodiOccasion): Promise<ThreadMessage> {
  const running = writing.get(occasion.key);
  if (running) return running;
  const job = writeWodiLine(occasion).then(async (text) => {
    const message: ThreadMessage = {
      id: occasion.key,
      from: 'wodi',
      text,
      at: Date.now(),
      ...(occasion.workoutId ? { workoutIds: [occasion.workoutId] } : {}),
    };
    await appendThread(userId, [message]).catch((err: unknown) => console.error('[WodiMessage] could not keep the line', err));
    return message;
  });
  writing.set(occasion.key, job);
  return job;
}

function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * Wodi's newest message, from the athlete's log — the line the chat opens on.
 * A workout just logged gets a cheer; some days Wodi brings something up on its own
 * (wodiOccasion.ts); otherwise the plain recognition line (wodiMessage.ts).
 * `workouts` newest trained first (as useWorkouts returns them).
 */
export function useWodiMessage(workouts: readonly WorkoutWithStats[]): WodiMessageData {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const notes = user?.wodiNotes;
  const milestone = useMilestone(workouts);
  const chase = useChase(workouts);
  const latest = workouts[0];
  // The last workout is said with its poster's own result — the same number the poster prints.
  const latestPoster = usePosterPayload(latest);
  const lead = latestPoster?.wods[0];
  const latestResult = lead && !lead.result.scores ? lead.result.value || null : null;

  // What Wodi has already said on its own, by id. Null until read.
  const [said, setSaid] = useState<Map<string, ThreadMessage> | null>(null);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetchRecentThread(userId, SAID_LOOKBACK)
      .then((messages) => { if (live) setSaid(new Map(messages.map((m) => [m.id, m]))); })
      .catch((err: unknown) => {
        console.error('[WodiMessage] could not read what was said', err);
        if (live) setSaid(new Map());
      });
    return () => { live = false; };
  }, [userId]);

  const pick = useMemo(() => {
    if (!said) return null;
    const today = toIsoDate(new Date());
    const occasionWorkouts = workouts.map((w, i): OccasionWorkout => ({
      id: w.id,
      title: w.title,
      trained: toIsoDate(getEffectiveWorkoutDate(w)),
      result: i === 0 ? latestResult : null,
      minutes: w.duration ?? null,
      felt: w.posterVibe ?? null,
      isPR: Boolean(w.isPR),
      teamSize: w.teamSize ?? 1,
    }));
    return pickOccasion({
      workouts: occasionWorkouts,
      milestone,
      chase: chase.facts,
      notes: notes ?? [],
      said,
      today,
      todayStartMs: startOfToday(),
    });
  }, [said, workouts, latestResult, milestone, chase.facts, notes]);

  // A new occasion is written once and kept; until then Wodi is typing.
  const [written, setWritten] = useState<ThreadMessage | null>(null);
  const newOccasion = pick?.kind === 'new' ? pick.occasion : null;
  useEffect(() => {
    if (!newOccasion || !userId) return;
    let live = true;
    void sayOnce(userId, newOccasion).then((message) => {
      if (!live) return;
      setWritten(message);
      setSaid((prev) => new Map(prev ?? []).set(message.id, message));
    });
    return () => { live = false; };
  }, [newOccasion?.key, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo((): WodiMessageData => {
    const ownLine = pick?.kind === 'said' ? pick.message
      : pick?.kind === 'new' && written?.id === pick.occasion.key ? written
      : null;
    if (userId && (!pick || (pick.kind === 'new' && !ownLine))) {
      return { text: '', highlight: null, day: null, dayWorkout: null, pending: true, threadId: null, cheered: null };
    }
    if (ownLine) return ownLineMessage(ownLine, workouts);

    const message = buildWodiMessage({ milestone, chase: chase.facts, today: toIsoDate(new Date()) });
    return { ...message, dayWorkout: dayWorkoutFor(message, workouts), pending: false, threadId: null, cheered: null };
  }, [pick, written, userId, milestone, chase.facts, workouts]);
}

/**
 * One of Wodi's own lines, as a message. Its key value is the first measured one it says; the
 * poster it's about opens from that workout's name — or its day — wherever the line says it.
 */
function ownLineMessage(line: ThreadMessage, workouts: readonly WorkoutWithStats[]): WodiMessageData {
  const workout = line.workoutIds?.[0] ? workouts.find((w) => w.id === line.workoutIds![0]) ?? null : null;
  const cheered = workout && line.id.startsWith('cheer:') ? workout : null;
  const base = { text: line.text, highlight: firstMeasured(line.text), pending: false, threadId: line.id, cheered };
  if (!workout) return { ...base, day: null, dayWorkout: null };
  const trained = toIsoDate(getEffectiveWorkoutDate(workout));
  const lower = line.text.toLowerCase();
  const title = workout.title.trim();
  const titleAt = title ? lower.indexOf(title.toLowerCase()) : -1;
  const when = whenWord(trained, toIsoDate(new Date()));
  const whenAt = lower.indexOf(when.toLowerCase());
  const label = titleAt >= 0 ? line.text.slice(titleAt, titleAt + title.length)
    : whenAt >= 0 ? line.text.slice(whenAt, whenAt + when.length)
    : null;
  return {
    ...base,
    day: label ? { label, iso: trained, subject: null, workoutId: workout.id } : null,
    dayWorkout: label ? workout : null,
  };
}

/** The poster a plain message's day points at. */
function dayWorkoutFor(message: WodiMessage, workouts: readonly WorkoutWithStats[]): WorkoutWithStats | null {
  const day = message.day;
  if (!day) return null;
  if (day.workoutId) return workouts.find((w) => w.id === day.workoutId) ?? null;
  const sameDay = workouts.filter((w) => toIsoDate(getEffectiveWorkoutDate(w)) === day.iso);
  // The session that has the lift the message is about; a day with one session is that one.
  const subject = day.subject ?? '';
  const family = liftFamilyKey(subject);
  return sameDay.find((w) => (w.workloadBreakdown?.movements ?? [])
    .some((m) => liftFamilyKey(m.name) === family || m.name.toLowerCase().includes(subject.toLowerCase())))
    ?? (sameDay.length === 1 ? sameDay[0] : null);
}
