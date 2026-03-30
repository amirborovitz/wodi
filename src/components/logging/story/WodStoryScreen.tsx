import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ParsedWorkout, ExerciseLoggingMode } from '../../../types';
import { ExerciseRow, SectionHeader } from './ExerciseRow';
import {
  type StoryExerciseResult,
  getRowState,
  createBlankResult,
  isResultEmpty,
  getMissingLabel,
} from './types';
import styles from './WodStoryScreen.module.css';

// ─── Props ──────────────────────────────────────────────────────

interface WodStoryScreenProps {
  parsedWorkout: ParsedWorkout;
  results: StoryExerciseResult[];
  onResultChange: (index: number, result: StoryExerciseResult) => void;
  onEditExercise: (index: number) => void;
  onSave: () => void;
  onBack: () => void;
  /** Override logging modes (from AI guidance or user override) */
  loggingModes?: ExerciseLoggingMode[];
  isSaving?: boolean;
}

// ─── Section grouping ───────────────────────────────────────────

interface ExerciseGroup {
  label: string | null;
  indices: number[];
}

const PART_PATTERN = /^(?:part\s+)?([A-Z])[).:\s-]/i;

function groupExercises(workout: ParsedWorkout): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  let currentLabel: string | null = null;
  let currentIndices: number[] = [];

  workout.exercises.forEach((ex, i) => {
    const match = ex.name.match(PART_PATTERN);
    const label = match ? match[1].toUpperCase() : null;

    if (label !== currentLabel && label != null) {
      if (currentIndices.length > 0) {
        groups.push({ label: currentLabel, indices: currentIndices });
      }
      currentLabel = label;
      currentIndices = [i];
    } else {
      currentIndices.push(i);
    }
  });

  if (currentIndices.length > 0) {
    groups.push({ label: currentLabel, indices: currentIndices });
  }

  return groups;
}

// ─── Progress calculation ───────────────────────────────────────

interface StoryProgress {
  filled: number;
  partial: number;
  total: number;
}

function calcProgress(results: StoryExerciseResult[]): StoryProgress {
  let filled = 0;
  let partial = 0;
  for (const r of results) {
    const s = getRowState(r);
    if (s === 'filled') filled++;
    else if (s === 'partial') partial++;
  }
  return { filled, partial, total: results.length };
}

// ─── Format label helper ────────────────────────────────────────

function getFormatDisplay(format?: string): string {
  if (!format) return '';
  return format.replace(/_/g, ' ').toUpperCase();
}

function getFormatColor(format?: string): string {
  if (format === 'strength') return 'var(--color-volume)';
  if (format === 'emom' || format === 'intervals') return 'var(--color-sessions)';
  return 'var(--color-metcon)';
}

// ─── Derive a meaningful title ──────────────────────────────────
// If exercise names are just the format name, skip the title to avoid repetition.

function deriveTitle(workout: ParsedWorkout): string | null {
  const names = workout.exercises.map(e => e.name);
  const format = getFormatDisplay(workout.format);

  // If all exercise names match the format label, don't show a separate title
  const allMatchFormat = names.every(n =>
    n.toUpperCase().replace(/[^A-Z]/g, '') === format.replace(/[^A-Z]/g, '')
  );
  if (allMatchFormat) return null;

  const joined = names.join(' & ');
  return joined || null;
}

// ─── Component ──────────────────────────────────────────────────

export function WodStoryScreen({
  parsedWorkout,
  results,
  onEditExercise,
  onSave,
  onBack,
  isSaving = false,
}: WodStoryScreenProps) {
  const groups = useMemo(() => groupExercises(parsedWorkout), [parsedWorkout]);
  const progress = useMemo(() => calcProgress(results), [results]);

  const canSave = progress.filled > 0 || progress.partial > 0;
  const allDone = progress.filled === progress.total && progress.total > 0;
  const progressPercent = progress.total > 0
    ? ((progress.filled + progress.partial * 0.5) / progress.total) * 100
    : 0;

  const [missingPopup, setMissingPopup] = useState<{ label: string } | null>(null);

  const handleSave = useCallback(() => {
    if (isSaving) return;
    const emptyResult = results.find(r => isResultEmpty(r));
    if (emptyResult) {
      setMissingPopup({ label: getMissingLabel(emptyResult.kind) });
      return;
    }
    onSave();
  }, [isSaving, results, onSave]);

  // One-time hint arrow
  const HINT_KEY = 'wodi_story_hint_shown';
  const [showHint, setShowHint] = useState(() => {
    try { return !localStorage.getItem(HINT_KEY); } catch { return false; }
  });

  useEffect(() => {
    if (showHint && results.length > 0) {
      try { localStorage.setItem(HINT_KEY, '1'); } catch { /* noop */ }
      const timer = setTimeout(() => setShowHint(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showHint, results.length]);

  const title = deriveTitle(parsedWorkout);
  const formatLabel = getFormatDisplay(parsedWorkout.format);
  const formatColor = getFormatColor(parsedWorkout.format);

  // CTA label
  const ctaLabel = isSaving
    ? 'Saving...'
    : allDone
      ? 'Save workout'
      : canSave
        ? 'Save workout'
        : 'Log results to save';

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <button
            type="button"
            className={styles.backButton}
            onClick={onBack}
            aria-label="Go back"
          >
            ←
          </button>

          {formatLabel && (
            <span
              className={styles.formatPill}
              style={{ '--pill-accent': formatColor } as React.CSSProperties}
            >
              {formatLabel}
            </span>
          )}

          <div className={styles.progressBar} style={{ '--progress-color': formatColor } as React.CSSProperties}>
            <div className={styles.progressTrack}>
              <motion.div
                className={styles.progressFill}
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <span className={styles.progressLabel}>
              {progress.filled}/{progress.total}
            </span>
          </div>
        </div>

        {title && (
          <div className={styles.titleArea}>
            <motion.h1
              className={styles.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              {title}
            </motion.h1>
          </div>
        )}
      </div>

      {/* ── Exercise List ── */}
      <div className={styles.exerciseList} style={{ position: 'relative' }}>
        <AnimatePresence>
          {showHint && results.length > 0 && (
            <motion.div
              className={styles.hintArrow}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.span
                animate={{ x: [0, 6, 0] }}
                transition={{ duration: 1, repeat: 2, ease: 'easeInOut' }}
              >
                →
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {groups.map((group) => (
            <div key={group.label ?? 'ungrouped'}>
              {group.label && (
                <SectionHeader label={`Part ${group.label}`} />
              )}
              {group.indices.map((idx) => {
                const result = results[idx];
                if (!result) return null;
                return (
                  <ExerciseRow
                    key={idx}
                    result={result}
                    index={idx}
                    onEdit={() => onEditExercise(idx)}
                  />
                );
              })}
            </div>
          ))}
        </AnimatePresence>

        {results.length === 0 && (
          <p className={styles.emptyHint}>
            No exercises found in this workout.
          </p>
        )}
      </div>

      {/* ── Save CTA ── */}
      <div className={styles.saveDock}>
        <motion.button
          type="button"
          className={`${styles.saveButton} ${canSave ? styles.saveEnabled : styles.saveNotReady}`}
          onClick={handleSave}
          disabled={isSaving || !canSave}
          whileTap={canSave ? { scale: 0.97 } : undefined}
        >
          {ctaLabel}
        </motion.button>
      </div>

      {/* ── Missing data confirmation popup ── */}
      <AnimatePresence>
        {missingPopup && (
          <motion.div
            className={styles.popupBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setMissingPopup(null)}
          >
            <motion.div
              className={styles.popupCard}
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className={styles.popupTitle}>No {missingPopup.label} entered</p>
              <p className={styles.popupBody}>
                Save without it, or go back and add it?
              </p>
              <div className={styles.popupActions}>
                <button
                  type="button"
                  className={styles.popupBtnSecondary}
                  onClick={() => setMissingPopup(null)}
                >
                  Go back
                </button>
                <button
                  type="button"
                  className={styles.popupBtnPrimary}
                  onClick={() => { setMissingPopup(null); onSave(); }}
                >
                  Save anyway
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Helper: initialize results array from parsed workout ───────

export function initStoryResults(
  workout: ParsedWorkout,
  loggingModes: ExerciseLoggingMode[],
  userSex?: 'male' | 'female' | 'other' | 'prefer_not_to_say',
  teamSize?: number,
): StoryExerciseResult[] {
  return workout.exercises.map((ex, i) => {
    const mode = ex.loggingMode ?? loggingModes[i] ?? 'strength';
    return createBlankResult(ex, i, mode, userSex, teamSize);
  });
}
