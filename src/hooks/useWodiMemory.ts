import { useMemo } from 'react';
import { useWodiNotes } from './useWodiNotes';
import { swapHabits } from '../services/wodiAgent/athleteHabits';
import type { Workout } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "24 Sep" from "2026-09-24". */
function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : iso;
}

export interface WodiMemoryData {
  notes: { id: string; text: string; since: string }[];
  /** Read off the log, never stored — shown so the athlete can see what Wodi will offer. */
  habits: { id: string; label: string; detail: string }[];
  forget: (id: string) => void;
}

/** Everything Wodi knows about the athlete, for the "What Wodi knows" card on Me. */
export function useWodiMemory(workouts: readonly Workout[]): WodiMemoryData {
  const { notes, forget } = useWodiNotes();

  const habits = useMemo(() => [...swapHabits(workouts).entries()].map(([key, h]) => ({
    id: key,
    label: `${h.movement} → ${h.usually}`,
    detail: `${h.times} of your last ${h.seen} · last ${dayLabel(h.lastDate)}`,
  })), [workouts]);

  return {
    notes: notes.map((n) => ({ id: n.id, text: n.text, since: dayLabel(n.createdAt) })),
    habits,
    forget: (id) => {
      forget(id).catch((err: unknown) => console.error('[WodiMemory] could not forget the note', err));
    },
  };
}
