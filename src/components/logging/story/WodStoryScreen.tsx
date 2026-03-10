import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ParsedWorkout, ExerciseLoggingMode } from '../../../types';
import { ExerciseRow, SectionHeader } from './ExerciseRow';
import {
  type StoryExerciseResult,
  getRowState,
  createBlankResult,
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
// Detect "A) ...", "B) ...", "Part A", etc. in exercise names.

interface ExerciseGroup {
  label: string | null; // null = ungrouped
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
      // Flush previous group
      if (currentIndices.length > 0) {
        groups.push({ label: currentLabel, indices: currentIndices });
      }
      currentLabel = label;
      currentIndices = [i];
    } else {
      currentIndices.push(i);
    }
  });

  // Flush last group
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
  const allFilled = progress.filled === progress.total;

  const handleSave = useCallback(() => {
    if (!isSaving) onSave();
  }, [isSaving, onSave]);

  // One-time hint arrow — plays once, never again
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

  const title = parsedWorkout.title || parsedWorkout.benchmarkName || 'Workout';

  // Format subtitle
  const formatLabel = parsedWorkout.format?.replace(/_/g, ' ').toUpperCase() ?? '';
  const exerciseCount = `${parsedWorkout.exercises.length} exercise${parsedWorkout.exercises.length !== 1 ? 's' : ''}`;

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <button
            type="button"
            className={styles.backButton}
            onClick={onBack}
            aria-label="Go back"
          >
            ←
          </button>

          <div className={styles.progressChips}>
            {results.map((r, i) => {
              const s = getRowState(r);
              const dotClass =
                s === 'filled'  ? styles.progressDotFilled :
                s === 'partial' ? styles.progressDotPartial :
                '';
              return (
                <div
                  key={i}
                  className={`${styles.progressDot} ${dotClass}`}
                />
              );
            })}
            <span className={styles.progressLabel}>
              {progress.filled}/{progress.total}
            </span>
          </div>
        </div>

        <motion.h1
          className={styles.title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {title}
        </motion.h1>

        {formatLabel && (
          <span
            className={styles.formatPill}
            style={{
              '--pill-accent': parsedWorkout.format === 'strength'
                ? 'var(--color-volume)'
                : parsedWorkout.format === 'emom' || parsedWorkout.format === 'intervals'
                  ? 'var(--color-sessions)'
                  : 'var(--color-metcon)',
            } as React.CSSProperties}
          >
            {formatLabel}
          </span>
        )}

        <span className={styles.subtitle}>
          <span>{exerciseCount}</span>
        </span>
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
        {!allFilled && (
          <span className={styles.loggedLabel}>
            {progress.filled}/{progress.total} logged
          </span>
        )}
        <motion.button
          type="button"
          className={`${styles.saveButton} ${canSave ? styles.saveEnabled : styles.saveNotReady}`}
          onClick={handleSave}
          disabled={isSaving}
          whileTap={{ scale: 0.97 }}
        >
          {isSaving ? 'Saving...' : 'Done for today →'}
        </motion.button>
      </div>
    </div>
  );
}

// ─── Helper: initialize results array from parsed workout ───────

export function initStoryResults(
  workout: ParsedWorkout,
  loggingModes: ExerciseLoggingMode[],
  userSex?: 'male' | 'female' | 'other' | 'prefer_not_to_say',
): StoryExerciseResult[] {
  return workout.exercises.map((ex, i) => {
    const mode = ex.loggingMode ?? loggingModes[i] ?? 'strength';
    return createBlankResult(ex, i, mode, userSex);
  });
}
