import { useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult } from './types';
import { getWeightStep } from './types';
import { StepperInput } from './StepperInput';
import { ProgressiveWeightRow } from './ProgressiveWeightRow';
import styles from './LoadInput.module.css';

interface LoadInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
  /** Show implement count toggle (for KB/DB movements) */
  showImplement?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────

function clampWeight(w: number, step = 0.5): number {
  return Math.max(0, Math.round(w / step) * step);
}

function getDefaultWeight(result: StoryExerciseResult): number | undefined {
  return result.exercise.movements?.[0]?.rxWeights?.male;
}

function canUseBodyweightMode(name: string): boolean {
  return /\b(pull[-\s]?up|chin[-\s]?up|dip|muscle[-\s]?up|ring row|inverted row)\b/i.test(name);
}

// ─── Component ──────────────────────────────────────────────────

export function LoadInput({ result, onChange, showImplement = false }: LoadInputProps) {
  const mode = result.loadMode ?? 'same';
  const topTouched = useRef(false);
  const movName = result.exercise?.movements?.[0]?.name ?? result.exercise?.name ?? '';
  const weightStep = getWeightStep(movName, result.implementCount);
  const showBodyweightToggle = mode === 'bodyweight' || canUseBodyweightMode(movName);

  // Detect max set pattern (e.g., [8-6-4-2-max] → repsPerSet has 4 items, setsTotal=5)
  // Also check prescription text for "max" when suggestedRepsPerSet is null (AI may omit it)
  const repsPerSet = result.exercise?.suggestedRepsPerSet;
  const prescriptionText = `${result.exercise?.name ?? ''} ${result.exercise?.prescription ?? ''}`;
  const hasMaxSet = /\bmax\b/i.test(prescriptionText) || !!(repsPerSet && result.setsTotal > repsPerSet.length);
  const shouldUseProgressive = result.setsTotal > 1;

  // Derive display values — fall back to rx weight if no user weight yet
  const startVal = result.weight ?? getDefaultWeight(result) ?? 0;
  const topVal = result.weightEnd ?? startVal;

  const handleStartChange = useCallback((raw: number | undefined) => {
    const clamped = raw != null ? clampWeight(raw, weightStep) : undefined;
    const patch: Partial<StoryExerciseResult> = { weight: clamped };

    // Auto-mirror to Top until user manually edits Top
    if (!topTouched.current) {
      patch.weightEnd = clamped;
      patch.loadMode = 'same';
    } else {
      patch.loadMode = clamped === (result.weightEnd ?? clamped) ? 'same' : 'range';
    }
    onChange(patch);
  }, [onChange, result.weightEnd, weightStep]);

  const handleTopChange = useCallback((raw: number | undefined) => {
    topTouched.current = true;
    const clamped = raw != null ? clampWeight(raw, weightStep) : undefined;
    const currentStart = result.weight ?? 0;
    onChange({
      weightEnd: clamped,
      loadMode: clamped === currentStart ? 'same' : 'range',
    });
  }, [onChange, result.weight, weightStep]);

  const handleTopFocus = useCallback(() => {
    topTouched.current = true;
  }, []);

  const handleProgressiveChange = useCallback((start: number | undefined, peak: number | undefined) => {
    const clampedStart = start != null ? Math.max(0, start) : undefined;
    const clampedPeak = peak != null ? clampWeight(peak, weightStep) : undefined;
    onChange({
      weight: clampedStart,
      weightEnd: clampedPeak,
      loadMode: clampedPeak != null && clampedStart != null && clampedPeak !== clampedStart ? 'range' : 'same',
    });
  }, [onChange, weightStep]);

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
        ) : shouldUseProgressive ? (
          <motion.div
            key="progressive"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            <ProgressiveWeightRow
              weight={(result.weight ?? startVal) || undefined}
              peakWeight={result.weightEnd}
              placeholder={getDefaultWeight(result)}
              setsTotal={result.setsTotal}
              repsPerSet={result.exercise.suggestedReps}
              onChange={handleProgressiveChange}
              label={movName || result.exercise.name}
              footer={hasMaxSet ? (
                <>
                  <StepperInput
                    value={result.maxReps}
                    onChange={(v) => onChange({ maxReps: v != null ? Math.max(0, Math.round(v)) : undefined })}
                    step={1}
                    min={0}
                    max={100}
                    placeholder="0"
                    unit="reps"
                    color="var(--color-volume)"
                    inputMode="numeric"
                  />
                  <StepperInput
                    value={result.maxRepsWeight}
                    onChange={(v) => onChange({ maxRepsWeight: v != null ? Math.max(0, v) : undefined })}
                    step={weightStep}
                    min={0}
                    max={500}
                    placeholder={topVal ? String(Math.round(topVal * 0.6 / weightStep) * weightStep) : '0'}
                    unit="kg"
                    color="var(--color-volume)"
                    inputMode="decimal"
                  />
                </>
              ) : undefined}
            />
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

      {showBodyweightToggle && (
        <button type="button" className={styles.bwPill} onClick={toggleBW}>
          {mode === 'bodyweight' ? 'Use weight' : 'Bodyweight'}
        </button>
      )}

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
