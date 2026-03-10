import { useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult } from './types';
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
              step={2.5}
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
              step={2.5}
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
    </div>
  );
}
