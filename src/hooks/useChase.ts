import { useCallback, useMemo, useState } from 'react';
import type { Workout } from '../types';
import { buildChaseFacts, type ChaseFact } from '../services/chase/chaseFacts';

const MARKS_KEY = 'wodi_chase_marks';

interface Marks {
  /** Kept on the board: the athlete means to go and do it. */
  saved: string[];
  /** Waved away. It stays gone until the log gives it new evidence. */
  dismissed: string[];
}

function readMarks(): Marks {
  try {
    const raw = localStorage.getItem(MARKS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Marks>;
      return {
        saved: Array.isArray(parsed.saved) ? parsed.saved : [],
        dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed : [],
      };
    }
  } catch {
    // Blocked storage — every thread simply reads as untouched.
  }
  return { saved: [], dismissed: [] };
}

function writeMarks(marks: Marks): void {
  try {
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
  } catch {
    // Same as above: the mark still holds for this session.
  }
}

export interface Chase {
  /** Open threads, newest evidence first. */
  facts: ChaseFact[];
  /** The one Today's line leads with. */
  top: ChaseFact | null;
  isSaved: (id: string) => boolean;
  save: (fact: ChaseFact) => void;
  dismiss: (fact: ChaseFact) => void;
}

/**
 * The Chase list, and what the athlete has done with it.
 *
 * Dismissals live in this browser, not in the log: waving a thread away is a reading
 * preference, and the facts themselves are recomputed from the log every time. A dismissed
 * thread whose evidence changes — a new session on that lift — comes back with a new id.
 */
export function useChase(workouts: readonly Workout[]): Chase {
  const [marks, setMarks] = useState<Marks>(readMarks);

  const facts = useMemo(() => buildChaseFacts(workouts), [workouts]);
  const open = useMemo(
    () => facts.filter((fact) => !marks.dismissed.includes(fact.id)),
    [facts, marks.dismissed],
  );

  const mark = useCallback((key: keyof Marks, id: string) => {
    setMarks((prev) => {
      if (prev[key].includes(id)) return prev;
      const next: Marks = { ...prev, [key]: [...prev[key], id] };
      writeMarks(next);
      return next;
    });
  }, []);

  return {
    facts: open,
    top: open[0] ?? null,
    isSaved: (id) => marks.saved.includes(id),
    save: (fact) => mark('saved', fact.id),
    dismiss: (fact) => mark('dismissed', fact.id),
  };
}
