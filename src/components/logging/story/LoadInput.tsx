import { useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult } from './types';
import { getWeightStep } from './types';
import { StepperInput } from './StepperInput';
import styles from './LoadInput.module.css';

interface LoadInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
  /** Show implement count toggle (for KB/DB movements) */
  showImplement?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────

function clampWeight(w: number): number {
  return Math.max(0, Math.round(w * 2) / 2); // round to 0.5kg
}

function getDefaultWeight(result: StoryExerciseResult): number | undefined {
  return result.exercise.movements?.[0]?.rxWeights?.male;
}

// ─── Component ──────────────────────────────────────────────────

export function LoadInput({ result, onChange, showImplement = false }: LoadInputProps) {
  const mode = result.loadMode ?? 'same';
  const topTouched = useRef(false);
  const movName = result.exercise?.movements?.[0]?.name ?? result.exercise?.name ?? '';
  const weightStep = getWeightStep(movName, result.implementCount);

  // Detect max set pattern (e.g., [8-6-4-2-max] → repsPerSet has 4 items, setsTotal=5)
  const repsPerSet = result.exercise?.suggestedRepsPerSet;
  const hasMaxSet = !!(repsPerSet && result.setsTotal > repsPerSet.length);

  // Derive display values — fall back to rx weight if no user weight yet
  const startVal = result.weight ?? getDefaultWeight(result) ?? 0;
  const topVal = result.weightEnd ?? startVal;

  const handleStartChange = useCallback((raw: number | undefined) => {
    const clamped = raw != null ? clampWeight(raw) : undefined;
    const patch: Partial<StoryExerciseResult> = { weight: clamped };

    // Auto-mirror to Top until user manually edits Top
    if (!topTouched.current) {
      patch.weightEnd = clamped;
      patch.loadMode = 'same';
    } else {
      patch.loadMode = clamped === (result.weightEnd ?? clamped) ? 'same' : 'range';
    }
    onChange(patch);
  }, [onChange, result.weightEnd]);

  const handleTopChange = useCallback((raw: number | undefined) => {
    topTouched.current = true;
    const clamped = raw != null ? clampWeight(raw) : undefined;
    const currentStart = result.weight ?? 0;
    onChange({
      weightEnd: clamped,
      loadMode: clamped === currentStart ? 'same' : 'range',
    });
  }, [onChange, result.weight]);

  const handleTopFocus = useCallback(() => {
    topTouched.current = true;
  }, []);

  const toggleBW = useCallback(() => {
    if (mode === 'bodyweight') {
      onChange({ loadMode: 'same' });
    } else {
      onChange({ loadMode: 'bodyweight' });
    }
  }, [mode, onChange]);

  const isSynced = startVal === topVal;

  return (
    <div className={styles.container}>
      <AnimatePresence mode="wait">
        {mode === 'bodyweight' ? (
          <motion.div
            key="bw"
            className={styles.bwBanner}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            <span className={styles.bwText}>Bodyweight</span>
          </motion.div>
        ) : (
          <motion.div
            key="inputs"
            className={styles.dualRow}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            {/* Start field with stepper */}
            <StepperInput
              value={startVal || undefined}
              onChange={handleStartChange}
              step={weightStep}
              min={0}
              max={500}
              placeholder="0"
              unit="kg"
              label="Start"
              color="var(--color-volume)"
              inputMode="decimal"
            />

            {/* Sync icon */}
            <AnimatePresence mode="wait">
              <motion.span
                key={isSynced ? 'eq' : 'arrow'}
                className={`${styles.syncIcon} ${!isSynced ? styles.syncIconActive : ''}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                {isSynced ? '=' : '→'}
              </motion.span>
            </AnimatePresence>

            {/* Top field with stepper */}
            <StepperInput
              value={topVal || undefined}
              onChange={(v) => { handleTopFocus(); handleTopChange(v); }}
              step={weightStep}
              min={0}
              max={500}
              placeholder="0"
              unit="kg"
              label="Top"
              color="var(--color-volume)"
              inputMode="decimal"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* BW toggle pill */}
      <button type="button" className={styles.bwPill} onClick={toggleBW}>
        {mode === 'bodyweight' ? 'Use weight' : 'Bodyweight'}
      </button>

      {/* Implement count (KB/DB) */}
      {showImplement && mode !== 'bodyweight' && (
        <div className={styles.implementRow}>
          <span className={styles.implementLabel}>Implements</span>
          <div className={styles.implementToggle}>
            {([1, 2] as const).map((count) => (
              <button
                key={count}
                type="button"
                className={`${styles.implementBtn} ${(result.implementCount ?? 1) === count ? styles.implementBtnActive : ''}`}
                onClick={() => onChange({ implementCount: count })}
              >
                {count}x
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Max reps set (for [8-6-4-2-max] patterns) */}
      {hasMaxSet && mode !== 'bodyweight' && (
        <div className={styles.maxSection}>
          <span className={styles.maxLabel}>Max set</span>
          <div className={styles.maxRow}>
            <StepperInput
              value={result.maxReps}
              onChange={(v) => onChange({ maxReps: v != null ? Math.max(0, Math.round(v)) : undefined })}
              step={1}
              min={0}
              max={100}
              placeholder="0"
              unit="reps"
              label="Reps"
              color="var(--color-volume)"
              inputMode="numeric"
            />
            <StepperInput
              value={result.maxRepsWeight}
              onChange={(v) => onChange({ maxRepsWeight: v != null ? clampWeight(v) : undefined })}
              step={weightStep}
              min={0}
              max={500}
              placeholder={topVal ? String(Math.round(topVal * 0.6 * 2) / 2) : '0'}
              unit="kg"
              label="Weight"
              color="var(--color-volume)"
              inputMode="decimal"
            />
          </div>
        </div>
      )}
    </div>
  );
}
