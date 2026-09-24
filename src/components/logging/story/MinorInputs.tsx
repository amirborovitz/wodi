import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StoryExerciseResult } from './types';
import type { MeasurementUnit } from '../../../types';
import { StepperInput } from './StepperInput';
import styles from './MinorInputs.module.css';
import { coreTabataDoseSeconds, formatDoseMinutes, TABATA_PROTOCOL_LABEL } from '../../../utils/coreTabata';

// ═══════════════════════════════════════════════════════════════════
// DurationInput — seconds stepper + quick-pick chips
// For: plank holds, hollow rocks, L-sits, etc.
// ═══════════════════════════════════════════════════════════════════

interface DurationInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];
const DURATION_STEP = 5;

export function DurationInput({ result, onChange }: DurationInputProps) {
  const seconds = result.durationSeconds ?? 0;

  const adjust = useCallback((delta: number) => {
    onChange({ durationSeconds: Math.max(0, seconds + delta) });
  }, [seconds, onChange]);

  return (
    <div className={styles.center}>
      <div className={styles.durationStepperRow}>
        <button type="button" className={styles.durationBtn} onClick={() => adjust(-DURATION_STEP)}>−</button>
        <div className={styles.durationDisplay}>
          <AnimatePresence mode="popLayout">
            <motion.span
              key={seconds}
              className={styles.durationNumber}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              {seconds}
            </motion.span>
          </AnimatePresence>
          <div className={styles.durationUnit}>seconds</div>
        </div>
        <button type="button" className={styles.durationBtn} onClick={() => adjust(DURATION_STEP)}>+</button>
      </div>

      <div className={styles.quickChips}>
        {DURATION_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className={`${styles.quickChip} ${seconds === p ? styles.quickChipActive : ''}`}
            onClick={() => onChange({ durationSeconds: p })}
          >
            {p}s
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DistanceInput — numeric input + unit toggle (m / km / mi)
// For: runs, rows, bike, carries
// ═══════════════════════════════════════════════════════════════════

interface DistanceInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

const DISTANCE_UNITS: { value: MeasurementUnit; label: string }[] = [
  { value: 'm', label: 'm' },
  { value: 'km', label: 'km' },
  { value: 'mi', label: 'mi' },
  { value: 'cal', label: 'cal' },
];

const DISTANCE_PRESETS_M = [50, 100, 200, 400, 800];
const DISTANCE_PRESETS_KM = [1, 2, 5, 10];
const DISTANCE_PRESETS_CAL = [10, 15, 20, 25, 30, 50];

export function DistanceInput({ result, onChange }: DistanceInputProps) {
  // Auto-detect calorie unit from exercise movements
  const defaultUnit = (() => {
    const movements = result.exercise?.movements;
    if (movements?.some(m => m.inputType === 'calories' || (m.calories != null && m.calories > 0))) {
      return 'cal' as MeasurementUnit;
    }
    return 'm' as MeasurementUnit;
  })();
  const unit = result.distanceUnit ?? defaultUnit;
  const presets = unit === 'm' ? DISTANCE_PRESETS_M : unit === 'km' ? DISTANCE_PRESETS_KM : unit === 'cal' ? DISTANCE_PRESETS_CAL : [];

  // Step size depends on unit
  const step = unit === 'm' ? 50 : unit === 'km' ? 0.5 : unit === 'mi' ? 0.1 : 1;
  const color = 'var(--color-metcon)';

  // Prefill from prescription if available
  const prescribedDistance = result.exercise?.movements?.[0]?.distance;
  const placeholder = prescribedDistance ? String(prescribedDistance) : '0';

  const handleValueChange = useCallback((value: number | undefined) => {
    onChange({ distanceValue: value });
  }, [onChange]);

  return (
    <div className={styles.center}>
      <StepperInput
        value={result.distanceValue}
        onChange={handleValueChange}
        step={step}
        min={0}
        placeholder={placeholder}
        unit={unit}
        color={color}
        inputMode="decimal"
      />

      <div className={styles.unitToggle}>
        {DISTANCE_UNITS.map((u) => (
          <button
            key={u.value}
            type="button"
            className={`${styles.unitBtn} ${unit === u.value ? styles.unitBtnActive : ''}`}
            onClick={() => onChange({ distanceUnit: u.value })}
          >
            {u.label}
          </button>
        ))}
      </div>

      {presets.length > 0 && (
        <div className={styles.quickChips}>
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className={`${styles.quickChip} ${result.distanceValue === p ? styles.quickChipActive : ''}`}
              onClick={() => onChange({ distanceValue: p })}
            >
              {p}{unit}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
// ═══════════════════════════════════════════════════════════════════
// NoteInput — simple textarea fallback
// ═══════════════════════════════════════════════════════════════════

interface NoteInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

export function NoteInput({ result, onChange }: NoteInputProps) {
  return (
    <div className={styles.noteContainer}>
      <textarea
        className={styles.noteTextarea}
        value={result.notes ?? ''}
        placeholder="How did it go?"
        onChange={(e) => onChange({ notes: e.target.value })}
      />
      <p className={styles.noteHint}>Freeform notes for this exercise</p>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// FixedDoseInput — for a block whose DOSE is the whole record
// For: core tabata. Nothing is collected here, on purpose.
// ═══════════════════════════════════════════════════════════════════

interface FixedDoseInputProps {
  result: StoryExerciseResult;
}

/**
 * The screen a core tabata gets: the four minutes, stated, and nothing to type.
 *
 * It still exists rather than being skipped, because the athlete is the only one who knows
 * whether they actually did the cash-out — "Mark as done" and the skip path in the wizard
 * footer are the two answers this screen takes, and both are already there.
 *
 * The movement list under the dose is the board's own, shown so the athlete can see what Wodi
 * read. It is absent when the coach named nothing, which is the honest rendering of a board
 * that said only "Core TABATA" — never a placeholder movement standing in for one.
 */
export function FixedDoseInput({ result }: FixedDoseInputProps) {
  const seconds = coreTabataDoseSeconds(result.exercise);
  const named = (result.exercise.movements ?? [])
    .map((movement) => movement.name?.trim())
    .filter((name): name is string => !!name && !/^cash[- ]?out/i.test(name));

  return (
    <div className={styles.center}>
      <div className={styles.doseEyebrow}>Nothing to log</div>
      <div className={styles.doseValue}>{formatDoseMinutes(seconds)}</div>
      <div className={styles.doseProtocol}>{TABATA_PROTOCOL_LABEL}</div>
      {named.length > 0 && <p className={styles.doseBoard}>{named.join(' · ')}</p>}
    </div>
  );
}
