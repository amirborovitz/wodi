import { useState, useCallback, type FocusEvent } from 'react';
import type { ParsedMovement, WorkoutFormat } from '../../../types';
import { MovementCard } from './MovementCard';
import { AmrapScoreHero } from './AmrapScoreHero';
import styles from './WodLogger.module.css';

export interface MovementValues {
  weight?: number;
  distance?: number;
  calories?: number;
}

export interface WodLoggerProps {
  /** Workout format determines scoring UI */
  format: WorkoutFormat;
  /** Movements to render */
  movements: ParsedMovement[];
  /** Controlled movement values keyed by movement name */
  movementValues?: Record<string, MovementValues>;
  onMovementChange?: (movementName: string, values: MovementValues) => void;
  /** AMRAP score (rounds completed) */
  amrapScore?: string;
  onAmrapScoreChange?: (value: string) => void;
  /** For Time completion (minutes, seconds) */
  completionMinutes?: string;
  completionSeconds?: string;
  onMinutesChange?: (value: string) => void;
  onSecondsChange?: (value: string) => void;
  /** Generic focus handler for scroll-into-view */
  onInputFocus?: (e: FocusEvent<HTMLInputElement>) => void;
}

export function WodLogger({
  format,
  movements,
  movementValues = {},
  onMovementChange,
  amrapScore = '',
  onAmrapScoreChange,
  completionMinutes,
  completionSeconds,
  onMinutesChange,
  onSecondsChange,
  onInputFocus,
}: WodLoggerProps) {
  // Local fallback state when uncontrolled
  const [localValues, setLocalValues] = useState<Record<string, MovementValues>>({});
  const [localAmrap, setLocalAmrap] = useState('');

  const getValues = (name: string): MovementValues => movementValues[name] ?? localValues[name] ?? {};

  const handleMovementChange = useCallback(
    (name: string, patch: Partial<MovementValues>) => {
      const current = movementValues[name] ?? localValues[name] ?? {};
      const updated = { ...current, ...patch };
      if (onMovementChange) {
        onMovementChange(name, updated);
      } else {
        setLocalValues((prev) => ({ ...prev, [name]: updated }));
      }
    },
    [movementValues, localValues, onMovementChange],
  );

  const amrapValue = onAmrapScoreChange ? amrapScore : localAmrap;
  const setAmrap = onAmrapScoreChange ?? setLocalAmrap;

  const isAmrap = format === 'amrap' || format === 'amrap_intervals';
  const isForTime = format === 'for_time' || format === 'intervals';
  const isEmom = format === 'emom';

  if (movements.length === 0) {
    return <div className={styles.empty}>No movements to log</div>;
  }

  /** Build Rx hint from ParsedMovement */
  const getRxHint = (m: ParsedMovement): string | undefined => {
    if (!m.rxWeights) return undefined;
    const w = m.rxWeights.male ?? m.rxWeights.female;
    return w ? `Rx ${w} ${m.rxWeights.unit}` : undefined;
  };

  return (
    <div className={styles.container}>
      {/* AMRAP: scoring hero at top */}
      {isAmrap && (
        <>
          <AmrapScoreHero
            value={amrapValue}
            onChange={setAmrap}
            onFocus={onInputFocus}
          />
          <div className={styles.divider} />
        </>
      )}

      {/* For Time: time inputs */}
      {isForTime && completionMinutes !== undefined && (
        <div className={styles.scoringSection}>
          <span className={styles.sectionLabel}>Completion Time</span>
          <div className={styles.timeInputRow}>
            <input
              type="number"
              inputMode="numeric"
              placeholder="MM"
              value={completionMinutes}
              onChange={(e) => onMinutesChange?.(e.target.value)}
              onFocus={onInputFocus}
              className={styles.timeInput}
            />
            <span className={styles.timeColon}>:</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="SS"
              value={completionSeconds}
              onChange={(e) => onSecondsChange?.(e.target.value)}
              onFocus={onInputFocus}
              min="0"
              max="59"
              className={styles.timeInput}
            />
          </div>
          <div className={styles.divider} />
        </div>
      )}

      {/* EMOM: label only (per-minute inputs handled by EmomInputs) */}
      {isEmom && (
        <span className={styles.sectionLabel}>Every Minute On the Minute</span>
      )}

      {/* Movement cards */}
      <div className={styles.movementList}>
        <span className={styles.sectionLabel}>Movements</span>
        {movements.map((m, i) => {
          const vals = getValues(m.name);
          return (
            <MovementCard
              key={`${m.name}-${i}`}
              movement={m}
              weight={vals.weight}
              onWeightChange={(v) => handleMovementChange(m.name, { weight: v })}
              distance={vals.distance}
              onDistanceChange={(v) => handleMovementChange(m.name, { distance: v })}
              calories={vals.calories}
              onCaloriesChange={(v) => handleMovementChange(m.name, { calories: v })}
              rxHint={getRxHint(m)}
              onFocus={onInputFocus}
            />
          );
        })}
      </div>
    </div>
  );
}
