/**
 * PosterDate — the date in a poster's header, and (on the poster editor only) the control that
 * changes it. The thing you touch is the thing you edit: no tab, no sheet, no modal.
 *
 *   resting → the date; a dotted underline is its only affordance
 *   tapped  → ‹ date › in the same slot; each arrow steps one day and saves
 *   held    → the platform calendar, capped at today, for the rare week-old session
 *
 * With no PosterDateContext (thumbnails, feed, post preview) it is the plain span it replaced.
 * The editing chrome is marked `data-editor-only`, so a share capture never prints it.
 */

import React, { useContext, useRef } from 'react';
import { useLongPress } from '../../../../hooks/useLongPress';
import type { PosterDateEditor } from '../../../../hooks/usePosterDate';
import { PosterDateContext } from './posterDateContext';
import styles from './PosterDate.module.css';

// Long enough that a tap never reads as a hold; short enough that a deliberate hold feels quick.
const CALENDAR_HOLD_MS = 400;

interface PosterDateProps {
  date: string;
  /** The skin's own date type — font, size, colour, tracking. */
  style?: React.CSSProperties;
  /** Light-surface skins get an ink stepper: yellow on cream or on the yellow flare disappears. */
  surface?: 'dark' | 'light';
}

export function PosterDate({ date, style, surface = 'dark' }: PosterDateProps): React.JSX.Element {
  const editor = useContext(PosterDateContext);
  if (!editor) return <span style={style}>{date}</span>;
  return <EditablePosterDate editor={editor} date={date} style={style} surface={surface} />;
}

// Touches on the date never reach the poster underneath: a tap there must not flip the style,
// and a press there must not start a carousel swipe.
function keepFromPoster(e: React.SyntheticEvent): void {
  e.stopPropagation();
}

function openCalendar(input: HTMLInputElement | null): void {
  if (!input) return;
  try {
    input.showPicker();
  } catch {
    // No showPicker (older Safari) or refused — focusing a date input opens its picker instead.
    input.focus();
  }
}

interface EditablePosterDateProps {
  editor: PosterDateEditor;
  date: string;
  style: React.CSSProperties | undefined;
  surface: 'dark' | 'light';
}

function EditablePosterDate({ editor, date, style, surface }: EditablePosterDateProps): React.JSX.Element {
  const calendarRef = useRef<HTMLInputElement>(null);
  // Opens on RELEASE after the hold: a touch only grants a picker permission when the finger
  // lifts, so opening while it is still down would be refused.
  const { handlers, consumeLongPress } = useLongPress<null>(
    () => openCalendar(calendarRef.current),
    { delay: CALENDAR_HOLD_MS, fireOnRelease: true },
  );

  const resting = (
    <button
      type="button"
      className={styles.trigger}
      style={style}
      {...handlers(null)}
      onTouchStart={keepFromPoster}
      onClick={(e) => {
        e.stopPropagation();
        if (consumeLongPress()) return;
        editor.open();
      }}
      aria-label={`Workout date ${date}. Tap to change, hold for a calendar`}
    >
      {date}
      <span className={styles.underline} aria-hidden="true" data-editor-only />
    </button>
  );

  const stepper = (
    <span
      ref={editor.pillRef}
      className={styles.pill}
      data-surface={surface}
      // The skin's type, so the label is the same characters it was at rest — only the colour
      // becomes the stepper's.
      style={{ ...style, color: undefined }}
      onTouchStart={keepFromPoster}
      onClick={keepFromPoster}
      onKeyDown={(e) => { if (e.key === 'Escape') editor.close(); }}
      role="group"
      aria-label="Workout date"
    >
      <button
        type="button"
        className={`${styles.arrow} ${styles.arrowBack}`}
        onClick={() => editor.step(-1)}
        aria-label="One day earlier"
      >
        ‹
      </button>
      <span
        className={styles.label}
        {...handlers(null)}
        onClick={() => { consumeLongPress(); }}
        aria-live="polite"
      >
        {date}
      </span>
      <button
        type="button"
        className={`${styles.arrow} ${styles.arrowForward}`}
        onClick={() => editor.step(1)}
        disabled={!editor.canStepForward}
        aria-label="One day later"
      >
        ›
      </button>
    </span>
  );

  return (
    <span className={styles.slot} data-editing={editor.editing || undefined}>
      {editor.editing ? stepper : resting}
      {/* A sibling of both states, so a calendar opened from the stepper survives it closing. */}
      <input
        ref={calendarRef}
        type="date"
        className={styles.calendar}
        value={editor.iso}
        max={editor.latestIso}
        onChange={(e) => editor.pick(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        data-editor-only
      />
    </span>
  );
}
