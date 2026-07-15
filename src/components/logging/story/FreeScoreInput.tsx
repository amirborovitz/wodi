import { useCallback } from 'react';
import type { StoryExerciseResult } from './types';
import { ScoreTimeInput, ScoreRoundsInput } from './ScoreInputs';
import scoreStyles from './ScoreInputs.module.css';
import styles from './FreeScoreInput.module.css';

type FreeScoreType = NonNullable<StoryExerciseResult['freeScoreType']>;

const SCORE_OPTIONS: Array<{ type: FreeScoreType; label: string }> = [
  { type: 'time', label: 'TIME' },
  { type: 'rounds', label: 'ROUNDS' },
  { type: 'reps', label: 'REPS' },
  { type: 'load', label: 'LOAD' },
];

interface FreeScoreInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

/**
 * Generic score entry for a part whose structure the parser could not classify ('free').
 * The athlete says WHAT they scored (time / rounds / reps / load), then enters the value.
 * Values land in the same result fields the structured kinds use (timeSeconds / rounds /
 * repsTotal / weight), so the save path and poster read them with no special-casing.
 */
export function FreeScoreInput({ result, onChange }: FreeScoreInputProps) {
  const active = result.freeScoreType ?? null;

  const pick = useCallback((type: FreeScoreType) => {
    if (type === result.freeScoreType) return;
    // One authoritative score — switching type clears the previously entered value.
    onChange({
      freeScoreType: type,
      timeSeconds: undefined,
      rounds: undefined,
      repsTotal: undefined,
      weight: undefined,
    });
  }, [onChange, result.freeScoreType]);

  const numericValue = active === 'reps' ? result.repsTotal : active === 'load' ? result.weight : undefined;

  const handleNumeric = useCallback((raw: string) => {
    const value = parseFloat(raw.replace(/[^\d.]/g, ''));
    const valid = Number.isFinite(value) && value > 0;
    if (active === 'reps') {
      onChange({ repsTotal: valid ? Math.round(value) : undefined });
    } else {
      onChange({ weight: valid ? value : undefined });
    }
  }, [active, onChange]);

  return (
    <div className={styles.wrap}>
      <span className={styles.prompt}>What&rsquo;s your score?</span>
      <div className={styles.pickerRow}>
        {SCORE_OPTIONS.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            className={`${styles.pickerChip} ${active === type ? styles.pickerChipActive : ''}`}
            onClick={() => pick(type)}
          >
            {label}
          </button>
        ))}
      </div>

      {active === 'time' && <ScoreTimeInput result={result} onChange={onChange} />}
      {active === 'rounds' && <ScoreRoundsInput result={result} onChange={onChange} />}
      {(active === 'reps' || active === 'load') && (
        <div className={scoreStyles.center}>
          <div className={scoreStyles.timeDrum}>
            <input
              type="text"
              inputMode={active === 'load' ? 'decimal' : 'numeric'}
              pattern="[0-9]*"
              className={scoreStyles.timeDrumInput}
              value={numericValue != null && numericValue > 0 ? String(numericValue) : ''}
              placeholder="0"
              onChange={(e) => handleNumeric(e.target.value)}
            />
            <span className={scoreStyles.timeDrumLabel}>{active === 'reps' ? 'reps' : 'kg'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
