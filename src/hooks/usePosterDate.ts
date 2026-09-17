import { useRef, useState } from 'react';
import { formatIsoPosterDate } from '../components/celebration/faces/HandwrittenFace/posterData';
import { lightHaptic } from '../utils/haptics';
import { parseSourceDate, stepIsoDate, toIsoDate } from '../utils/workoutDate';

/**
 * The poster's date, edited where it sits.
 *
 * Tapping the date in the poster header opens it as a ‹ date › stepper; each step SAVES — this
 * is a field, not a form, so there is no Done, no Cancel and nothing to lose. A press anywhere
 * outside the stepper closes it. Holding the date opens the platform calendar for the rare
 * week-old session.
 *
 * Why a stepper and not a calendar: people log minutes after training, so the realistic
 * correction is "actually that was yesterday" — one tap. The rare case pays for the calendar,
 * not the common one.
 */

export interface PosterDateEditor {
  /** The trained day on the poster, `YYYY-MM-DD`. */
  iso: string;
  /** Today — the latest a workout can have happened; the calendar's upper bound. */
  latestIso: string;
  editing: boolean;
  /** False at today: a workout cannot be in the future. */
  canStepForward: boolean;
  open: () => void;
  close: () => void;
  step: (days: 1 | -1) => void;
  /** A day chosen on the platform calendar. */
  pick: (iso: string) => void;
  /** The open stepper — a press anywhere outside it closes the editor. */
  pillRef: React.RefObject<HTMLSpanElement | null>;
}

interface UsePosterDateResult {
  editor: PosterDateEditor;
  /**
   * Poster label for the edited date ("SEP 14 26"). Null until the athlete changes it, so an
   * untouched poster renders exactly what the poster builder produced.
   */
  label: string | null;
  /** Attach as `onPointerDownCapture` on the whole screen: a press outside the stepper closes it. */
  onScreenPointerDown: (e: React.PointerEvent) => void;
  /**
   * True — once — when the current tap is the one that closed the stepper. That tap does
   * nothing else on the poster: dismissing the date must never also flip the style.
   */
  takeClosingTap: () => boolean;
}

export function usePosterDate(
  sourceDate: string | undefined,
  loggedDate: Date,
  onSave: (iso: string) => void,
): UsePosterDateResult {
  const [iso, setIso] = useState<string>(() => (
    sourceDate && parseSourceDate(sourceDate) ? sourceDate.trim() : toIsoDate(loggedDate)
  ));
  const [touched, setTouched] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const pillRef = useRef<HTMLSpanElement>(null);
  const closingTapRef = useRef<boolean>(false);

  const latestIso = toIsoDate(new Date());

  const save = (next: string): void => {
    setIso(next);
    setTouched(true);
    onSave(next);
  };

  const step = (days: 1 | -1): void => {
    const next = stepIsoDate(iso, days, latestIso);
    if (!next || next === iso) return;
    save(next);
    lightHaptic();
  };

  const pick = (next: string): void => {
    if (!parseSourceDate(next) || next > latestIso || next === iso) return;
    save(next);
  };

  const onScreenPointerDown = (e: React.PointerEvent): void => {
    closingTapRef.current = false;
    if (!editing) return;
    if (e.target instanceof Node && pillRef.current?.contains(e.target)) return;
    closingTapRef.current = true;
    setEditing(false);
  };

  const takeClosingTap = (): boolean => {
    const closing = closingTapRef.current;
    closingTapRef.current = false;
    return closing;
  };

  return {
    editor: {
      iso,
      latestIso,
      editing,
      canStepForward: iso < latestIso,
      open: () => setEditing(true),
      close: () => setEditing(false),
      step,
      pick,
      pillRef,
    },
    label: touched ? formatIsoPosterDate(iso) : null,
    onScreenPointerDown,
    takeClosingTap,
  };
}
